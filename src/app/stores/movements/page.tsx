'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { downloadExcel } from '@/lib/client/xlsx-export';
import { MovementRow, today } from '@/lib/client/storesCommon';

export default function MovementsTab() {
  const [rows, setRows] = useState<MovementRow[]>([]);
  const [total, setTotal] = useState(0), [receipts, setReceipts] = useState(0), [issues, setIssues] = useState(0);
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [type, setType] = useState(''), [search, setSearch] = useState('');

  const query = useCallback(() => {
    const p = new URLSearchParams();
    if (from) p.set('from', from); if (to) p.set('to', to); if (type) p.set('type', type); if (search.trim()) p.set('search', search.trim());
    return p;
  }, [from, to, type, search]);

  const load = useCallback(() => {
    api('GET', '/api/stores/txns?' + query().toString()).then((r) => {
      if (!r.ok) return;
      setRows(r.j.txns || []); setTotal(r.j.total || 0); setReceipts(r.j.receipts || 0); setIssues(r.j.issues || 0);
    });
  }, [query]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  async function downloadAll() {
    const p = query(); p.set('all', '1');
    const r = await api('GET', '/api/stores/txns?' + p.toString());
    if (!r.ok) { alert(r.j.error || 'Could not export.'); return; }
    const data = (r.j.txns || []) as MovementRow[];
    downloadExcel(`FITL_Stores_Movements_${today()}.xlsx`, 'Movements', ['Date', 'Code', 'Item', 'Type', 'Qty', 'Unit', 'Reference', 'Supplier / department', 'Person', 'Balance after', 'Remarks'],
      data.map((t) => ({ Date: t.date, Code: t.code, Item: t.itemName, Type: t.type === 'R' ? 'Received' : 'Issued', Qty: t.qty, Unit: t.unit, Reference: t.ref, 'Supplier / department': t.party, Person: t.person, 'Balance after': t.balanceAfter, Remarks: t.remarks })));
  }

  return (
    <>
      <div className="filters">
        <label className="field"><span>From</span><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="field"><span>To</span><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="field"><span>Type</span>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All</option><option value="R">Received</option><option value="I">Issued</option>
          </select>
        </label>
        <label className="field"><span>Search</span><input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Item, department, person or reference" /></label>
      </div>
      <div className="row" style={{ marginTop: 0, marginBottom: 14 }}>
        <button type="button" className="btn" onClick={downloadAll}>Download (Excel)</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Code</th><th>Item</th><th>Type</th><th>Qty</th><th>Reference</th><th>Supplier / department</th><th>Person</th><th>Balance after</th><th>Remarks</th></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td>{t.date}</td><td className="mono">{t.code}</td><td>{t.itemName}</td>
                <td style={{ color: t.type === 'R' ? 'var(--ok)' : 'var(--warn)', fontWeight: 600 }}>{t.type === 'R' ? 'Received' : 'Issued'}</td>
                <td>{t.qty} {t.unit}</td><td>{t.ref || '—'}</td><td>{t.party || '—'}</td><td>{t.person || '—'}</td><td>{t.balanceAfter}</td><td>{t.remarks || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty">No movements match.</div>}
      </div>
      <p className="count-line">{total} total · {receipts} receipts · {issues} issues{total > rows.length ? ` · showing the latest ${rows.length}` : ''}</p>
    </>
  );
}
