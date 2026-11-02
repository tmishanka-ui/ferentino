'use client';

import { useState } from 'react';
import { forgotPassword, mailtoLink, resetPassword, signIn, sysUrl } from '@/lib/client/auth';
import { useStore } from '@/lib/client/store';
import { PasswordForm } from './PasswordForm';

function Art() {
  return (
    <div className="gate-art">
      <svg className="tyre" viewBox="0 0 800 800" aria-hidden="true">
        <g fill="none" stroke="#2a313b" strokeWidth="2">
          <circle cx="400" cy="400" r="390" strokeWidth="3" />
          <circle cx="400" cy="400" r="300" />
          <circle cx="400" cy="400" r="210" stroke="#da1b22" strokeOpacity=".5" />
          <circle cx="400" cy="400" r="120" />
          {Array.from({ length: 36 }, (_, i) => (
            <line key={i} x1="400" y1="12" x2="400" y2="96" transform={`rotate(${i * 10} 400 400)`} stroke="#323a46" strokeWidth="6" strokeLinecap="round" />
          ))}
        </g>
      </svg>
      <img className="gate-logo" src="/logo.jpg" alt="Ferentino" />
      <div>
        <h1 className="gate-title">Ferentino<br />Management system</h1>
        <p className="gate-lede">Quality control dashboards and the shop-floor working apps, together in one place.</p>
      </div>
      <div className="gate-foot">Ferentino Industrial Tyres (Pvt) Ltd</div>
    </div>
  );
}

export function LoginScreen() {
  const error = useStore((s) => s.auth.error);
  const adminEmail = useStore((s) => s.auth.adminEmail);
  const [mode, setMode] = useState<'in' | 'forgot' | 'code'>('in');
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [code, setCode] = useState(''), [nw, setNw] = useState(''), [nw2, setNw2] = useState('');
  const [msg, setMsg] = useState(''), [ok, setOk] = useState(false), [busy, setBusy] = useState(false);

  const say = (t: string, good = false) => { setMsg(t); setOk(good); };

  async function doSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); say('');
    const err = await signIn(email, pw);
    setBusy(false);
    if (err) say(err);
  }

  async function doForgot(e: React.FormEvent) {
    e.preventDefault();
    const em = email.trim();
    if (!em) { say('Enter your e-mail address first.'); return; }
    const to = (await forgotPassword(em)) || adminEmail;
    if (!to) { say('No administrator e-mail address is set up. Please ask your administrator directly.'); return; }
    window.location.href = mailtoLink(to, 'Password reset request — Ferentino management system',
      `Hello,\n\nPlease reset my password for the Ferentino management system and send me a one-time reset code.\n\nMy e-mail address: ${em}\nSystem address: ${sysUrl()}\n\nThank you.`);
    say('Your e-mail program should now be open. Send the message, then use “I have a reset code” when the administrator replies.', true);
  }

  async function doReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const err = await resetPassword(email, code, nw, nw2);
    setBusy(false);
    if (err) { say(err); return; }
    setMode('in'); setPw(''); say('Your password was changed. Sign in with the new password.', true);
  }

  const tab = (m: typeof mode, label: string) => <button type="button" className={mode === m ? 'on' : ''} onClick={() => { setMode(m); say(''); }}>{label}</button>;

  return (
    <div className="gate">
      <Art />
      <div className="gate-form">
        <div className="gate-card">
          <h2>{mode === 'in' ? 'Sign in' : mode === 'forgot' ? 'Forgot password' : 'Reset code'}</h2>
          <p className="hint" style={{ marginTop: 0 }}>Everything entered here is saved on the company server, so everybody works on the same data.</p>
          <div className="tabs-inline" role="tablist">{tab('in', 'Sign in')}{tab('forgot', 'Forgot password')}{tab('code', 'I have a code')}</div>

          {error && <p className="msg" role="alert">{error}</p>}

          {mode === 'in' && (
            <form onSubmit={doSignIn}>
              <label className="field"><span>E-mail</span><input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></label>
              <label className="field"><span>Password</span><input className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
              <p className={'msg' + (ok ? ' ok' : '')} role="alert">{msg}</p>
              <div className="row" style={{ marginTop: 6 }}><button className="btn red" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></div>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={doForgot}>
              <p className="hint">Enter your e-mail address. Your e-mail program opens with a ready message to the system administrator, who will send you a one-time reset code.</p>
              <label className="field"><span>Your e-mail</span><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></label>
              <p className={'msg' + (ok ? ' ok' : '')} role="alert">{msg}</p>
              <div className="row" style={{ marginTop: 6 }}><button className="btn red">Open my e-mail program</button></div>
            </form>
          )}

          {mode === 'code' && (
            <form onSubmit={doReset}>
              <p className="hint">Type your e-mail address, the reset code the administrator sent you and a new password.</p>
              <label className="field"><span>Your e-mail</span><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></label>
              <label className="field"><span>Reset code</span><input className="input" autoComplete="off" style={{ textTransform: 'uppercase', letterSpacing: '.15em' }} value={code} onChange={(e) => setCode(e.target.value)} /></label>
              <label className="field"><span>New password</span><input className="input" type="password" autoComplete="new-password" value={nw} onChange={(e) => setNw(e.target.value)} /></label>
              <label className="field"><span>New password again</span><input className="input" type="password" autoComplete="new-password" value={nw2} onChange={(e) => setNw2(e.target.value)} /></label>
              <p className={'msg' + (ok ? ' ok' : '')} role="alert">{msg}</p>
              <div className="row" style={{ marginTop: 6 }}><button className="btn red" disabled={busy}>Set the new password</button></div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/** shown after signing in with a temporary password, until the person has chosen their own */
export function ForcedPassword() {
  return (
    <div className="gate">
      <Art />
      <div className="gate-form">
        <div className="gate-card">
          <h2>Choose your own password</h2>
          <p className="hint" style={{ marginTop: 0 }}>You signed in with a temporary password. Choose a password only you know — it is also what you type to sign documents.</p>
          <PasswordForm forced />
        </div>
      </div>
    </div>
  );
}
