import { Ctx, ApiError, iso, json, needUser, needAdmin } from './http';

/* Backs the three-coordinator allow-list on the Production Department's Shift Groups page — see the
   ShiftgroupsEditors comment in db.ts. Anyone signed in can read the list (so the page can tell
   whether the person using it is on it); only an administrator can change it. */

const ID = 'current';

export async function getEditors(c: Ctx) {
  needUser(c);
  const row = await c.s.shiftgroupsEditors.findOne({ _id: ID });
  return json(200, { people: row?.people || [] });
}

export async function putEditors(c: Ctx) {
  const me = needAdmin(c);
  const b = await c.json();
  const src = Array.isArray(b.people) ? b.people : [];
  if (src.length > 3) throw new ApiError(400, 'At most three coordinators.');
  const people = src.map((p: unknown) => {
    const o = p as { id?: unknown; name?: unknown; email?: unknown };
    if (typeof o.name !== 'string' || typeof o.email !== 'string' || !o.name || !o.email) throw new ApiError(400, 'Each person needs a name and e-mail.');
    return { id: Number(o.id) || 0, name: o.name, email: o.email };
  });
  await c.s.shiftgroupsEditors.updateOne({ _id: ID }, { $set: { people, updated_at: iso(), updated_by_name: me.name } }, { upsert: true });
  return json(200, { ok: true, people });
}
