import { ApiError, Ctx, clip, iso, json, needUser } from './http';
import { StoreEmployee, nextId } from './db';

const employeeOut = (e: StoreEmployee) => ({
  code: e._id, name: e.name, designation: e.designation, contact: e.contact, joinedDate: e.joinedDate,
  remarks: e.remarks, createdAt: e.createdAt, createdBy: e.createdBy,
});

export async function listEmployees(c: Ctx) {
  needUser(c);
  const rows = await c.s.storesEmployees.find().sort({ name: 1 }).toArray();
  return json(200, { employees: rows.map(employeeOut) });
}

export async function addEmployee(c: Ctx) {
  const u = needUser(c);
  const b = await c.json();
  const name = clip(b.name, 160);
  if (!name) throw new ApiError(400, 'Enter the employee name.');
  const code = 'FITL-SE-' + String(await nextId(c.s, 'stores_employee_code')).padStart(5, '0');
  const emp: StoreEmployee = {
    _id: code, name, designation: clip(b.designation, 80), contact: clip(b.contact, 40),
    joinedDate: clip(b.joinedDate, 10), remarks: clip(b.remarks, 400), createdAt: iso(), createdBy: u.name,
  };
  await c.s.storesEmployees.insertOne(emp);
  return json(200, { employee: employeeOut(emp) });
}

export async function editEmployee(c: Ctx) {
  needUser(c);
  const code = clip(c.params.code, 40).toUpperCase();
  const it = await c.s.storesEmployees.findOne({ _id: code });
  if (!it) throw new ApiError(404, 'Employee not found.');
  const b = await c.json();
  const name = 'name' in b ? clip(b.name, 160) : it.name;
  if (!name) throw new ApiError(400, 'Enter the employee name.');
  const designation = 'designation' in b ? clip(b.designation, 80) : it.designation;
  const contact = 'contact' in b ? clip(b.contact, 40) : it.contact;
  const joinedDate = 'joinedDate' in b ? clip(b.joinedDate, 10) : it.joinedDate;
  const remarks = 'remarks' in b ? clip(b.remarks, 400) : it.remarks;
  await c.s.storesEmployees.updateOne({ _id: code }, { $set: { name, designation, contact, joinedDate, remarks } });
  return json(200, { employee: employeeOut({ ...it, name, designation, contact, joinedDate, remarks }) });
}

export async function deleteEmployee(c: Ctx) {
  needUser(c);
  const code = clip(c.params.code, 40).toUpperCase();
  const r = await c.s.storesEmployees.deleteOne({ _id: code });
  if (!r.deletedCount) throw new ApiError(404, 'Employee not found (it may have already been removed).');
  return json(200, { ok: true });
}
