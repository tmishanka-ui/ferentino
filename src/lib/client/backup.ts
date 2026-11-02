import { libOpen } from './sync';
import { stopAll } from './frames';

/* Backup and restore of the whole system. Every app keeps its data in this browser's local storage, which the apps share
   with this page, so one file holds everything: download it regularly, and upload it to restore (or to move to another computer).
   The files of the Document Library are kept in this browser's IndexedDB; they travel in the backup too. */

type Notify = (msg: string) => void;
interface LibRecord { k: string; docId?: string; name: string; type: string; size: number; at?: string; data: ArrayBuffer }

function libRead(): Promise<LibRecord[]> {
  return new Promise((res) => libOpen((db) => {
    if (!db) { res([]); return; }
    const r = db.transaction('files', 'readonly').objectStore('files').getAll();
    r.onsuccess = () => res(r.result || []);
    r.onerror = () => res([]);
  }));
}
function libWrite(files: any[]): Promise<boolean> {
  return new Promise((res) => libOpen((db) => {
    if (!db) { res(false); return; }
    const t = db.transaction('files', 'readwrite'), st = t.objectStore('files');
    st.clear();
    files.forEach((f) => st.put({ k: f.k, docId: f.docId, name: f.name, type: f.type, size: f.size, at: f.at, data: b64ToBuf(f.b64) }));
    t.oncomplete = () => res(true);
    t.onerror = () => res(false);
  }));
}
function bufToB64(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf), CH = 0x8000;
  let s = '';
  for (let i = 0; i < b.length; i += CH) s += String.fromCharCode.apply(null, Array.from(b.subarray(i, i + CH)));
  return btoa(s);
}
function b64ToBuf(s: string): ArrayBuffer {
  const bin = atob(s), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}

export function downloadBackup(notify: Notify) {
  const data: Record<string, string | null> = {};
  let n = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; data[k] = localStorage.getItem(k); n++; }
  } catch (e: any) { notify('The browser would not let me read the saved data: ' + e.message); return; }
  libRead().then((files) => {
    if (!n && !files.length) { notify('There is nothing saved yet, so there is nothing to back up.'); return; }
    const d = new Date(), pad = (x: number) => String(x).padStart(2, '0');
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
    const lib = files.map((f) => ({ k: f.k, docId: f.docId, name: f.name, type: f.type, size: f.size, at: f.at, b64: bufToB64(f.data) }));
    const payload = JSON.stringify({ app: 'ferentino-management-system', version: 2, savedAt: d.toISOString(), keys: n, data, library: lib });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    a.download = `Ferentino_system_backup_${stamp}.json`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    notify(`Backup downloaded: ${n} saved items${lib.length ? ` and ${lib.length} library file${lib.length === 1 ? '' : 's'}` : ''}, ${(payload.length / 1048576).toFixed(1)} MB.`);
  });
}

export function restoreBackup(file: File, notify: Notify) {
  const r = new FileReader();
  r.onerror = () => notify('I could not read that file.');
  r.onload = () => {
    let b: any;
    try { b = JSON.parse(String(r.result)); } catch { notify('That is not a Ferentino system backup (the file could not be read).'); return; }
    if (!b || b.app !== 'ferentino-management-system' || !b.data || typeof b.data !== 'object') { notify('That is not a Ferentino system backup.'); return; }
    const keys = Object.keys(b.data), hasLib = Array.isArray(b.library);
    const when = b.savedAt ? new Date(b.savedAt).toLocaleString() : 'an unknown date';
    if (!confirm(`Restore the backup saved on ${when} (${keys.length} saved items${hasLib ? ', ' + b.library.length + ' library files' : ''})?\n\nThe saved data of every department is replaced by what is in the file. Anything saved after that date, and not in the file, is lost. Download a fresh backup first if unsure.`)) return;
    stopAll();   // stop every app first, so none can write its old data over the restored data
    setTimeout(() => {
      const done = (libOk: boolean) => {
        let failed = 0;
        keys.forEach((k) => { try { localStorage.setItem(k, b.data[k]); } catch { failed++; } });
        if (failed) alert(`${failed} saved items could not be restored because the browser storage is full or blocked.`);
        if (hasLib && !libOk) alert('The library files could not be restored (browser storage is full or blocked).');
        try { localStorage.setItem('fitl_sync_force', '1'); } catch { /* ignore */ }
        location.reload();
      };
      if (hasLib) libWrite(b.library).then(done); else done(true);
    }, 120);
  };
  r.readAsText(file);
}
