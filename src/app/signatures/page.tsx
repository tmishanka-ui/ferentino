'use client';

import { useEffect, useState } from 'react';
import { api, fmtAt } from '@/lib/client/api';

interface Sig { id: number; name: string; designation: string; purpose: string; ref: string; at: string }

export default function Signatures() {
  const [rows, setRows] = useState<Sig[] | null>(null);
  const [ref, setRef] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      api('GET', '/api/signatures' + (ref.trim() ? '?ref=' + encodeURIComponent(ref.trim()) : '')).then((r) => setRows(r.j.signatures || []));
    }, 250);
    return () => clearTimeout(t);
  }, [ref]);

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Signature log</h2>
          <p>Every document signed with a password: who signed, when, and which record. The latest 200 are shown.</p>
        </div>
        <label className="field" style={{ margin: 0, minWidth: 260 }}><span>Find by record</span><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. FIT/Q/QM-01" /></label>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>No</th><th>When</th><th>Signed by</th><th>What</th><th>Record</th></tr></thead>
          <tbody>
            {rows?.map((s) => (
              <tr key={s.id}><td>#{s.id}</td><td>{fmtAt(s.at)}</td><td>{s.name}<div className="sub">{s.designation}</div></td><td>{s.purpose}</td><td>{s.ref}</td></tr>
            ))}
          </tbody>
        </table>
        {rows && !rows.length && <div className="empty">Nothing has been signed yet.</div>}
        {!rows && <div className="empty">Loading…</div>}
      </div>
    </>
  );
}
