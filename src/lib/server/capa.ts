import { Ctx, ApiError, iso, json, needUser } from './http';
import { withLock, Store } from './db';

/* Backs the CAPA platform's own storage: a small "meta" document (issues, action plans, preventive
   forms, numbering) plus one document per shift (the part that grows without bound — see the
   CapaMeta/CapaShift comment in db.ts). The CAPA platform used to save as one blob under the
   localStorage key "fitl_capa_v1", which the generic localStorage sync also mirrored into the
   data_items collection — migrateFromLegacy() reads that last-synced copy once, the first time this
   collection is used, so existing issues/actions/shifts are not lost. */

const META_ID = 'current';
const MAX_VALUE = 2 * 1024 * 1024; // meta (everything but shifts) is a handful of records; this is a sanity cap
const MAX_BATCH = 1000;

async function migrateFromLegacy(s: Store) {
  const legacy = await s.items.findOne({ _id: 'fitl_capa_v1', deleted: { $ne: true } });
  if (!legacy || !legacy.v) return;
  let parsed: unknown;
  try { parsed = JSON.parse(legacy.v); } catch { return; }
  if (!parsed || typeof parsed !== 'object') return;
  const full = parsed as Record<string, unknown>;
  const shifts = Array.isArray(full.shifts) ? full.shifts : [];
  const meta = { ...full };
  delete meta.shifts;
  for (let i = 0; i < shifts.length; i += MAX_BATCH) {
    const ops = shifts.slice(i, i + MAX_BATCH).map((sh: any) => ({
      updateOne: {
        filter: { _id: String(sh?.key ?? '') },
        update: { $set: { date: String(sh?.date ?? ''), shiftCode: String(sh?.shiftCode ?? ''), shiftLabel: String(sh?.shiftLabel ?? ''), controller: String(sh?.controller ?? ''), risks: Array.isArray(sh?.risks) ? sh.risks : [] } },
        upsert: true,
      },
    })).filter((op) => op.updateOne.filter._id);
    if (ops.length) await s.capaShifts.bulkWrite(ops, { ordered: false });
  }
  await s.capaMeta.updateOne({ _id: META_ID }, { $set: { v: JSON.stringify(meta), version: 1, updated_at: iso(), updated_by_name: 'migration' } }, { upsert: true });
}

export async function getMeta(c: Ctx) {
  needUser(c);
  let row = await c.s.capaMeta.findOne({ _id: META_ID });
  if (!row) {
    await withLock(async () => {
      if (await c.s.capaMeta.findOne({ _id: META_ID })) return;
      await migrateFromLegacy(c.s);
    });
    row = await c.s.capaMeta.findOne({ _id: META_ID });
  }
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
    const row = await c.s.capaMeta.findOne({ _id: META_ID });
    const cur = row ? row.version : 0;
    if (!force && row && base !== cur) return { conflict: { version: cur, by: row.updated_by_name, at: row.updated_at } };
    const version = cur + 1;
    await c.s.capaMeta.updateOne({ _id: META_ID }, { $set: { v: val, version, updated_at: iso(), updated_by_name: me.name } }, { upsert: true });
    return { ok: true, version };
  });
  if ('conflict' in res) throw new ApiError(409, 'Somebody else saved a newer change first.', res.conflict);
  return json(200, res);
}

export async function listShifts(c: Ctx) {
  needUser(c);
  const skip = Math.max(0, Number(c.query.get('skip') || 0));
  const limit = Math.min(MAX_BATCH, Math.max(1, Number(c.query.get('limit') || MAX_BATCH)));
  const rows = await c.s.capaShifts.find().sort({ _id: 1 }).skip(skip).limit(limit).toArray();
  return json(200, { shifts: rows, more: rows.length === limit });
}

export async function putShifts(c: Ctx) {
  needUser(c);
  const b = await c.json();
  const shifts: Record<string, unknown>[] = Array.isArray(b.shifts) ? b.shifts : [];
  if (shifts.length > MAX_BATCH) throw new ApiError(413, `Send at most ${MAX_BATCH} shifts per request.`);
  if (b.replace) await c.s.capaShifts.deleteMany({});
  if (shifts.length) {
    const ops = shifts.map((sh) => ({
      updateOne: {
        filter: { _id: String(sh.key ?? '') },
        update: { $set: { date: String(sh.date ?? ''), shiftCode: String(sh.shiftCode ?? ''), shiftLabel: String(sh.shiftLabel ?? ''), controller: String(sh.controller ?? ''), risks: Array.isArray(sh.risks) ? sh.risks : [] } },
        upsert: true,
      },
    })).filter((op) => op.updateOne.filter._id);
    if (ops.length) await c.s.capaShifts.bulkWrite(ops, { ordered: false });
  }
  return json(200, { ok: true });
}
