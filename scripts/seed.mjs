// Fills the database with demonstration data, so the pages have something to show.
//
//   npm run seed              adds what is missing, leaves everything that already exists alone
//   npm run seed -- --reset   first removes what an earlier seed made, then adds it again
//   npm run seed -- --force   overwrites the demonstration records even if somebody has changed them
//
// It reads MONGODB_URI / MONGODB_DB from .env.local (or the environment) and writes in exactly the form the
// application writes: the working apps pick the records up the next time somebody signs in.
import fs from 'node:fs';
import path from 'node:path';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { MongoClient } from 'mongodb';

const args = new Set(process.argv.slice(2));
const RESET = args.has('--reset'), FORCE = args.has('--force');

/* ---------- settings ---------- */
for (const f of ['.env.local', '.env']) {
  const p = path.resolve(f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB = process.env.MONGODB_DB || 'ferentino';
const DEMO_PASSWORD = process.env.SEED_PASSWORD || 'Demo2026pw';

/* ---------- helpers ---------- */
const iso = (d = new Date()) => d.toISOString();
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
const hashPassword = (pw) => { const salt = randomBytes(16); return `pbkdf2$210000$${salt.toString('hex')}$${pbkdf2Sync(pw, salt, 210000, 32, 'sha256').toString('hex')}`; };
const sha256 = (s) => import('node:crypto').then((c) => c.createHash('sha256').update(s, 'utf8').digest('hex'));

const client = new MongoClient(URI, { serverSelectionTimeoutMS: 8000 });
try { await client.connect(); } catch (e) {
  console.error(`\nCould not reach MongoDB at ${URI}\n${e.message}\nStart MongoDB first (README step 3) and check MONGODB_URI in .env.local.`);
  process.exit(1);
}
const db = client.db(DB);
const users = db.collection('users'), counters = db.collection('counters'), items = db.collection('data_items'),
  signatures = db.collection('signatures'), audit = db.collection('audit_log');

const nextId = async (name) => (await counters.findOneAndUpdate({ _id: name }, { $inc: { v: 1 } }, { upsert: true, returnDocument: 'after' })).v;

/* ---------- the demonstration people ---------- */
const PEOPLE = [
  { email: 'nimal.perera@ferentino.demo', name: 'Nimal Perera', designation: 'Quality Manager', department: 'Quality', role: 'manager' },
  { email: 'kumari.silva@ferentino.demo', name: 'Kumari Silva', designation: 'Production Executive', department: 'Production', role: 'executive' },
  { email: 'ruwan.fernando@ferentino.demo', name: 'Ruwan Fernando', designation: 'Maintenance Manager', department: 'Maintenance', role: 'manager' },
];

/* ---------- Accident Registry (fitl_accidents_v1) ---------- */
const ACC = [
  [3, '08:40', 'A', 'Production – Curing', 'Press hall 2', 'S. Jayasuriya', 'E1042', 'Press operator', 'fa', 0, 'Wrist / hand', 'Burn / scald', 'Hot surface / steam', 'Touched the hot platen while loading a mould.', 'Heat-resistant gloves issued; platen guard checked.', 'Closed'],
  [9, '14:15', 'B', 'Production – Tyre Building', 'Building machine 4', 'M. Rajapaksa', 'E0871', 'Builder', 'mt', 0, 'Finger', 'Cut / laceration', 'Machine / moving part', 'Finger caught between the bead ring and the drum.', 'Two-hand guard fitted on drum; toolbox talk given.', 'Closed'],
  [17, '22:05', 'C', 'Maintenance', 'Boiler house', 'P. Wijesinghe', 'E0455', 'Fitter', 'fa', 0, 'Eye', 'Foreign body', 'Falling object', 'Rust particle in the eye while cleaning a duct.', 'Safety goggles mandatory sign installed.', 'Closed'],
  [26, '10:30', 'A', 'Production – Mixing', 'Banbury 1', 'D. Gunasekara', 'E1190', 'Mixer operator', 'lt', 3, 'Back', 'Sprain / strain', 'Material handling', 'Back strain while lifting a 25 kg chemical bag.', 'Trolley provided; manual-handling training scheduled.', 'Open'],
  [38, '16:50', 'B', 'Stores', 'Raw material store', 'T. Bandara', 'E0632', 'Storekeeper', 'fa', 0, 'Ankle / foot', 'Bruise', 'Slip, trip or fall', 'Tripped over a pallet edge in the aisle.', 'Aisle marking repainted; pallets kept inside the line.', 'Closed'],
  [51, '03:20', 'C', 'Production – Curing', 'Press hall 1', 'K. Dissanayake', 'E1311', 'Curing assistant', 'mt', 0, 'Arm', 'Burn / scald', 'Hot surface / steam', 'Steam leak from a hose coupling touched the forearm.', 'Coupling replaced; hose inspection added to weekly PM.', 'Closed'],
  [64, '11:10', 'A', 'Quality', 'Final inspection', 'R. Kumara', 'E0987', 'Inspector', 'fa', 0, 'Toe', 'Bruise', 'Struck by object', 'Tyre rolled onto the foot during inspection.', 'Steel-toe shoes compliance checked.', 'Closed'],
  [79, '09:00', 'B', 'Production – Tyre Building', 'Building machine 2', 'N. Herath', 'E1004', 'Builder', 'fa', 0, 'Head', 'Bruise', 'Falling object', 'Hit head on the open guard door.', 'Guard door stop fitted.', 'Closed'],
];
const accidents = ACC.map((a, i) => ({
  id: 'seed-a' + (i + 1), date: ymd(daysAgo(a[0])), time: a[1], shift: a[2], dept: a[3], area: a[4], name: a[5], epf: a[6], job: a[7], sev: a[8], lost: a[9],
  body: a[10], nature: a[11], cause: a[12], desc: a[13], action: a[14], ref: 'ACC-' + String(i + 1).padStart(3, '0'), by: 'Nimal Perera', status: a[15],
}));

/* ---------- Document Control (fitl_dc) ---------- */
const pad = (n) => String(n).padStart(2, '0');
const DOCS = [
  // sys, type, dept, serial, title, class, owner, issue, rev, list, store, retention, daysAgo
  ['Q', 'QP', 'GEN', 1, 'Quality Policy', 'INO', 'All sections', 1, 0, 'D', 'QA office', '', 400],
  ['E', 'EP', 'GEN', 1, 'Environmental Policy', 'INO', 'All sections', 1, 0, 'D', 'QA office', '', 400],
  ['Q', 'QM', 'GEN', 1, 'Quality Manual', 'INO', 'All sections', 2, 1, 'D', 'QA office', '', 120],
  ['Q', 'QSP', 'QA', 1, 'Control of Documents', 'INO', 'Quality, Production', 1, 2, 'D', 'QA office', '', 210],
  ['Q', 'QSP', 'QA', 2, 'Control of Records', 'INO', 'Quality, Production', 1, 0, 'D', 'QA office', '', 210],
  ['Q', 'WI', 'MIX', 1, 'Banbury Mixing', 'INO', 'Mixing', 1, 3, 'D', 'Mixing office', '', 90],
  ['Q', 'WI', 'TBS', 1, 'Tyre Building Inspection', 'INO', 'Tyre building', 2, 0, 'D', 'Tyre building office', '', 60],
  ['G', 'WI', 'MNT', 1, 'Press Daily Maintenance Check', 'INO', 'Maintenance', 1, 1, 'D', 'Maintenance office', '', 45],
  ['Q', 'FO', 'QA', 1, 'Shift Quality Report', 'INO', 'Quality', 1, 0, 'R', 'QA office, file cabinet 2', '3 years', 150],
  ['Q', 'RG', 'QA', 2, 'Customer Complaint Register', 'CON', 'Quality, Export', 1, 0, 'R', 'QA office', '5 years', 150],
  ['E', 'CL', 'MNT', 1, 'Boiler House Safety Check List', 'INO', 'Maintenance', 1, 0, 'R', 'Boiler house', '2 years', 30],
];
const T_ISREC = new Set(['FO', 'RG', 'CL', 'PL']);
const COMPANY = new Set(['QP', 'EP', 'QM', 'EM', 'PM']);
const docs = DOCS.map((d, i) => {
  const [sys, type, dept, serial, title, cls, owner, issue, rev, list, store, ret, ago] = d;
  const no = 'FIT/' + sys + '/' + type + '-' + (COMPANY.has(type) ? '' : dept + '-') + pad(serial);
  const dt = ymd(daysAgo(ago)), first = ymd(daysAgo(ago + 200));
  const hist = [{ issue: 1, rev: 0, date: first, desc: 'Initial issue', cr: '' }];
  for (let r = 1; r <= rev; r++) hist.push({ issue, rev: r, date: ymd(daysAgo(ago + 20 * (rev - r))), desc: 'Revision ' + r + ' — wording and layout updated', cr: 'CR-' + pad(i + r) });
  return { id: 'seed-d' + (i + 1), no, sys, type, dept, serial, title, cls, owner, issue, rev, issueDate: first, revDate: dt, list, store, ret, disp: 'Shredding', status: 'A', hist };
});

/* ---------- Shift Groups (fitl_shiftgroups_v1) ---------- */
const NAMES = ['S. Jayasuriya', 'M. Rajapaksa', 'P. Wijesinghe', 'D. Gunasekara', 'T. Bandara', 'K. Dissanayake', 'R. Kumara', 'N. Herath', 'A. Perera', 'C. Mendis',
  'H. Liyanage', 'J. Samarasinghe', 'L. Abeywickrama', 'U. Karunaratne', 'W. Ekanayake', 'B. Senanayake', 'G. Ratnayake', 'V. Gamage', 'F. Weerasinghe', 'Y. Amarasinghe'];
const GROUPS = ['A', 'B', 'C', 'MIX', 'BASE'];
const POOL = {}, ASSIGN = {};
NAMES.forEach((n, i) => {
  const no = 'E' + String(1000 + i * 7);
  POOL[no] = { name: n, loc: i % 3 === 0 ? 'Curing' : i % 3 === 1 ? 'Tyre Building' : 'Mixing', manual: true };
  ASSIGN[no] = { g: GROUPS[i % 5], role: 'member' };
});

/* the records, keyed the way the working apps store them */
const RECORDS = {
  fitl_accidents_v1: JSON.stringify(accidents),
  fitl_accidents_target_v1: '4',
  fitl_dc: JSON.stringify({ docs }),
  fitl_shiftgroups_v1: JSON.stringify({ POOL, ASSIGN }),
};

/* ---------- reset ---------- */
if (RESET) {
  const del = await users.deleteMany({ email: { $in: PEOPLE.map((p) => p.email) } });
  const sig = await signatures.deleteMany({ ref: /^SEED:/ });
  const aud = await audit.deleteMany({ detail: /^\[seed\]/ });
  const it = await items.deleteMany({ _id: { $in: Object.keys(RECORDS) }, updated_by_name: 'Seeder' });
  console.log(`Reset: ${del.deletedCount} people, ${sig.deletedCount} signatures, ${aud.deletedCount} log entries, ${it.deletedCount} records removed.`);
}

/* ---------- write ---------- */
const report = [];

for (const p of PEOPLE) {
  if (await users.findOne({ email: p.email })) { report.push(`person ${p.email}: already there`); continue; }
  await users.insertOne({
    _id: await nextId('users'), ...p, pass_hash: hashPassword(DEMO_PASSWORD), must_change: false, active: true, failed: 0, locked_until: 0,
    reset_requested_at: null, created_at: iso(), last_login: null,
  });
  report.push(`person ${p.email}: added`);
}

for (const [key, value] of Object.entries(RECORDS)) {
  const row = await items.findOne({ _id: key });
  if (row && !row.deleted && row.updated_by_name !== 'Seeder' && !FORCE) { report.push(`record ${key}: kept (it already holds somebody's data; use --force to overwrite)`); continue; }
  if (row && !row.deleted && row.v === value) { report.push(`record ${key}: already seeded`); continue; }
  const version = row ? row.version + 1 : 1, seq = await nextId('seq');
  await items.updateOne({ _id: key }, { $set: { v: value, version, seq, deleted: false, updated_at: iso(), updated_by: null, updated_by_name: 'Seeder' } }, { upsert: true });
  report.push(`record ${key}: ${row ? 'updated' : 'added'}`);
}

// a few signatures and log entries, so the Signature log and Audit log have something in them
if (!(await signatures.findOne({ ref: /^SEED:/ }))) {
  const nimal = await users.findOne({ email: PEOPLE[0].email });
  for (const [i, d] of docs.slice(0, 4).entries()) {
    const when = iso(daysAgo(10 + i * 9));
    await signatures.insertOne({
      _id: await nextId('signatures'), user_id: nimal._id, name: nimal.name, designation: nimal.designation, department: nimal.department, email: nimal.email,
      purpose: 'Approve ' + (d.rev ? 'revision ' + d.rev : 'issue ' + d.issue), ref: 'SEED: ' + d.no, content_hash: await sha256(d.no + d.title), signed_at: when, ip: 'seed',
    });
    await audit.insertOne({ at: when, user_id: nimal._id, action: 'signed', detail: '[seed] Approve — ' + d.no, ip: 'seed' });
  }
  report.push('signatures: 4 added');
} else report.push('signatures: already there');

console.log(`\nSeeded database "${DB}" at ${URI}\n  ` + report.join('\n  '));
console.log(`\nDemonstration people sign in with the password  ${DEMO_PASSWORD}\n  ${PEOPLE.map((p) => p.email).join('\n  ')}`);
console.log('\nOpen the site, sign in, and the Accident Registry, Document Control / Document Library, Shift Groups and the Signature log show the data.');
console.log('Browsers that already hold their own saved data for a page are asked which copy to keep.\n');
await client.close();
