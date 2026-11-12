import { Ctx, ApiError, iso, json, needUser } from './http';
import { withLock } from './db';

/* Backs the Document Control System's register (public/apps/doccontrol.html) and the read-only
   Document Library view beside it (public/apps/library.html) — one small meta document holding
   the whole register as JSON text. See the DocControlMeta comment in db.ts for why this moved
   off localStorage. */

const META_ID = 'current';
const MAX_VALUE = 8 * 1024 * 1024; // the register itself (file content lives elsewhere); generous sanity cap

export async function getMeta(c: Ctx) {
  needUser(c);
  const row = await c.s.docControlMeta.findOne({ _id: META_ID });
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
    const row = await c.s.docControlMeta.findOne({ _id: META_ID });
    const cur = row ? row.version : 0;
    if (!force && row && base !== cur) return { conflict: { version: cur, by: row.updated_by_name, at: row.updated_at } };
    const version = cur + 1;
    await c.s.docControlMeta.updateOne({ _id: META_ID }, { $set: { v: val, version, updated_at: iso(), updated_by_name: me.name } }, { upsert: true });
    return { ok: true, version };
  });
  if ('conflict' in res) throw new ApiError(409, 'Somebody else saved a newer change first.', res.conflict);
  return json(200, res);
}
