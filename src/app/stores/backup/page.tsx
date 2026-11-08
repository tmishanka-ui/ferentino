'use client';

import { useRef, useState } from 'react';
import { api } from '@/lib/client/api';
import { today } from '@/lib/client/storesCommon';

export default function BackupTab() {
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  async function download() {
    setBusy(true); setMsg('');
    const r = await api('GET', '/api/stores/backup');
    setBusy(false);
    if (!r.ok) { setMsg(r.j.error || 'Could not build the backup.'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(r.j, null, 0)], { type: 'application/json' }));
    a.download = `FITL_Stores_backup_${today()}.json`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    setMsg('Backup downloaded.');
  }

  function pick() { if (file.current) { file.current.value = ''; file.current.click(); } }

  async function restore(f: File) {
    setMsg('');
    const r = new FileReader();
    r.onerror = () => setMsg('That file could not be read.');
    r.onload = async () => {
      let data: unknown;
      try { data = JSON.parse(String(r.result)); } catch { setMsg('That is not a Stores backup file.'); return; }
      setBusy(true);
      const res = await api('POST', '/api/stores/restore', data);
      setBusy(false);
      if (!res.ok) { setMsg(res.j.error || 'Could not restore that backup.'); return; }
      setMsg(`Restored ${res.j.items} items and ${res.j.txns} movements.`);
    };
    r.readAsText(f);
  }

  return (
    <div className="panel" style={{ marginTop: 0 }}>
      <div style={{ flex: 1, minWidth: 260 }}>
        <h3>Stores backup</h3>
        <p>One file holds every item and every receipt/issue in Stores. Keep a copy regularly; use Restore to bring in data recorded during a trial, or to move it to another system.</p>
        <p className="msg" style={{ color: msg.startsWith('Restored') || msg === 'Backup downloaded.' ? 'var(--ok)' : undefined }} role="status">{msg}</p>
      </div>
      <div className="row" style={{ margin: 0 }}>
        <button className="btn red" disabled={busy} onClick={download}>Download backup</button>
        <button className="btn" disabled={busy} onClick={pick}>Restore from backup</button>
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); }} />
      </div>
    </div>
  );
}
