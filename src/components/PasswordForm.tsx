'use client';

import { useState } from 'react';
import { changePassword } from '@/lib/client/auth';

/** Change the password: used both as the forced first-time screen and as a dialog from the person menu. */
export function PasswordForm({ forced, onDone, onCancel }: { forced?: boolean; onDone?: () => void; onCancel?: () => void }) {
  const [cur, setCur] = useState(''), [nw, setNw] = useState(''), [again, setAgain] = useState('');
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg('');
    const err = await changePassword(cur, nw, again);
    setBusy(false);
    if (err) setMsg(err); else onDone?.();
  }

  return (
    <form onSubmit={go}>
      <label className="field"><span>{forced ? 'Temporary password' : 'Current password'}</span>
        <input className="input" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} autoFocus /></label>
      <label className="field"><span>New password</span>
        <input className="input" type="password" autoComplete="new-password" value={nw} onChange={(e) => setNw(e.target.value)} /></label>
      <label className="field"><span>New password again</span>
        <input className="input" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} /></label>
      <p className="hint">At least 8 characters, with a letter and a number.</p>
      <p className="msg" role="alert">{msg}</p>
      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn red" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
        {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
