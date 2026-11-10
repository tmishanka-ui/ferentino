import { rawFetch, api } from './api';
import { getState, setState, Diff, toast } from './store';
import { release } from './frames';
import { itemName } from '../registry';

/* ---------- the records of every page are kept in MongoDB behind this site ----------
   Each working app still saves in this browser as before. This part (1) loads everything from the server before any app opens,
   (2) copies each change to the server a moment after it is saved, (3) tells the person when somebody else saved something,
   and (4) copies attached files. It runs once the person has signed in. */

interface SyState {
  on: boolean; started: boolean; ready: boolean; seq: number; pollSeq: number;
  ver: Record<string, number>; dirty: Record<string, 1 | 'force'>; busy: boolean;
  timer: ReturnType<typeof setTimeout> | null; conflicts: Record<string, unknown>; remote: Record<string, { key: string; by?: string; version: number; deleted: boolean }>;
  poll: ReturnType<typeof setInterval> | null;
}
const SY: SyState = { on: false, started: false, ready: false, seq: 0, pollSeq: 0, ver: {}, dirty: {}, busy: false, timer: null, conflicts: {}, remote: {}, poll: null };
const SKIP = /^fitl_sync_/;
const enc = encodeURIComponent;
const dirtyKeys = () => Object.keys(SY.dirty);

function loadMeta(): boolean {
  try { const m = JSON.parse(localStorage.getItem('fitl_sync_meta') || 'null'); if (m) { SY.seq = m.seq || 0; SY.ver = m.ver || {}; return true; } } catch { /* none yet */ }
  return false;
}
function saveMeta() { try { localStorage.setItem('fitl_sync_meta', JSON.stringify({ seq: SY.seq, ver: SY.ver })); } catch { /* storage full */ } }
function loadDirty() { try { (JSON.parse(localStorage.getItem('fitl_sync_dirty') || '[]') as string[]).forEach((k) => { SY.dirty[k] = SY.dirty[k] || 1; }); } catch { /* none yet */ } }
function saveDirty() { try { localStorage.setItem('fitl_sync_dirty', JSON.stringify(dirtyKeys())); } catch { /* storage full */ } }
function localKeys(): string[] {
  const ks: string[] = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; if (!SKIP.test(k)) ks.push(k); }
  return ks;
}

function chip(t?: string, bad?: boolean) {
  if (!getState().auth.user) { setState({ sync: { chip: { tone: 'hidden', text: '' } } }); return; }
  const text = t || (dirtyKeys().length ? 'Saving to the server…' : 'Saved on the server');
  setState({ sync: { chip: { tone: bad ? 'bad' : t || dirtyKeys().length ? 'busy' : 'ok', text } } });
}

function pullAll(since: number): Promise<{ items: any[]; seq: number }> {
  let items: any[] = [];
  const page = (s: number): Promise<{ items: any[]; seq: number }> =>
    rawFetch('GET', `/api/sync/pull?since=${s}&maxMB=8`).then((x) => {
      if (!x.ok) throw new Error(x.j.error || `the server answered ${x.status}`);
      items = items.concat(x.j.items || []);
      return x.j.more ? page(x.j.seq) : { items, seq: x.j.seq };
    });
  return page(since);
}

const ask = (diffs: Diff[]) => new Promise<'server' | 'mine'>((res) => setState({ dialog: { type: 'ask', diffs, done: (c) => { setState({ dialog: null }); res(c); } } }));

// A single oversized item (bigger than this browser's remaining localStorage quota) must never stop
// every other item from loading and lock the whole system out — it just stays out of this browser's
// local copy, and a toast tells the person which one, instead of hydrate() throwing.
let quotaSkipped: string[] = [];
function setItemSafe(key: string, value: string): boolean {
  try { localStorage.setItem(key, value); return true; }
  catch { quotaSkipped.push(key); return false; }
}

