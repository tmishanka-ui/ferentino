import { api } from './api';
import { setState, getState, AuthUser } from './store';
import { afterAuth as syncAfterAuth, flushAndWait } from './sync';
import { broadcastAuth, initBridge } from './bridge';

function applyUser(user: AuthUser | null, adminEmail?: string) {
  setState({ auth: { user, status: user ? 'in' : 'out', error: '', ...(adminEmail === undefined ? {} : { adminEmail }) } });
  broadcastAuth();
  syncAfterAuth();
}

/** first thing on every visit: who is signed in? */
export async function authInit() {
  initBridge();
  try {
    const r = await api('GET', '/api/me');
    if (!r.ok || !r.j.server) throw new Error(r.j.error || 'The server answered ' + r.status);
    applyUser(r.j.user || null, r.j.adminEmail || '');
  } catch (e: any) {
    setState({ auth: { status: 'out', user: null, error: 'The server could not be reached. ' + (e?.message || '') } });
  }
}

export async function signIn(email: string, password: string): Promise<string> {
  try {
    const r = await api('POST', '/api/login', { email, password });
    if (!r.ok) return r.j.error || 'Could not sign in.';
    applyUser(r.j.user);
    return '';
  } catch { return 'The server could not be reached.'; }
}

export async function signOut() {
  await flushAndWait();                                  // whatever was typed last reaches the server first
  try { await api('POST', '/api/logout'); } catch { /* the cookie expires anyway */ }
  window.location.assign('/');                           // a clean start, so no app keeps the last person's screen in memory
}

export async function changePassword(current: string, next: string, again: string): Promise<string> {
  if (next !== again) return 'The two new passwords are not the same.';
  const r = await api('POST', '/api/password', { current, next });
  if (!r.ok) return r.j.error || 'Could not change the password.';
  const u = getState().auth.user;
  if (u) applyUser({ ...u, mustChange: false });
  return '';
}

export async function forgotPassword(email: string): Promise<string> {
  const r = await api('POST', '/api/forgot', { email });
  return r.j.adminEmail || getState().auth.adminEmail || '';
}

export async function resetPassword(email: string, code: string, next: string, again: string): Promise<string> {
  if (next !== again) return 'The two new passwords are not the same.';
  const r = await api('POST', '/api/reset', { email, code, next });
  return r.ok ? '' : r.j.error || 'Could not reset the password.';
}

/** the session ended behind our back (a 401 from a call made by a dialog) */
export async function sessionEnded() {
  const r = await api('GET', '/api/me');
  applyUser(r.j.user || null, r.j.adminEmail);
}

export function mailtoLink(to: string, subject: string, body: string) {
  return 'mailto:' + encodeURIComponent(to) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
}
export const sysUrl = () => location.origin + '/';
