'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client/api';
import { toast } from '@/lib/client/store';
import { Modal } from '@/components/Modal';
import { downloadExcel } from '@/lib/client/xlsx-export';
import { StoreEmployeeOut, today } from '@/lib/client/storesCommon';

export default function EmployeesTab() {
  const [rows, setRows] = useState<StoreEmployeeOut[]>([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<StoreEmployeeOut | null>(null);
  const [confirmCode, setConfirmCode] = useState<string | null>(null);

  const [name, setName] = useState(''), [designation, setDesignation] = useState('');
  const [contact, setContact] = useState(''), [joinedDate, setJoinedDate] = useState(today()), [remarks, setRemarks] = useState('');
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);

  const load = useCallback(() => { api('GET', '/api/stores/employees').then((r) => { if (r.ok) setRows(r.j.employees || []); }); }, []);
  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((e) => e.name.toLowerCase().includes(q) || e.designation.toLowerCase().includes(q) || e.code.toLowerCase().includes(q));
  }, [rows, search]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    if (!name.trim()) { setMsg('Enter the employee name.'); return; }
    setBusy(true);
    const r = await api('POST', '/api/stores/employees', { name, designation, contact, joinedDate, remarks });
    setBusy(false);
    if (!r.ok) { setMsg(r.j.error || 'Could not add that employee.'); return; }
    setName(''); setDesignation(''); setContact(''); setJoinedDate(today()); setRemarks('');
    load();
  }

  async function del(code: string) {
    if (confirmCode !== code) { setConfirmCode(code); return; }
    const r = await api('DELETE', `/api/stores/employees/${encodeURIComponent(code)}`);
    setConfirmCode(null);
    if (!r.ok) { toast(r.j.error || 'Could not remove that employee.'); return; }
    load();
  }

  function downloadEmployees() {
    downloadExcel(`FITL_Stores_Employees_${today()}.xlsx`, 'Employees', ['Code', 'Name', 'Designation', 'Contact', 'Joined', 'Remarks'],
      visible.map((e) => ({ Code: e.code, Name: e.name, Designation: e.designation, Contact: e.contact, Joined: e.joinedDate, Remarks: e.remarks })));
  }

  return (
    <>
      <form onSubmit={add}>
        <div className="grid2">
          <label className="field" style={{ marginTop: 0 }}><span>Name</span><input className="input" value={name} onChange={(ev) => setName(ev.target.value)} autoFocus /></label>
          <label className="field" style={{ marginTop: 0 }}><span>Designation</span><input className="input" value={designation} onChange={(ev) => setDesignation(ev.target.value)} placeholder="e.g. Store Keeper" /></label>
          <label className="field"><span>Contact no.</span><input className="input" value={contact} onChange={(ev) => setContact(ev.target.value)} /></label>
          <label className="field"><span>Joined date</span><input className="input" type="date" value={joinedDate} onChange={(ev) => setJoinedDate(ev.target.value)} /></label>
          <label className="field"><span>Remarks</span><input className="input" value={remarks} onChange={(ev) => setRemarks(ev.target.value)} /></label>
        </div>
        <p className="msg" role="alert">{msg}</p>
        <div className="row"><button className="btn red" disabled={busy}>Add employee</button></div>
      </form>

      <div className="filters" style={{ marginTop: 22 }}>
        <label className="field"><span>Search</span><input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, designation or code" /></label>
      </div>
      <div className="row" style={{ marginTop: 0, marginBottom: 14 }}>
        <button type="button" className="btn" onClick={downloadEmployees}>Download (Excel)</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Code</th><th>Name</th><th>Designation</th><th>Contact</th><th>Joined</th><th>Remarks</th><th /></tr></thead>
          <tbody>
            {visible.map((e) => (
              <tr key={e.code}>
                <td className="mono">{e.code}</td>
                <td><button type="button" className="btn ghost sm" style={{ padding: 0, minHeight: 'auto' }} onClick={() => setEditing(e)}>{e.name}</button></td>
                <td>{e.designation || '—'}</td>
                <td>{e.contact || '—'}</td>
                <td>{e.joinedDate || '—'}</td>
                <td>{e.remarks || '—'}</td>
                <td className="act">
                  <button type="button" className={'btn sm' + (confirmCode === e.code ? ' danger' : '')} onClick={() => del(e.code)}>
                    {confirmCode === e.code ? 'Confirm delete' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && <div className="empty">No employees added yet.</div>}
      </div>
      <p className="count-line">{visible.length} employee{visible.length === 1 ? '' : 's'} shown</p>

      {editing && (
        <Modal title={editing.name} sub={editing.code} onClose={() => setEditing(null)}>
          <EditEmployeeForm employee={editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
        </Modal>
      )}
    </>
  );
}

function EditEmployeeForm({ employee, onCancel, onSaved }: { employee: StoreEmployeeOut; onCancel: () => void; onSaved: () => void }) {
  const [name, setName] = useState(employee.name), [designation, setDesignation] = useState(employee.designation);
  const [contact, setContact] = useState(employee.contact), [joinedDate, setJoinedDate] = useState(employee.joinedDate);
  const [remarks, setRemarks] = useState(employee.remarks);
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setMsg('Enter the employee name.'); return; }
    setBusy(true); setMsg('');
    const r = await api('PATCH', `/api/stores/employees/${encodeURIComponent(employee.code)}`, { name, designation, contact, joinedDate, remarks });
    setBusy(false);
    if (!r.ok) { setMsg(r.j.error || 'Could not save.'); return; }
    onSaved();
  }

  return (
    <form onSubmit={go}>
      <div className="grid2">
        <label className="field" style={{ marginTop: 0 }}><span>Name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
        <label className="field" style={{ marginTop: 0 }}><span>Designation</span><input className="input" value={designation} onChange={(e) => setDesignation(e.target.value)} /></label>
        <label className="field"><span>Contact no.</span><input className="input" value={contact} onChange={(e) => setContact(e.target.value)} /></label>
        <label className="field"><span>Joined date</span><input className="input" type="date" value={joinedDate} onChange={(e) => setJoinedDate(e.target.value)} /></label>
        <label className="field"><span>Remarks</span><input className="input" value={remarks} onChange={(e) => setRemarks(e.target.value)} /></label>
      </div>
      <p className="msg" role="alert">{msg}</p>
      <div className="row"><button className="btn red" disabled={busy}>Save</button><button type="button" className="btn" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}