function hydrate(): Promise<number> {
  const force = localStorage.getItem('fitl_sync_force') === '1', had = loadMeta();
  loadDirty(); chip('Loading data from the server…'); quotaSkipped = [];
  if (force) { localStorage.removeItem('fitl_sync_force'); return forceUpload(); }
  return pullAll(had ? SY.seq : 0).then((res) => {
    const diffs: Diff[] = [], seen: Record<string, 1> = {};
    let applied = 0;
    res.items.forEach((it) => {
      seen[it.key] = 1;
      const loc = localStorage.getItem(it.key);
      if (it.deleted) {
        if (had && !SY.dirty[it.key]) { if (loc !== null) { localStorage.removeItem(it.key); applied++; } delete SY.ver[it.key]; }
        else { SY.ver[it.key] = it.version; if (loc !== null) SY.dirty[it.key] = 1; }
        return;
      }
      if (loc === null) { if (setItemSafe(it.key, it.value)) { SY.ver[it.key] = it.version; applied++; } }
      else if (loc === it.value) { SY.ver[it.key] = it.version; delete SY.dirty[it.key]; }
      else if (had && !SY.dirty[it.key]) { if (setItemSafe(it.key, it.value)) { SY.ver[it.key] = it.version; applied++; } }
      else diffs.push(it);
    });
    localKeys().forEach((k) => { if (!seen[k] && !(k in SY.ver)) SY.dirty[k] = 1; });     // items the server has never seen are uploaded
    return (diffs.length ? ask(diffs) : Promise.resolve('' as '')).then((choice) => {
      diffs.forEach((it) => {
        SY.ver[it.key] = it.version;
        if (choice === 'server') { if (setItemSafe(it.key, it.value)) { delete SY.dirty[it.key]; applied++; } }
        else SY.dirty[it.key] = 1;
      });
      SY.seq = res.seq; SY.pollSeq = res.seq; saveMeta(); saveDirty();
      if (quotaSkipped.length) toast(`This browser's storage is full — could not load: ${quotaSkipped.map(itemName).join(', ')}`);
      return applied;
    });
  });
}

/* after a backup is restored on this computer, the restored data replaces what the server holds */
function forceUpload(): Promise<number> {
  const keys = localKeys();
  return rawFetch('GET', '/api/sync/changes?since=0').then((x) => {
    const onServer: string[] = (x.j.changed || []).filter((c: any) => !c.deleted).map((c: any) => c.key);
    const jobs: Promise<unknown>[] = [];
    keys.forEach((k) => jobs.push(rawFetch('PUT', '/api/data/' + enc(k), { headers: { 'X-Force': '1', 'X-Base-Version': '0', 'Content-Type': 'text/plain; charset=utf-8' }, body: localStorage.getItem(k)! }).then((r) => { if (r.ok) SY.ver[k] = r.j.version; })));
    onServer.forEach((k) => { if (!keys.includes(k)) jobs.push(rawFetch('DELETE', '/api/data/' + enc(k), { headers: { 'X-Force': '1' } }).then(() => { delete SY.ver[k]; })); });
    return Promise.all(jobs);
  }).then(() => rawFetch('GET', '/api/sync/changes?since=0')).then((x) => { SY.dirty = {}; SY.seq = x.j.seq || 0; SY.pollSeq = SY.seq; saveMeta(); saveDirty(); return 0; });
}

function mark(k: string) {
  if (!SY.on || SKIP.test(k)) return;
  SY.dirty[k] = SY.dirty[k] || 1; saveDirty(); chip();
  if (SY.timer) clearTimeout(SY.timer);
  SY.timer = setTimeout(flush, 1200);
}

