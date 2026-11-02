'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, fmtAt } from '@/lib/client/api';
import { itemName } from '@/lib/registry';
import { Modal } from '@/components/Modal';
import { toast } from '@/lib/client/store';

interface Item { key: string; version: number; deleted: boolean; size: number; at: string; by: string | null }
interface Version { id: number; version: number; at: string; by: string | null }

export default function StoredData() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<{ key: string; versions: Version[] } | null>(null);

  const load = useCallback(() => {
    api('GET', '/api/data').then((r) => { if (r.ok) setItems(r.j.items); else setError(r.j.error || 'Not allowed.'); });
  }, []);
  useEffect(load, [load]);

  async function showHistory(key: string) {
    const r = await api('GET', '/api/history/' + encodeURIComponent(key));
    if (!r.ok) { toast(r.j.error || 'Could not read the history.'); return; }
    setOpen({ key, versions: r.j.versions });
  }
  async function restore(key: string, v: Version) {
    if (!confirm(`Bring back the copy saved ${fmtAt(v.at)}?\n\nIt becomes the current version of “${itemName(key)}”. People who have that page open are told to reload it.`)) return;
    const r = await api('POST', `/api/history/${encodeURIComponent(key)}/${v.id}/restore`);
    if (!r.ok) { toast(r.j.error || 'Could not bring it back.'); return; }
    setOpen(null); load(); toast(`“${itemName(key)}” was brought back to the earlier copy.`);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Stored data</h2>
          <p>The records of every page, as saved on the server. The server keeps up to ten earlier copies of each (at most one every ten minutes); an earlier copy can be brought back here.</p>
        </div>
      </div>
      {error && <p className="msg">{error}</p>}
      {items && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Page</th><th>Stored as</th><th>Version</th><th>Size</th><th>Last saved</th><th /></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.key}>
                  <td><b>{itemName(i.key)}</b>{i.deleted && <> <span className="tag">Deleted</span></>}</td>
                  <td className="mono">{i.key}</td>
                  <td>{i.version}</td>
                  <td>{i.size >= 1048576 ? (i.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(i.size / 1024)) + ' KB'}</td>
                  <td>{fmtAt(i.at)}<div className="sub">{i.by}</div></td>
                  <td className="act"><button className="btn sm" onClick={() => showHistory(i.key)}>Earlier copies</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!items.length && <div className="empty">Nothing has been saved yet.</div>}
        </div>
      )}
      {open && (
        <Modal title={`Earlier copies — ${itemName(open.key)}`} onClose={() => setOpen(null)}>
          {open.versions.length ? (
            <div className="table-wrap" style={{ marginTop: 14 }}>
              <table>
                <thead><tr><th>Saved</th><th>By</th><th>Version</th><th /></tr></thead>
                <tbody>
                  {open.versions.map((v) => (
                    <tr key={v.id}><td>{fmtAt(v.at)}</td><td>{v.by}</td><td>{v.version}</td><td className="act"><button className="btn sm" onClick={() => restore(open.key, v)}>Bring back</button></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="sub">No earlier copies yet.</p>}
          <div className="row"><button className="btn" onClick={() => setOpen(null)}>Close</button></div>
        </Modal>
      )}
    </>
  );
}
