'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { toast } from '@/lib/client/store';
import { Modal } from '@/components/Modal';
import { QrLabel } from './QrLabel';
import { StoreItemOut, StoreTxnRow, UNITS } from '@/lib/client/storesCommon';

/** The item's full history as a modal: name, code, big balance, QR label, and every receipt/issue with a running balance. */
export function BinCard({ code, onClose, onChanged }: { code: string; onClose: () => void; onChanged?: () => void }) {
  const [item, setItem] = useState<StoreItemOut | null>(null);
  const [rows, setRows] = useState<StoreTxnRow[]>([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api('GET', `/api/stores/items/${encodeURIComponent(code)}`);
    if (!r.ok) { setError(r.j.error || 'Item not found.'); return; }
    setItem(r.j.item); setRows(r.j.txns || []);
  }, [code]);
  useEffect(() => { load(); }, [load]);

  async function del(id: string) {
    if (confirmId !== id) { setConfirmId(id); return; }
    const r = await api('DELETE', `/api/stores/txns/${encodeURIComponent(id)}`);
    setConfirmId(null);
    if (!r.ok) { toast(r.j.error || 'Could not delete that movement.'); return; }
    load(); onChanged?.();
  }

  if (error) return <Modal title="Bin card" onClose={onClose}><p className="msg">{error}</p></Modal>;
  if (!item) return <Modal title="Bin card" onClose={onClose}><p className="hint">Loading…</p></Modal>;

  const low = item.minLevel != null && item.balance <= item.minLevel;

  return (
    <Modal title={item.name} sub={`${item.code} · ${item.category || 'No category'}`} onClose={onClose} wide>
      {editing ? (
        <EditItemForm item={item} onCancel={() => setEditing(false)} onSaved={(it) => { setItem(it); setEditing(false); onChanged?.(); }} />
      ) : (
        <>
          <div className="bin-top">
            <div className={'bin-balance' + (low ? ' low' : '')}>
              {item.balance}<span className="unit"> {item.unit}</span>
              {low && <div className="tag bad" style={{ marginTop: 6 }}>At or below minimum</div>}
            </div>
            <QrLabel code={item.code} name={item.name} location={item.location} unit={item.unit} />
          </div>
          <div className="row">
            <button type="button" className="btn sm" onClick={() => setEditing(true)}>Edit item details</button>
          </div>

          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table>
              <thead><tr><th>Date</th><th>Reference</th><th>Supplier / department</th><th>Person</th><th>Received</th><th>Issued</th><th>Balance</th><th>Remarks</th><th /></tr></thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td>{t.date}</td>
                    <td>{t.ref || '—'}</td>
                    <td>{t.party || '—'}</td>
                    <td>{t.person || '—'}</td>
                    <td>{t.type === 'R' ? t.qty : ''}</td>
                    <td>{t.type === 'I' ? t.qty : ''}</td>
                    <td>{t.balanceAfter}</td>
                    <td>{t.remarks || '—'}</td>
                    <td className="act">
                      <button type="button" className={'btn sm' + (confirmId === t.id ? ' danger' : '')} onClick={() => del(t.id)}>
                        {confirmId === t.id ? 'Confirm delete' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <div className="empty">No movements recorded for this item yet.</div>}
          </div>
        </>
      )}
    </Modal>
  );
}

function EditItemForm({ item, onCancel, onSaved }: { item: StoreItemOut; onCancel: () => void; onSaved: (it: StoreItemOut) => void }) {
  const [name, setName] = useState(item.name), [category, setCategory] = useState(item.category);
  const [unit, setUnit] = useState(item.unit), [location, setLocation] = useState(item.location);
  const [minLevel, setMinLevel] = useState(item.minLevel == null ? '' : String(item.minLevel));
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg('');
    const r = await api('PATCH', `/api/stores/items/${encodeURIComponent(item.code)}`, { name, category, unit, location, minLevel: minLevel === '' ? null : Number(minLevel) });
    setBusy(false);
    if (!r.ok) { setMsg(r.j.error || 'Could not save.'); return; }
    onSaved(r.j.item);
  }

  return (
    <form onSubmit={go}>
      <div className="grid2">
        <label className="field"><span>Item name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
        <label className="field"><span>Category</span><input className="input" value={category} onChange={(e) => setCategory(e.target.value)} /></label>
        <label className="field"><span>Unit</span>
          <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
        </label>
        <label className="field"><span>Store location / bin</span><input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Rack B-3" /></label>
        <label className="field"><span>Minimum level</span><input className="input" type="number" min="0" step="any" value={minLevel} onChange={(e) => setMinLevel(e.target.value)} placeholder="None" /></label>
      </div>
      <p className="msg" role="alert">{msg}</p>
      <div className="row"><button className="btn red" disabled={busy}>Save</button><button type="button" className="btn" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}