function flush() {
  if (SY.busy) return;
  const keys = dirtyKeys();
  if (!keys.length) { chip(); return; }
  SY.busy = true;
  const next = (i: number): void => {
    if (i >= keys.length) {
      SY.busy = false;
      if (dirtyKeys().length) SY.timer = setTimeout(flush, 4000);
      chip(); saveMeta(); saveDirty(); bar();
      return;
    }
    const k = keys[i], v = localStorage.getItem(k), force = SY.dirty[k] === 'force', h: Record<string, string> = { 'X-Base-Version': String(SY.ver[k] || 0) };
    if (force) h['X-Force'] = '1';
    let req: ReturnType<typeof rawFetch>;
    if (v === null) {
      if (!(k in SY.ver)) { delete SY.dirty[k]; return next(i + 1); }
      req = rawFetch('DELETE', '/api/data/' + enc(k), { headers: h });
    } else {
      h['Content-Type'] = 'text/plain; charset=utf-8';
      req = rawFetch('PUT', '/api/data/' + enc(k), { headers: h, body: v });
    }
    req.then((x) => {
      if (x.ok) { delete SY.dirty[k]; if (v === null) delete SY.ver[k]; else SY.ver[k] = x.j.version; }
      else if (x.status === 409) { delete SY.dirty[k]; SY.conflicts[k] = x.j.current; }
      else if (x.status >= 500) { SY.busy = false; chip('The server had a problem — will try again', true); SY.timer = setTimeout(flush, 8000); return null; }
      else if (x.status === 401) { SY.busy = false; chip('Signed out — please sign in again', true); refreshMe(); return null; }
      else { chip(`The server refused to save “${itemName(k)}”: ${x.j.error || x.status}`, true); delete SY.dirty[k]; }
      return next(i + 1);
    }).catch(() => { SY.busy = false; chip('Server not reachable — will keep trying', true); SY.timer = setTimeout(flush, 8000); });
  };
  next(0);
}

function poll() {
  if (!SY.on || !getState().auth.user || SY.busy) return;
  rawFetch('GET', '/api/sync/changes?since=' + SY.pollSeq).then((x) => {
    if (x.status === 401) { chip('Signed out — please sign in again', true); refreshMe(); return; }
    if (!x.ok) return;
    (x.j.changed || []).forEach((c: any) => {
      if (!c.deleted && SY.ver[c.key] === c.version) return;                                       // our own save
      if (c.deleted && !(c.key in SY.ver) && localStorage.getItem(c.key) === null) return;
      SY.remote[c.key] = c;
    });
    if (x.j.seq > SY.pollSeq) SY.pollSeq = x.j.seq;
    if (!Object.keys(SY.remote).length && !dirtyKeys().length && SY.pollSeq > SY.seq) { SY.seq = SY.pollSeq; saveMeta(); }
    bar(); chip();
  }).catch(() => chip('Server not reachable — will keep trying', true));
}

/** tells the page what the banner (somebody else saved / not saved because of a newer version) should say */
function bar() {
  const conflicts = Object.keys(SY.conflicts);
  const remote = Object.keys(SY.remote).map((key) => ({ key, by: SY.remote[key].by || '' }));
  setState({ sync: { conflicts, remote } });
}

export function takeTheirs() {
  Promise.all(Object.keys(SY.conflicts).map((k) => fetch('/api/data/' + enc(k), { credentials: 'same-origin' }).then((r) => {
    if (r.status === 404) { localStorage.removeItem(k); delete SY.ver[k]; return; }
    const ver = +(r.headers.get('X-Version') || 0);
    return r.text().then((t) => { localStorage.setItem(k, t); SY.ver[k] = ver; });
  }))).then(() => { SY.conflicts = {}; saveMeta(); location.reload(); });
}
export function keepMine() {
  Object.keys(SY.conflicts).forEach((k) => { SY.dirty[k] = 'force'; });
  SY.conflicts = {}; saveDirty(); flush(); bar();
}
export function reloadToSee() {
  const go = () => { if (dirtyKeys().length || SY.busy) { setTimeout(go, 400); return; } saveMeta(); location.reload(); };
  if (SY.timer) clearTimeout(SY.timer);
  flush(); go();
}

/** waits (briefly) until everything this person typed has reached the server; used before signing out */
export function flushAndWait(maxMs = 6000): Promise<boolean> {
  if (SY.timer) clearTimeout(SY.timer);
  flush();
  const t0 = Date.now();
  return new Promise((res) => {
    const check = () => {
      if (!dirtyKeys().length && !SY.busy) res(true);
      else if (Date.now() - t0 > maxMs) res(false);
      else setTimeout(check, 200);
    };
    check();
  });
}
export const hasUnsaved = () => SY.on && dirtyKeys().length > 0;

