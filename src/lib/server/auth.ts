import { env } from './env';
import { Ctx, ApiError, clip, iso, json, needAdmin, needUser, now, setCookie, str } from './http';
import { Store, User, Signature, nextId } from './db';
import { checkPassword, hashPassword, policy, resetCode, sha256, tempPassword, token } from './security';

const MAX_FAILS = 5, LOCK_MINUTES = 15;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['admin', 'executive', 'manager'];
const HITS = new Map<string, { n: number; until: number }>();
let dummyHash: Promise<string> | null = null;   // unknown e-mails take as long as real ones

export async function log(s: Store, userId: number | null, action: string, detail: string, ip: string) {
  try { await s.audit.insertOne({ at: iso(), user_id: userId, action, detail: clip(detail, 480), ip }); }
  catch (e) { console.error('audit log failed:', e); }
}

const publicUser = (u: User) => ({
  id: u._id, name: u.name, email: u.email, designation: u.designation, department: u.department, role: u.role, mustChange: !!u.must_change,
});

async function adminContact(s: Store): Promise<string> {
  if (env.adminEmail) return env.adminEmail;
  const a = await s.users.find({ role: 'admin', active: true }).sort({ _id: 1 }).limit(1).next();
  return a ? a.email : '';
}

function limited(c: Ctx): boolean {
  const t = now();
  let h = HITS.get(c.ip);
  if (!h || t > h.until) h = { n: 0, until: t + 15 * 60000 };
  h.n++;
  HITS.set(c.ip, h);
  if (HITS.size > 5000) for (const [k, v] of HITS) if (t > v.until) HITS.delete(k);
  return h.n > 40;
}

interface Tried { ok: boolean; locked: boolean; mins: number; left: number }

/** password check shared by sign-in, changing the password and signing: counts wrong tries and locks the account for a while */
async function tryPassword(c: Ctx, u: User, pw: string, what: string): Promise<Tried> {
  const r: Tried = { ok: false, locked: false, mins: 0, left: 0 };
  if (u.locked_until > now()) { r.locked = true; r.mins = Math.ceil((u.locked_until - now()) / 60000); return r; }
  if (await checkPassword(pw, u.pass_hash)) {
    if (u.failed > 0) await c.s.users.updateOne({ _id: u._id }, { $set: { failed: 0 } });
    r.ok = true;
    return r;
  }
  const f = u.failed + 1;
  if (f >= MAX_FAILS) {
    await c.s.users.updateOne({ _id: u._id }, { $set: { failed: 0, locked_until: now() + LOCK_MINUTES * 60000 } });
    await log(c.s, u._id, 'locked', what, c.ip);
    r.locked = true; r.mins = LOCK_MINUTES;
    return r;
  }
  await c.s.users.updateOne({ _id: u._id }, { $set: { failed: f } });
  await log(c.s, u._id, 'wrong-password', what, c.ip);
  r.left = MAX_FAILS - f;
  return r;
}

const lockMsg = (r: Tried) => `Too many wrong passwords. This account is locked for ${r.mins} minute${r.mins === 1 ? '' : 's'}.`;
const triesLeft = (n: number) => (n <= 2 ? ` ${n} tr${n === 1 ? 'y' : 'ies'} left before the account is locked.` : '');

/* ---------------- routes ---------------- */
export async function me(c: Ctx) {
  return json(200, { server: true, data: true, adminEmail: await adminContact(c.s), user: c.user ? publicUser(c.user) : null });
}

export async function login(c: Ctx) {
  if (limited(c)) throw new ApiError(429, 'Too many attempts from this computer. Wait a few minutes.');
  const b = await c.json();
  const email = clip(b.email, 200).toLowerCase(), pw = str(b.password);
  const u = await c.s.users.findOne({ email, active: true });
  if (!u) {
    await checkPassword(pw, await (dummyHash ??= hashPassword('not-a-real-password')));
    await log(c.s, null, 'sign-in-unknown-email', clip(email, 80), c.ip);
    throw new ApiError(401, 'Wrong e-mail or password.');
  }
  const r = await tryPassword(c, u, pw, 'sign-in');
  if (r.locked) throw new ApiError(423, lockMsg(r));
  if (!r.ok) throw new ApiError(401, 'Wrong e-mail or password.' + triesLeft(r.left));
  const t = token();
  await c.s.sessions.deleteMany({ expires_at: { $lt: now() } });
  await c.s.sessions.insertOne({ _id: sha256(t), user_id: u._id, created_at: now(), expires_at: now() + env.sessionHours * 3600_000 });
  await c.s.users.updateOne({ _id: u._id }, { $set: { last_login: iso() } });
  await log(c.s, u._id, 'sign-in', '', c.ip);
  const res = json(200, { user: publicUser(u) });
  setCookie(res, t, env.sessionHours * 3600);
  return res;
}

export async function logout(c: Ctx) {
  if (c.sid) await c.s.sessions.deleteOne({ _id: c.sid });
  if (c.user) await log(c.s, c.user._id, 'sign-out', '', c.ip);
  const res = json(200, { ok: true });
  setCookie(res, '', 0);
  return res;
}

