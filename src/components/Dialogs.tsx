'use client';

import { useState } from 'react';
import { useStore, Diff, SignRequest, SignResult } from '@/lib/client/store';
import { submitSignature } from '@/lib/client/bridge';
import { sessionEnded } from '@/lib/client/auth';
import { itemName } from '@/lib/registry';
import { Modal } from './Modal';

/** The dialogs the working apps and the synchronisation can ask for. */
export function Dialogs() {
  const dialog = useStore((s) => s.dialog);
  if (!dialog) return null;
  if (dialog.type === 'sign') return <SignModal req={dialog.req} done={dialog.done} />;
  return <AskModal diffs={dialog.diffs} done={dialog.done} />;
}

function SignModal({ req, done }: { req: SignRequest; done: (r: SignResult) => void }) {
  const user = useStore((s) => s.auth.user);
  const [pw, setPw] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const cancel = () => done({ ok: false, reason: 'cancelled' });

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMsg('Signing…');
    try {
      const r = await submitSignature(req, pw);
      if (r.signedOut) { done({ ok: false, reason: 'cancelled' }); sessionEnded(); return; }   // the sign-in screen opens by itself
      if (r.error) { setMsg(r.error); return; }
      done(r.result!);
    } catch { setMsg('The server could not be reached.'); }
    finally { setBusy(false); }
  }

  return (
    <Modal title="Sign with your password" onClose={cancel}>
      <div className="docbox">
        <div><span>Signing</span><b>{req.purpose}</b></div>
        <div><span>Record</span><b>{req.ref}</b></div>
        {req.summary && <div><span>Content</span>{req.summary}</div>}
      </div>
      <p className="sub">Signing as <b>{user?.name}</b>, {user?.designation || user?.role}. Your password is your signature: it is recorded with your name, the date and time, and cannot be copied from one record to another.</p>
      <form onSubmit={go}>
        <label className="field"><span>Your password</span><input className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></label>
        <p className="msg" role="alert">{msg}</p>
        <div className="row" style={{ marginTop: 6 }}><button className="btn red" disabled={busy}>Sign</button><button type="button" className="btn" onClick={cancel}>Cancel</button></div>
      </form>
    </Modal>
  );
}

function AskModal({ diffs, done }: { diffs: Diff[]; done: (c: 'server' | 'mine') => void }) {
  const n = diffs.length;
  return (
    <Modal title="This computer and the server differ" sub={`${n} item${n === 1 ? '' : 's'} on this computer ${n === 1 ? 'is' : 'are'} different from what is saved on the server: ${diffs.map((d) => itemName(d.key)).join(', ')}.`}>
      <p className="sub">Choose which copy to keep. You are asked this only when both copies have changed.</p>
      <div className="row">
        <button className="btn red" onClick={() => done('server')}>Use the server’s copy</button>
        <button className="btn" onClick={() => done('mine')}>Keep this computer’s copy</button>
      </div>
    </Modal>
  );
}