/* files attached in the Document Library, Document Control and Waste Disposal: copied to the server when saved or deleted */
export function libOpen(cb: (db: IDBDatabase | null) => void) {
  try {
    const q = indexedDB.open('fitl-library', 1);
    q.onupgradeneeded = () => { q.result.createObjectStore('files', { keyPath: 'k' }); };
    q.onsuccess = () => cb(q.result);
    q.onerror = () => cb(null);
  } catch { cb(null); }
}
function fileUp(k: string) {
  libOpen((db) => {
    if (!db) return;
    const r = db.transaction('files', 'readonly').objectStore('files').get(k);
    r.onsuccess = () => {
      const rec = r.result; if (!rec) return;
      const bad = () => chip('A file could not be copied to the server', true);
      fetch('/api/files/' + enc(k), { method: 'PUT', credentials: 'same-origin', headers: { 'X-FIT-Request': '1', 'Content-Type': rec.type || 'application/octet-stream', 'X-File-Name': enc(rec.name || k) }, body: new Blob([rec.data]) })
        .then((x) => { if (!x.ok) bad(); }).catch(bad);
    };
  });
}
function filesCatchUp() {        // files that were attached before the server was used
  libOpen((db) => {
    if (!db) return;
    const r = db.transaction('files', 'readonly').objectStore('files').getAllKeys();
    r.onsuccess = () => {
      const mine = (r.result || []) as string[];
      rawFetch('GET', '/api/files').then((x) => {
        const have: Record<string, 1> = {};
        (x.j.files || []).forEach((f: any) => { have[f.key] = 1; });
        mine.forEach((k) => { if (!have[k]) fileUp(k); });
      });
    };
  });
}

let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener('storage', (e) => {
    if (!SY.on || e.storageArea !== localStorage) return;
    if (e.key === null) Object.keys(SY.ver).forEach(mark); else mark(e.key);
  });
  window.addEventListener('beforeunload', (e) => { if (SY.on && dirtyKeys().length) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('focus', poll);
  window.addEventListener('message', (ev) => {
    const m = ev.data;
    if (!SY.on || !m || typeof m !== 'object' || !m.k) return;
    if (m.type === 'fitl-file-saved') fileUp(m.k);
    else if (m.type === 'fitl-file-deleted') rawFetch('DELETE', '/api/files/' + enc(m.k));
  });
}

/* start-up: the system stays locked until the person has signed in and the data is here */
export function start() {
  listen();
  SY.started = true;
  setState({ sync: { lock: { kind: 'loading', text: 'Loading the data from the server…' } } });
  hydrate().then((applied) => {
    SY.on = true; SY.ready = true;
    setState({ sync: { ready: true, lock: null } });
    if (applied && Object.values(getState().frames.loaded).some(Boolean)) { location.reload(); return; }
    release(); chip(); flush(); filesCatchUp();
    if (SY.poll) clearInterval(SY.poll);
    SY.poll = setInterval(poll, 20000);
  }).catch((e) => {
    SY.started = false;
    setState({ sync: { lock: { kind: 'error', text: String(e?.message || e) } } });
  });
}

/** called whenever the sign-in state changes */
export function afterAuth() {
  const { user } = getState().auth;
  if (!user) {
    SY.on = false; SY.started = false; SY.ready = false;
    if (SY.poll) clearInterval(SY.poll);
    setState({ sync: { ready: false, lock: null, chip: { tone: 'hidden', text: '' } } });
    return;
  }
  if (user.mustChange) return;                  // the temporary password is replaced first
  if (!SY.started) start();
}

async function refreshMe() {
  const r = await api('GET', '/api/me');
  setState({ auth: { user: r.j.user || null, status: r.j.user ? 'in' : 'out' } });
  afterAuth();
}
