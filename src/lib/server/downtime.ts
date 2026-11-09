import { Ctx, ApiError, iso, json, needUser } from './http';
import { withLock } from './db';

/* Press Downtime Dashboard: the imported workbook data lives in its own single-document
   collection, not the generic data_items/localStorage sync, because it can be far larger than
   what a browser's localStorage (shared with every other section) can hold. See db.ts. */

const DOC_ID = 'current';
const MAX_BYTES = 20 * 1024 * 1024;
const parseVersion = (s: string | null) => { const n = Number((s ?? '').trim()); return Number.isFinite(n) ? Math.trunc(n) : 0; };

export async function get(c: Ctx) {
  needUser(c);
  const row = await c.s.downtime.findOne({ _id: DOC_ID });
  if (!row) return json(200, { data: null, version: 0 });
  let data: unknown = null;
  try { data = JSON.parse(row.v); } catch { /* corrupt — treat as empty */ }
  return json(200, { data, version: row.version });
}

export async function put(c: Ctx) {
  const me = needUser(c);
  const b = await c.json();
  const val = JSON.stringify(b.data ?? null);
  if (val.length > MAX_BYTES) throw new ApiError(413, `That is too large to save (the limit is ${Math.round(MAX_BYTES / 1048576)} MB).`);
  const base = parseVersion(c.req.headers.get('x-base-version'));
  const force = c.req.headers.get('x-force') === '1';
  const res = await withLock(async () => {
    const row = await c.s.downtime.findOne({ _id: DOC_ID });
    const cur = row ? row.version : 0;
    if (!force && row && base !== cur) return { conflict: { version: cur, by: row.updated_by_name, at: row.updated_at } };
    const version = cur + 1;
    await c.s.downtime.updateOne({ _id: DOC_ID }, { $set: { v: val, version, updated_at: iso(), updated_by_name: me.name } }, { upsert: true });
    return { ok: true, version };
  });
  if ('conflict' in res) throw new ApiError(409, 'Somebody else saved a newer import first.', res.conflict);
  return json(200, res);
}

export async function del(c: Ctx) {
  needUser(c);
  await c.s.downtime.deleteOne({ _id: DOC_ID });
  return json(200, { ok: true });
}
