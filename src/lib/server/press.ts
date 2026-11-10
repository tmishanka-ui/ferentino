import { Ctx, ApiError, iso, json, needUser } from './http';

/* Backs the Press Monitoring Dashboard's own key/value storage (one "index" document, one
   document per saved shift). See the PressKv comment in db.ts for why this has its own
   collection instead of going through the generic localStorage sync. */

const MAX_VALUE = 2 * 1024 * 1024; // a single shift's readings are tiny; this is just a sanity cap

export async function getKv(c: Ctx) {
  needUser(c);
  const key = (c.query.get('key') || '').trim();
  if (!key) throw new ApiError(400, 'Missing key.');
  const row = await c.s.pressKv.findOne({ _id: key });
  return json(200, { value: row ? row.v : null });
}

export async function putKv(c: Ctx) {
  const me = needUser(c);
  const b = await c.json();
  const key = String(b.key || '').trim();
  const value = String(b.value ?? '');
  if (!key) throw new ApiError(400, 'Missing key.');
  if (value.length > MAX_VALUE) throw new ApiError(413, 'That is too large to save.');
  await c.s.pressKv.updateOne(
    { _id: key },
    { $set: { v: value, updated_at: iso(), updated_by_name: me.name } },
    { upsert: true },
  );
  return json(200, { ok: true });
}
