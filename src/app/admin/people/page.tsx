'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, fmtAt } from '@/lib/client/api';
import { mailtoLink, sysUrl } from '@/lib/client/auth';
import { Modal } from '@/components/Modal';
import { toast } from '@/lib/client/store';

interface Person {
  id: number; email: string; name: string; designation: string; department: string; role: 'admin' | 'executive' | 'manager';
  active: boolean; mustChange: boolean; locked: boolean; resetRequested: string | null; lastLogin: string | null;
}
const ROLE = { admin: 'Administrator', executive: 'Executive', manager: 'Manager' } as const;

interface Secret { title: string; secret: string; note: string; email: string; subject: string; body: string }

const signInDetails = (name: string, email: string, pw: string) =>
  `Hello ${name},\n\nYou can sign in to the Ferentino management system at ${sysUrl()}\nE-mail: ${email}\nTemporary password: ${pw}\n\nYou will be asked to choose your own password straight away. That password is also what you type to sign documents — keep it to yourself.\n\nQuality Management`;

export default function People() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState<Person | 'new' | null>(null);
  const [secret, setSecret] = useState<Secret | null>(null);

  const load = useCallback(async () => {
    const r = await api('GET', '/api/users');
    if (!r.ok) { setError(r.j.error || 'Not allowed.'); return; }
    setPeople(r.j.users);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggle(p: Person) {
    const r = await api('PUT', '/api/users/' + p.id, { active: !p.active });
    if (!r.ok) toast(r.j.error || 'Could not change.');
    load();
  }
  async function resetCode(p: Person) {
    const r = await api('POST', `/api/users/${p.id}/reset`);
    if (!r.ok) { toast(r.j.error); return; }
    setSecret({
      title: `Reset code for ${r.j.name}`, secret: r.j.code, email: r.j.email,
      note: `This one-time code works for 48 hours. Send it to ${r.j.name} by e-mail; they choose “Forgot password › I have a code”.`,
      subject: 'Ferentino management system — your password reset code',
      body: `Hello ${r.j.name},\n\nYour one-time password reset code is:  ${r.j.code}\n\nTo use it: open ${sysUrl()} › Sign in › “I have a code”, type your e-mail address, this code and a new password.\nThe code works once and expires in 48 hours.\n\nQuality Management`,
    });
  }
  async function tempPassword(p: Person) {
    const r = await api('POST', `/api/users/${p.id}/temp`);
    if (!r.ok) { toast(r.j.error); return; }
    setSecret({
      title: `Temporary password for ${r.j.name}`, secret: r.j.tempPassword, email: r.j.email,
      note: 'They must choose their own password the first time they sign in. Any earlier password stops working.',
      subject: 'Ferentino management system — your sign-in details', body: signInDetails(r.j.name, r.j.email, r.j.tempPassword),
    });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>People and passwords</h2>
          <p>Executives and managers listed here can sign in and sign documents. Passwords are never shown or stored — only a scrambled copy is kept.</p>
        </div>
        <button className="btn red" onClick={() => setForm('new')}>Add a person</button>
      </div>

      {error && <p className="msg">{error}</p>}
      {people && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>E-mail</th><th>Role</th><th>Status</th><th /></tr></thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.name}</b><div className="sub">{p.designation}{p.department ? ' · ' + p.department : ''}</div></td>
                  <td>{p.email}</td>
                  <td>{ROLE[p.role]}</td>
                  <td>
                    {p.active ? <span className="tag ok">Active</span> : <span className="tag">Inactive</span>}{' '}
                    {p.locked && <span className="tag bad">Locked</span>}{' '}
                    {p.mustChange && <span className="tag">Temporary password</span>}{' '}
                    {p.resetRequested && <span className="tag bad">Asked for a reset</span>}
                    <div className="sub">Last sign-in {fmtAt(p.lastLogin)}</div>
                  </td>
                  <td className="act">
                    <button className="btn sm" onClick={() => setForm(p)}>Edit</button>
                    <button className="btn sm" onClick={() => toggle(p)}>{p.active ? 'Switch off' : 'Switch on'}</button>
                    {p.active && <button className="btn sm" onClick={() => resetCode(p)}>Reset code</button>}
                    {p.active && <button className="btn sm" onClick={() => tempPassword(p)}>Temporary password</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && <PersonForm person={form === 'new' ? null : form} onClose={() => setForm(null)} onSaved={(s) => { setForm(null); if (s) setSecret(s); load(); }} />}
      {secret && (
        <Modal title={secret.title} onClose={() => setSecret(null)}>
          <div className="secret">{secret.secret}</div>
          <p className="sub">{secret.note} This is the only time it is shown.</p>
          <div className="row">
            <a className="btn red" href={mailtoLink(secret.email, secret.subject, secret.body)}>Email it to {secret.email}</a>
            <button className="btn" onClick={async function () { try { await navigator.clipboard.writeText(secret.secret); toast('Copied.'); } catch { toast('Copy it by hand.'); } }}>Copy</button>
            <button className="btn" onClick={() => setSecret(null)}>Done</button>
          </div>
        </Modal>
      )}
    </>
  );
}

function PersonForm({ person, onClose, onSaved }: { person: Person | null; onClose: () => void; onSaved: (s?: Secret) => void }) {
  const [name, setName] = useState(person?.name ?? ''), [email, setEmail] = useState(person?.email ?? '');
  const [designation, setDesignation] = useState(person?.designation ?? ''), [department, setDepartment] = useState(person?.department ?? '');
  const [role, setRole] = useState(person?.role ?? 'manager');
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg('');
    const body = { name, email, designation, department, role };
    const r = await api(person ? 'PUT' : 'POST', person ? '/api/users/' + person.id : '/api/users', body);
    setBusy(false);
    if (!r.ok) { setMsg(r.j.error || 'Could not save.'); return; }
    if (person) { onSaved(); return; }
    onSaved({
      title: `Temporary password for ${r.j.user.name}`, secret: r.j.tempPassword, email: r.j.user.email,
      note: 'They must choose their own password the first time they sign in.',
      subject: 'Ferentino management system — your sign-in details', body: signInDetails(r.j.user.name, r.j.user.email, r.j.tempPassword),
    });
  }

  return (
    <Modal title={person ? `Edit ${person.name}` : 'Add a person'} onClose={onClose}>
      <form onSubmit={go}>
        <div className="grid2">
          <label className="field"><span>Name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
          <label className="field"><span>E-mail</span><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="field"><span>Designation</span><input className="input" value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Quality Manager" /></label>
          <label className="field"><span>Department</span><input className="input" value={department} onChange={(e) => setDepartment(e.target.value)} /></label>
        </div>
        <label className="field"><span>Role</span>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as Person['role'])}>
            {(Object.keys(ROLE) as (keyof typeof ROLE)[]).map((r) => <option key={r} value={r}>{ROLE[r]}</option>)}
          </select>
        </label>
        {!person && <p className="hint">A temporary password is made for them; you hand it over once.</p>}
        <p className="msg" role="alert">{msg}</p>
        <div className="row" style={{ marginTop: 6 }}><button className="btn red" disabled={busy}>{person ? 'Save' : 'Add the person'}</button><button type="button" className="btn" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}
