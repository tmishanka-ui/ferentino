'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client/api';
import { QrLabel } from '@/components/stores/QrLabel';
import { StoreItemOut, UNITS, today, recentSuppliers, rememberSupplier, fmtQty } from '@/lib/client/storesCommon';

export default function ReceiveTab() {
  const [items, setItems] = useState<StoreItemOut[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [mode, setMode] = useState<'existing' | 'new'>('existing');

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<StoreItemOut | null>(null);

  const [name, setName] = useState(''), [category, setCategory] = useState(''), [unit, setUnit] = useState('Nos');
  const [location, setLocation] = useState(''), [minLevel, setMinLevel] = useState('');

  const [date, setDate] = useState(today()), [ref, setRef] = useState(''), [party, setParty] = useState('');
  const [qty, setQty] = useState(''), [person, setPerson] = useState(''), [remarks, setRemarks] = useState('');
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ message: string; item: StoreItemOut } | null>(null);

  const load = useCallback(() => { api('GET', '/api/stores/items').then((r) => { if (r.ok) setItems(r.j.items || []); }); }, []);
  useEffect(() => { load(); setSuppliers(recentSuppliers()); }, [load]);

  const categories = useMemo(() => Array.from(new Set(items.map((i) => i.category).filter(Boolean))).sort(), [items]);
  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || selected) return [];
    return items.filter((i) => i.code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)).slice(0, 6);
  }, [search, items, selected]);

  function resetAfterSave() {
    setRef(''); setQty(''); setRemarks(''); setSelected(null); setSearch('');
    setName(''); setCategory(''); setUnit('Nos'); setLocation(''); setMinLevel('');
  }

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setMsg(''); setResult(null);
    const qn = Number(qty);
    if (mode === 'existing' && !selected) { setMsg('Pick the item from the list, or switch to New item.'); return; }
    if (mode === 'new' && !name.trim()) { setMsg('Enter the item name.'); return; }
    if (!qn || qn <= 0) { setMsg('Enter a quantity greater than zero.'); return; }
    if (!party.trim()) { setMsg('Enter the supplier.'); return; }
    setBusy(true);
    const body: Record<string, unknown> = mode === 'existing'
      ? { code: selected!.code, date, ref, party, person, remarks, qty: qn }
      : { name, category, unit, location, minLevel: minLevel === '' ? null : Number(minLevel), date, ref, party, person, remarks, qty: qn };
    const r = await api('POST', '/api/stores/receive', body);
    setBusy(false);
    if (!r.ok) { setMsg(r.j.error || 'Could not save the receipt.'); return; }
    rememberSupplier(party); setSuppliers(recentSuppliers());
    setResult({ message: `Received ${fmtQty(qn)} ${r.j.item.unit} of ${r.j.item.name}. Balance now ${r.j.balance} ${r.j.item.unit}.`, item: r.j.item });
    resetAfterSave();
    load();
  }

  return (
    <>
      <div className="toggle2" role="tablist" aria-label="Receive mode">
        <button type="button" className={mode === 'existing' ? 'on' : ''} onClick={() => { setMode('existing'); setResult(null); }}>Item already in stores</button>
        <button type="button" className={mode === 'new' ? 'on' : ''} onClick={() => { setMode('new'); setResult(null); }}>New item</button>
      </div>

      <form onSubmit={go}>
        {mode === 'existing' ? (
          <div className="scan-wrap">
            <label className="field"><span>Find the item</span>
              <input className="input" value={selected ? `${selected.code} — ${selected.name}` : search}
                onChange={(e) => { setSelected(null); setSearch(e.target.value); }} placeholder="Type the code or name" />
            </label>
            {!!suggestions.length && (
              <div className="suggest">
                {suggestions.map((it) => (
                  <button type="button" key={it.code} onClick={() => { setSelected(it); setSearch(''); }}>
                    <span>{it.code} — {it.name}</span><span className="bal">{it.balance} {it.unit}</span>
                  </button>
                ))}
              </div>
            )}
            {selected && <p className="hint">Current balance {selected.balance} {selected.unit} · Bin {selected.location || '—'}</p>}
          </div>
        ) : (
          <div className="grid2">
            <label className="field"><span>Item name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
            <label className="field"><span>Category</span>
              <input className="input" list="stores-categories" value={category} onChange={(e) => setCategory(e.target.value)} />
              <datalist id="stores-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
            <label className="field"><span>Unit</span>
              <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
            </label>
            <label className="field"><span>Store location / bin</span><input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Rack B-3" /></label>
            <label className="field"><span>Minimum level</span><input className="input" type="number" min="0" step="any" value={minLevel} onChange={(e) => setMinLevel(e.target.value)} placeholder="None" /></label>
          </div>
        )}

        <div className="grid2">
          <label className="field"><span>Date</span><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="field"><span>GRN / invoice no.</span><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} /></label>
          <label className="field"><span>Supplier</span>
            <input className="input" list="stores-suppliers" value={party} onChange={(e) => setParty(e.target.value)} />
            <datalist id="stores-suppliers">{suppliers.map((s) => <option key={s} value={s} />)}</datalist>
          </label>
          <label className="field"><span>Quantity received{(mode === 'new' ? unit : selected?.unit) ? ` (${mode === 'new' ? unit : selected?.unit})` : ''}</span>
            <input className="input" type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
          </label>
          <label className="field"><span>Received by</span><input className="input" value={person} onChange={(e) => setPerson(e.target.value)} /></label>
          <label className="field"><span>Remarks</span><input className="input" value={remarks} onChange={(e) => setRemarks(e.target.value)} /></label>
        </div>

        <p className="msg" role="alert">{msg}</p>
        <div className="row"><button className="btn red" disabled={busy}>Save receipt and make QR label</button></div>
      </form>

      {result && (
        <div className="bin-panel" style={{ marginTop: 22 }}>
          <p className="msg ok" role="status">{result.message}</p>
          <QrLabel code={result.item.code} name={result.item.name} location={result.item.location} unit={result.item.unit} />
        </div>
      )}
    </>
  );
}
