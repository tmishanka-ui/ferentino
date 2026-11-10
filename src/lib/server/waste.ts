import { Ctx, ApiError, iso, json, needUser } from './http';
import { withLock } from './db';
import { sendEmail } from './notify';
import { env } from './env';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/* Backs the Maintenance department's Waste Removing page: one small meta document (critical limits,
   entries, the assigned HR officer, and the date each waste type was last e-mailed about) — see the
   WasteMeta comment in db.ts for why this moved off localStorage. A Vercel Cron Job hits cronAlerts()
   once a day; it is the only endpoint here that is NOT authenticated by a signed-in session. */

const META_ID = 'current';
const MAX_VALUE = 2 * 1024 * 1024; // this page's data is a handful of records; generous sanity cap

export async function getMeta(c: Ctx) {
  needUser(c);
  const row = await c.s.wasteMeta.findOne({ _id: META_ID });
  if (!row) return json(200, { data: null, version: 0 });
  let data: unknown = null;
  try { data = JSON.parse(row.v); } catch { /* corrupt — treat as empty */ }
  return json(200, { data, version: row.version });
}

export async function putMeta(c: Ctx) {
  const me = needUser(c);
  const b = await c.json();
  const val = JSON.stringify(b.data ?? null);
  if (val.length > MAX_VALUE) throw new ApiError(413, 'That is too large to save.');
  const base = Number(c.req.headers.get('x-base-version') || 0);
  const force = c.req.headers.get('x-force') === '1';
  const res = await withLock(async () => {
    const row = await c.s.wasteMeta.findOne({ _id: META_ID });
    const cur = row ? row.version : 0;
    if (!force && row && base !== cur) return { conflict: { version: cur, by: row.updated_by_name, at: row.updated_at } };
    const version = cur + 1;
    await c.s.wasteMeta.updateOne({ _id: META_ID }, { $set: { v: val, version, updated_at: iso(), updated_by_name: me.name } }, { upsert: true });
    return { ok: true, version };
  });
  if ('conflict' in res) throw new ApiError(409, 'Somebody else saved a newer change first.', res.conflict);
  return json(200, res);
}

/* ---------------- daily critical-limit alert (Vercel Cron) ---------------- */

const TYPE_INFO: Record<string, { name: string; unit: string }> = {
  oil: { name: 'Waste Oil', unit: 'barrels' },
  barrels: { name: 'Empty Oil Barrels Issued', unit: 'barrels' },
  ash: { name: 'Boiler Ash', unit: 'buckets' },
};

function currentQty(data: any, t: string): number {
  if (t === 'ash') {
    const active = (data?.ash?.cycles || []).find((cy: any) => !cy.clr);
    return active ? (active.b || []).length : 0;
  }
  return (data?.[t]?.entries || []).filter((e: any) => !e.rem).reduce((s: number, e: any) => s + (Number(e.qty) || 0), 0);
}

/** Called once a day by a Vercel Cron Job — never by a signed-in person, so it checks its own secret
 *  instead of a session. For every waste type currently at or over its critical limit, not yet
 *  e-mailed about today, sends one combined e-mail to the assigned HR officer. */
export async function cronAlerts(c: Ctx) {
  const got = c.req.headers.get('authorization');
  if (!env.cronSecret || got !== `Bearer ${env.cronSecret}`) throw new ApiError(401, 'Not authorized.');

  const row = await c.s.wasteMeta.findOne({ _id: META_ID });
  if (!row) return json(200, { ok: true, sent: 0, reason: 'no waste data saved yet' });
  let data: any;
  try { data = JSON.parse(row.v); } catch { return json(200, { ok: true, sent: 0, reason: 'saved data is corrupt' }); }
  const officer = data?.hrOfficer;
  if (!officer || !officer.email) return json(200, { ok: true, sent: 0, reason: 'no HR officer assigned' });

  const today = iso().slice(0, 10);
  data.notified = data.notified || {};
  const lines: string[] = [];
  for (const t of Object.keys(TYPE_INFO)) {
    const lim = data?.[t]?.limit;
    if (lim == null) continue;
    const cur = currentQty(data, t);
    if (cur < lim) continue;               // not at/over the critical limit
    if (data.notified[t] === today) continue; // already e-mailed today
    const info = TYPE_INFO[t];
    lines.push(`<li><b>${info.name}</b> has exceeded the critical limit (${cur} of ${lim} ${info.unit} stored). Please remove it ASAP.</li>`);
    data.notified[t] = today;
  }
  if (!lines.length) return json(200, { ok: true, sent: 0 });

  const html = `<p>Hello ${esc(officer.name || '')},</p>
<p>The following waste type${lines.length > 1 ? 's have' : ' has'} exceeded its critical limit in the Maintenance department's Waste Removing record. Please arrange removal as soon as possible.</p>
<ul>${lines.join('')}</ul>
<p>This e-mail repeats once a day until each item is marked as removed in the system.</p>
<p style="color:#777;font-size:12px">This is an automated message from the Ferentino Maintenance Department Waste Removing system.</p>`;
  await sendEmail(officer.email, 'Waste critical limit exceeded — action needed', html);
  await c.s.wasteMeta.updateOne({ _id: META_ID }, { $set: { v: JSON.stringify(data), version: row.version + 1, updated_at: iso(), updated_by_name: 'daily alert' } });
  return json(200, { ok: true, sent: lines.length });
}
