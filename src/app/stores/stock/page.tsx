'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client/api';
import { downloadExcel } from '@/lib/client/xlsx-export';
import { buildLabelSheetHtml, downloadHtml, printLabelSheet } from '@/lib/client/labels';
import { BinCard } from '@/components/stores/BinCard';
import { StoreItemOut, today } from '@/lib/client/storesCommon';

export default function StockTab() {
  const [items, setItems] = useState<StoreItemOut[]>([]);
  const [search, setSearch] = useState(''), [category, setCategory] = useState(''), [belowMin, setBelowMin] = useState(false);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);

  const load = () => api('GET', '/api/stores/items').then((r) => { if (r.ok) setItems(r.j.items || []); });
  useEffect(() => { load(); }, []);

  const categories = useMemo(() => Array.from(new Set(items.map((i) => i.category).filter(Boolean))).sort(), [items]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (category && i.category !== category) return false;
      if (belowMin && !(i.minLevel != null && i.balance <= i.minLevel)) return false;
      if (q && !i.code.toLowerCase().includes(q) && !i.name.toLowerCase().includes(q) && !i.location.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, category, belowMin]);
  const lowCount = useMemo(() => items.filter((i) => i.minLevel != null && i.balance <= i.minLevel).length, [items]);

  function toggle(code: string) {
    setTicked((prev) => { const n = new Set(prev); if (n.has(code)) n.delete(code); else n.add(code); return n; });
  }
  function toggleAll() {
    setTicked((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.code))));
  }

  async function printTicked() {
    const picked = rows.filter((r) => ticked.has(r.code));
    if (!picked.length) { alert('Tick at least one item first.'); return; }
    printLabelSheet(await buildLabelSheetHtml(picked));
  }
  async function downloadTicked() {
    const picked = rows.filter((r) => ticked.has(r.code));
    if (!picked.length) { alert('Tick at least one item first.'); return; }
    downloadHtml(await buildLabelSheetHtml(picked), `FITL_Stores_QR_labels_${today()}.html`);
  }
  function downloadStockExcel() {
    downloadExcel(`FITL_Stores_Stock_${today()}.xlsx`, 'Stock', ['Code', 'Item', 'Category', 'Location', 'Unit', 'Received', 'Issued', 'Balance', 'Minimum level', 'Status'],
      rows.map((r) => ({
        Code: r.code, Item: r.name, Category: r.category, Location: r.location, Unit: r.unit, Received: r.received, Issued: r.issued, Balance: r.balance,
        'Minimum level': r.minLevel ?? '', Status: r.minLevel != null && r.balance <= r.minLevel ? 'Reorder' : 'OK',
      })));
  }

  return (
    <>
      <div className="filters">
        <label className="field"><span>Search</span><input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Code, name or location" /></label>
        <label className="field"><span>Category</span>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="field checkbox"><input type="checkbox" checked={belowMin} onChange={(e) => setBelowMin(e.target.checked)} style={{ marginRight: 8 }} />Below minimum only</label>
      </div>

      <div className="row" style={{ marginTop: 0, marginBottom: 14 }}>
        <button type="button" className="btn" onClick={printTicked}>Print labels for ticked items</button>
        <button type="button" className="btn" onClick={downloadTicked}>Download label sheet</button>
        <button type="button" className="btn" onClick={downloadStockExcel}>Download stock (Excel)</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr>
            <th><input type="checkbox" checked={!!rows.length && ticked.size === rows.length} onChange={toggleAll} /></th>
            <th>Code</th><th>Item</th><th>Category</th><th>Location</th><th>Received</th><th>Issued</th><th>Balance</th><th>Unit</th><th>Minimum</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const low = r.minLevel != null && r.balance <= r.minLevel;
              return (
                <tr key={r.code} className={low ? 'low' : ''}>
                  <td><input type="checkbox" checked={ticked.has(r.code)} onChange={() => toggle(r.code)} /></td>
                  <td className="mono">{r.code}</td>
                  <td><button type="button" className="btn ghost sm" style={{ padding: 0, minHeight: 'auto' }} onClick={() => setOpen(r.code)}>{r.name}</button></td>
                  <td>{r.category || '—'}</td>
                  <td>{r.location || '—'}</td>
                  <td>{r.received}</td><td>{r.issued}</td><td>{r.balance}</td><td>{r.unit}</td><td>{r.minLevel ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div className="empty">No items match.</div>}
      </div>
      <p className="count-line">{rows.length} item{rows.length === 1 ? '' : 's'} shown · {lowCount} at or below minimum · {ticked.size} ticked</p>

      {open && <BinCard code={open} onClose={() => setOpen(null)} onChanged={load} />}
    </>
  );
}
