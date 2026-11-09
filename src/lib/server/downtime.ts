import { Ctx, ApiError, clip, iso, json, needUser } from './http';
import { withLock } from './db';

/* Press Downtime Dashboard: the import is split in two so no single request ever needs to carry
   much data — a Vercel Function refuses any request or response body over 4.5 MB.
   - downtimeMeta: one small document (file names, tablet report log, bad-code warnings).
   - downtimeRecords: one row per downtime record, written and read in small batches. Press
     Trace rows keep the client's dedupe key as their _id, so re-sending one already stored is a
     harmless no-op upsert; the production_down_time_report's rows are simply replaced wholesale
     on each new import, matching how the dashboard already treated that file. */

const META_ID = 'current';
const MAX_BATCH = 2000;

/* ---------------- small metadata document ---------------- */
export async function getMeta(c: Ctx) {
  needUser(c);
  const row = await c.s.downtimeMeta.findOne({ _id: META_ID });
  if (!row) return json(200, { data: null, version: 0 });
  let data: unknown = null;
  try { data = JSON.parse(row.v); } catch { /* corrupt — treat as empty */ }
  return json(200, { data, version: row.version });
}

export async function putMeta(c: Ctx) {
  const me = needUser(c);
  const b = await c.json();
  const val = JSON.stringify(b.data ?? null);
  if (val.length > 2 * 1024 * 1024) throw new ApiError(413, 'That is too large to save.');
  const base = Number(c.req.headers.get('x-base-version') || 0);
  const force = c.req.headers.get('x-force') === '1';
  const res = await withLock(async () => {
    const row = await c.s.downtimeMeta.findOne({ _id: META_ID });
    const cur = row ? row.version : 0;
    if (!force && row && base !== cur) return { conflict: { version: cur, by: row.updated_by_name, at: row.updated_at } };
    const version = cur + 1;
    await c.s.downtimeMeta.updateOne({ _id: META_ID }, { $set: { v: val, version, updated_at: iso(), updated_by_name: me.name } }, { upsert: true });
    return { ok: true, version };
  });
  if ('conflict' in res) throw new ApiError(409, 'Somebody else saved a newer import first.', res.conflict);
  return json(200, res);
}

export async function delMeta(c: Ctx) {
  needUser(c);
  await c.s.downtimeMeta.deleteOne({ _id: META_ID });
  return json(200, { ok: true });
}

/* ---------------- records, in batches ---------------- */
const recOut = (r: Record<string, unknown>) => { const { _id, ...rest } = r; return rest; };
const numOf = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export async function listRecords(c: Ctx) {
  needUser(c);
  const skip = Math.max(0, Number(c.query.get('skip') || 0));
  const limit = Math.min(MAX_BATCH, Math.max(1, Number(c.query.get('limit') || MAX_BATCH)));
  const rows = await c.s.downtimeRecords.find().sort({ _id: 1 }).skip(skip).limit(limit).toArray();
  return json(200, { records: rows.map(recOut), more: rows.length === limit });
}

export async function addRecords(c: Ctx) {
  const me = needUser(c);
  const b = await c.json();
  const src: 'PRW' | 'TR' = b.src === 'PRW' ? 'PRW' : 'TR';
  const records: Record<string, unknown>[] = Array.isArray(b.records) ? b.records : [];
  if (records.length > MAX_BATCH) throw new ApiError(413, `Send at most ${MAX_BATCH} records per request.`);
  if (b.replace) await c.s.downtimeRecords.deleteMany({ src: 'PRW' });
  let added = 0;
  if (records.length) {
    // one atomic increment reserves a whole block of ids for this batch, instead of one round-trip per record
    let prwBase = 0;
    if (src === 'PRW') {
      const r = await c.s.counters.findOneAndUpdate({ _id: 'downtime_rec' }, { $inc: { v: records.length } }, { upsert: true, returnDocument: 'after' });
      prwBase = r!.v - records.length;
    }
    const ops = records.map((r, i) => {
      const id = src === 'PRW' ? 'PRW:' + (prwBase + i + 1) : 'TR:' + clip(r.id, 300);
      const doc = {
        _id: id, src, s: numOf(r.s), y: numOf(r.y), m: numOf(r.m), w: numOf(r.w), dw: numOf(r.dw), dd: numOf(r.dd),
        c: clip(r.c, 200), r: clip(r.r, 40), l: clip(r.l, 40), p: clip(r.p, 40), sh: clip(r.sh, 20), n: numOf(r.n), tab: clip(r.tab, 80),
      };
      return { updateOne: { filter: { _id: id }, update: { $setOnInsert: doc }, upsert: true } };
    });
    const result = await c.s.downtimeRecords.bulkWrite(ops, { ordered: false });
    added = result.upsertedCount;
  }
  return json(200, { ok: true, added });
}

export async function clearRecords(c: Ctx) {
  needUser(c);
  await c.s.downtimeRecords.deleteMany({});
  return json(200, { ok: true });
}