export async function password(c: Ctx) {
  const u = needUser(c), b = await c.json();
  const cur = str(b.current), nw = str(b.next);
  const r = await tryPassword(c, u, cur, 'change password');
  if (r.locked) throw new ApiError(423, lockMsg(r));
  if (!r.ok) throw new ApiError(401, 'The current password is wrong.');
  const bad = policy(nw, u.email);
  if (bad) throw new ApiError(400, bad);
  if (nw === cur) throw new ApiError(400, 'Choose a password that is different from the current one.');
  await c.s.users.updateOne({ _id: u._id }, { $set: { pass_hash: await hashPassword(nw), must_change: false } });
  await log(c.s, u._id, 'password-changed', '', c.ip);
  return json(200, { ok: true });
}

export async function forgot(c: Ctx) {
  if (limited(c)) throw new ApiError(429, 'Too many attempts. Wait a few minutes.');
  const email = clip((await c.json()).email, 200).toLowerCase();
  const u = await c.s.users.findOne({ email, active: true });
  if (u) {
    await c.s.users.updateOne({ _id: u._id }, { $set: { reset_requested_at: iso() } });
    await log(c.s, u._id, 'reset-requested', '', c.ip);
  }
  return json(200, { ok: true, adminEmail: await adminContact(c.s) });   // the same answer whether or not the address exists
}

export async function reset(c: Ctx) {
  if (limited(c)) throw new ApiError(429, 'Too many attempts. Wait a few minutes.');
  const b = await c.json();
  const email = clip(b.email, 200).toLowerCase(), code = str(b.code).trim().toUpperCase().replace(/\s+/g, ''), nw = str(b.next);
  const bad = policy(nw, email);
  if (bad) throw new ApiError(400, bad);
  const u = await c.s.users.findOne({ email, active: true });
  // marking the code as used is the single atomic step, so one code can never work twice
  const used = u ? await c.s.resets.findOneAndUpdate({ user_id: u._id, used: false, expires_at: { $gt: now() }, code_hash: sha256(code) }, { $set: { used: true } }) : null;
  if (!u || !used) throw new ApiError(400, 'That reset code is wrong or has expired. Ask the administrator for a new one.');
  await c.s.users.updateOne({ _id: u._id }, { $set: { pass_hash: await hashPassword(nw), must_change: false, failed: 0, locked_until: 0, reset_requested_at: null } });
  await c.s.sessions.deleteMany({ user_id: u._id });
  await log(c.s, u._id, 'password-reset', 'with a one-time code', c.ip);
  return json(200, { ok: true });
}

/* ---------------- administrator: people ---------------- */
const userOut = (u: User) => ({
  id: u._id, email: u.email, name: u.name, designation: u.designation, department: u.department, role: u.role, active: !!u.active,
  mustChange: !!u.must_change, locked: u.locked_until > now(), resetRequested: u.reset_requested_at, createdAt: u.created_at, lastLogin: u.last_login,
});

export async function users(c: Ctx) {
  needAdmin(c);
  const list = await c.s.users.find().sort({ active: -1, role: 1, name: 1 }).toArray();
  return json(200, { users: list.map(userOut) });
}

export async function addUser(c: Ctx) {
  const admin = needAdmin(c), b = await c.json();
  const email = clip(b.email, 200).toLowerCase(), name = clip(b.name, 120), role = str(b.role);
  if (!EMAIL.test(email)) throw new ApiError(400, 'Enter a valid e-mail address.');
  if (!name) throw new ApiError(400, 'Enter the name.');
  if (!ROLES.includes(role)) throw new ApiError(400, 'Choose a role.');
  if (await c.s.users.findOne({ email })) throw new ApiError(409, 'There is already a person with that e-mail address.');
  const pw = tempPassword();
  const doc: User = {
    _id: await nextId(c.s, 'users'), email, name, designation: clip(b.designation, 120), department: clip(b.department, 120), role: role as User['role'],
    pass_hash: await hashPassword(pw), must_change: true, active: true, failed: 0, locked_until: 0, reset_requested_at: null, created_at: iso(), last_login: null,
  };
  try { await c.s.users.insertOne(doc); }
  catch (e: any) { if (e?.code === 11000) throw new ApiError(409, 'There is already a person with that e-mail address.'); throw e; }
  await log(c.s, admin._id, 'user-added', `${email} (${role})`, c.ip);
  return json(200, { user: userOut(doc), tempPassword: pw });
}

