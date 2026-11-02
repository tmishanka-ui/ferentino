'use client';

import { useEffect, useState } from 'react';
import { api, fmtAt } from '@/lib/client/api';

interface Entry { at: string; action: string; detail: string; ip: string; email: string | null }

export default function Audit() {
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('GET', '/api/audit-log').then((r) => { if (r.ok) setRows(r.j.log); else setError(r.j.error || 'Not allowed.'); });
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Audit log</h2>
          <p>Sign-ins, wrong passwords, password changes, new people and signatures. The latest 300 entries are shown.</p>
        </div>
      </div>
      {error && <p className="msg">{error}</p>}
      {rows && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Person</th><th>Action</th><th>Detail</th><th>From</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}><td>{fmtAt(r.at)}</td><td>{r.email ?? '—'}</td><td><span className={'tag' + (/wrong|locked|unknown/.test(r.action) ? ' bad' : '')}>{r.action}</span></td><td>{r.detail}</td><td className="mono">{r.ip}</td></tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <div className="empty">Nothing recorded yet.</div>}
        </div>
      )}
    </>
  );
}