export async function editUser(c: Ctx) {
  const admin = needAdmin(c), b = await c.json();
  const id = Number(c.params.id);
  const u = await c.s.users.findOne({ _id: id });
  if (!u) throw new ApiError(404, 'Person not found.');
  const email = 'email' in b ? clip(b.email, 200).toLowerCase() : u.email;
  const name = 'name' in b ? clip(b.name, 120) : u.name;
  const role = 'role' in b ? str(b.role) : u.role;
  const active = 'active' in b ? !!b.active : u.active;
  if (!EMAIL.test(email) || !name || !ROLES.includes(role)) throw new ApiError(400, 'Check the name, e-mail address and role.');
  if (email !== u.email && await c.s.users.findOne({ email, _id: { $ne: id } })) throw new ApiError(409, 'There is already a person with that e-mail address.');
  const admins = await c.s.users.countDocuments({ role: 'admin', active: true, _id: { $ne: id } });
  if (u.role === 'admin' && u.active && (role !== 'admin' || !active) && admins === 0) throw new ApiError(400, 'There must always be at least one active administrator.');
  await c.s.users.updateOne({ _id: id }, { $set: {
    email, name, role: role as User['role'], active,
    designation: 'designation' in b ? clip(b.designation, 120) : u.designation,
    department: 'department' in b ? clip(b.department, 120) : u.department,
  } });
  if (!active) await c.s.sessions.deleteMany({ user_id: id });
  await log(c.s, admin._id, 'user-changed', email + (u.active && !active ? ' (deactivated)' : ''), c.ip);
  return json(200, { user: userOut((await c.s.users.findOne({ _id: id }))!) });
}

export async function resetCodeFor(c: Ctx) {
  const admin = needAdmin(c);
  const id = Number(c.params.id);
  const u = await c.s.users.findOne({ _id: id, active: true });
  if (!u) throw new ApiError(404, 'Person not found.');
  const code = resetCode(), exp = now() + 48 * 3600_000;
  await c.s.resets.updateMany({ user_id: id, used: false }, { $set: { used: true } });
  await c.s.resets.insertOne({ _id: await nextId(c.s, 'resets'), user_id: id, code_hash: sha256(code), expires_at: exp, used: false });
  await log(c.s, admin._id, 'reset-code-issued', u.email, c.ip);
  return json(200, { code, expiresAt: new Date(exp).toISOString(), email: u.email, name: u.name });
}

export async function tempPasswordFor(c: Ctx) {
  const admin = needAdmin(c);
  const id = Number(c.params.id);
  const u = await c.s.users.findOne({ _id: id, active: true });
  if (!u) throw new ApiError(404, 'Person not found.');
  const pw = tempPassword();
  await c.s.users.updateOne({ _id: id }, { $set: { pass_hash: await hashPassword(pw), must_change: true, failed: 0, locked_until: 0, reset_requested_at: null } });
  await c.s.sessions.deleteMany({ user_id: id });
  await log(c.s, admin._id, 'temp-password-set', u.email, c.ip);
  return json(200, { tempPassword: pw, email: u.email, name: u.name });
}

export async function auditLog(c: Ctx) {
  needAdmin(c);
  const rows = await c.s.audit.find().sort({ _id: -1 }).limit(300).toArray();
  const ids = [...new Set(rows.map((r) => r.user_id).filter((x): x is number => x != null))];
  const emails = new Map((await c.s.users.find({ _id: { $in: ids } }).toArray()).map((u) => [u._id, u.email]));
  return json(200, { log: rows.map((r) => ({ at: r.at, action: r.action, detail: r.detail, ip: r.ip, email: r.user_id == null ? null : emails.get(r.user_id) ?? null })) });
}

/* ---------------- electronic signatures ---------------- */
const sigOut = (s: Signature) => ({
  id: s._id, name: s.name, designation: s.designation, department: s.department, email: s.email, purpose: s.purpose, ref: s.ref, contentHash: s.content_hash, at: s.signed_at,
});

export async function sign(c: Ctx) {
  const u = needUser(c), b = await c.json();
  const purpose = clip(b.purpose, 200), ref = clip(b.ref, 200), hash = clip(b.contentHash, 128);
  if (!purpose || !ref) throw new ApiError(400, 'Nothing to sign.');
  if (u.must_change) throw new ApiError(403, 'Change your temporary password first.');
  const r = await tryPassword(c, u, str(b.password), 'signing');
  if (r.locked) throw new ApiError(423, lockMsg(r));
  if (!r.ok) throw new ApiError(401, 'Wrong password.' + triesLeft(r.left));
  const doc: Signature = {
    _id: await nextId(c.s, 'signatures'), user_id: u._id, name: u.name, designation: u.designation, department: u.department, email: u.email,
    purpose, ref, content_hash: hash, signed_at: iso(), ip: c.ip,
  };
  await c.s.signatures.insertOne(doc);
  await log(c.s, u._id, 'signed', `${purpose} — ${ref}`, c.ip);
  return json(200, { signature: sigOut(doc) });
}

export async function signatures(c: Ctx) {
  needUser(c);
  const ref = clip(c.query.get('ref'), 200);
  const rows = await c.s.signatures.find(ref ? { ref } : {}).sort({ _id: -1 }).limit(ref ? 100 : 200).toArray();
  return json(200, { signatures: rows.map(sigOut) });
}

export async function signature(c: Ctx) {
  needUser(c);
  const s = await c.s.signatures.findOne({ _id: Number(c.params.id) });
  if (!s) throw new ApiError(404, 'No such signature.');
  return json(200, { signature: sigOut(s) });
}

export async function health(c: Ctx) {
  await c.s.db.command({ ping: 1 });
  return json(200, { ok: true, database: true });
}
