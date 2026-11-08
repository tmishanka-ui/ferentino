'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Html5Qrcode } from 'html5-qrcode';
import { api } from '@/lib/client/api';
import { BinCard } from '@/components/stores/BinCard';
import { DEPARTMENTS, StoreItemOut, StoreTxnRow, extractScanCode, fmtQty, today } from '@/lib/client/storesCommon';

const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
const CAM_ID = 'stores-camera-view';

function animateNumber(from: number, to: number, setter: (n: number) => void) {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce || from === to) { setter(to); return; }
  const start = performance.now(), dur = 650;
  function step(t: number) {
    const p = Math.min(1, (t - start) / dur);
    setter(round3(from + (to - from) * p));
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

export default function IssueTab() {
  const [items, setItems] = useState<StoreItemOut[]>([]);
  const [scanText, setScanText] = useState('');
  const [item, setItem] = useState<StoreItemOut | null>(null);
  const [displayBalance, setDisplayBalance] = useState<number | null>(null);
  const [recent, setRecent] = useState<StoreTxnRow[]>([]);
  const [error, setError] = useState('');
  const [camera, setCamera] = useState(false);
  const [binOpen, setBinOpen] = useState(false);

  const [qty, setQty] = useState(''), [department, setDepartment] = useState(''), [person, setPerson] = useState('');
  const [ref, setRef] = useState(''), [date, setDate] = useState(today()), [remarks, setRemarks] = useState('');
  const [msg, setMsg] = useState(''), [doneMsg, setDoneMsg] = useState(''), [busy, setBusy] = useState(false);

  const scanRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const load = useCallback(() => { api('GET', '/api/stores/items').then((r) => { if (r.ok) setItems(r.j.items || []); }); }, []);
  useEffect(() => { load(); scanRef.current?.focus(); }, [load]);

  const stopCamera = useCallback(async () => {
    const inst = scannerRef.current;
    scannerRef.current = null;
    setCamera(false);
    if (inst) { try { await inst.stop(); } catch { /* already stopped */ } try { await inst.clear(); } catch { /* ignore */ } }
  }, []);
  useEffect(() => {
    const onHide = () => { if (document.hidden) stopCamera(); };
    document.addEventListener('visibilitychange', onHide);
    return () => { document.removeEventListener('visibilitychange', onHide); stopCamera(); };
  }, [stopCamera]);

  const suggestions = useMemo(() => {
    const q = scanText.trim().toLowerCase();
    if (!q || item) return [];
    return items.filter((i) => i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q)).slice(0, 6);
  }, [scanText, items, item]);

  const loadItem = useCallback(async (codeOrName: string) => {
    const text = codeOrName.trim();
    if (!text) return;
    setError('');
    const code = extractScanCode(text) || text.toUpperCase();
    let r = await api('GET', `/api/stores/items/${encodeURIComponent(code)}`);
    if (!r.ok) {
      const match = items.find((i) => i.name.toLowerCase() === text.toLowerCase());
      if (match) r = await api('GET', `/api/stores/items/${encodeURIComponent(match.code)}`);
    }
    if (!r.ok) { setError('Item not found. Check the code, or search by name below.'); return; }
    setItem(r.j.item); setDisplayBalance(r.j.item.balance); setRecent((r.j.txns || []).slice(0, 5));
    setScanText(''); setDoneMsg(''); setMsg('');
  }, [items]);

  async function startCamera() {
    setError('');
    try {
      const mod = await import('html5-qrcode');
      const inst = new mod.Html5Qrcode(CAM_ID);
      scannerRef.current = inst;
      setCamera(true);
      await inst.start(
        { facingMode: 'environment' }, { fps: 10, qrbox: 220 },
        (decoded: string) => { loadItem(decoded); stopCamera(); },
        () => { /* no code in this frame yet */ },
      );
    } catch {
      setCamera(false);
      setError('Camera not available. Use "Scan from a photo" instead, or type the code.');
    }
  }

  async function onPhoto(file: File) {
    setError('');
    try {
      const mod = await import('html5-qrcode');
      const inst = new mod.Html5Qrcode(CAM_ID);
      const text: string = await inst.scanFile(file, false);
      try { await inst.clear(); } catch { /* ignore */ }
      loadItem(text);
    } catch {
      setError('No QR code could be found in that photo.');
    }
  }

  async function doIssue(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    const qn = Number(qty);
    setMsg('');
    if (!qn || qn <= 0) { setMsg('Enter a quantity greater than zero.'); return; }
    if (qn > item.balance + 1e-9) { setMsg(`Only ${item.balance} ${item.unit} in stores.`); return; }
    if (!department.trim()) { setMsg('Choose the department.'); return; }
    setBusy(true);
    const r = await api('POST', '/api/stores/issue', { code: item.code, qty: qn, date, party: department, person, ref, remarks });
    setBusy(false);
    if (!r.ok) { setMsg(r.j.error || 'Could not issue.'); return; }
    animateNumber(r.j.balanceBefore, r.j.balanceAfter, setDisplayBalance);
    setItem((prev) => prev ? { ...prev, balance: r.j.balanceAfter, issued: round3(prev.issued + qn) } : prev);
    const row: StoreTxnRow = { id: 'just-now', code: item.code, type: 'I', date, ts: Date.now(), qty: qn, ref, party: department, person, remarks, enteredBy: '', balanceAfter: r.j.balanceAfter };
    setRecent((prev) => [row, ...prev].slice(0, 5));
    setDoneMsg(`Issued ${fmtQty(qn)} ${r.j.unit} to ${department}. Balance ${r.j.balanceBefore} → ${r.j.balanceAfter} ${r.j.unit}.`);
    setQty(''); setRef(''); setRemarks('');
    load();
    scanRef.current?.focus();
  }

  const low = item && item.minLevel != null && item.balance <= item.minLevel;

  return (
    <>
      <div className="scan-wrap">
        <label className="field" style={{ marginTop: 0 }}><span>Scan the QR label, or type the code or name</span>
          <input ref={scanRef} className="input lg" value={scanText} autoFocus
            onChange={(e) => setScanText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); loadItem(scanText); } }}
            placeholder="FITL-ST-00001" />
        </label>
        {!!suggestions.length && (
          <div className="suggest">
            {suggestions.map((it) => (
              <button type="button" key={it.code} onClick={() => loadItem(it.code)}>
                <span>{it.code} — {it.name}</span><span className="bal">{it.balance} {it.unit}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="row">
        <button type="button" className="btn" onClick={camera ? stopCamera : startCamera}>{camera ? 'Stop camera' : 'Scan with camera'}</button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Scan from a photo</button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhoto(f); e.target.value = ''; }} />
      </div>
      <div id={CAM_ID} style={{ width: camera ? 260 : 0, height: camera ? 260 : 0, margin: camera ? '14px 0' : 0, overflow: 'hidden', borderRadius: 10 }} />
      {error && <p className="msg" role="alert">{error}</p>}

      {item && (
        <div className="bin-panel" style={{ marginTop: 18 }}>
          <div className="bin-top">
            <div>
              <h3 style={{ marginBottom: 4 }}>{item.name}</h3>
              <p className="sub">{item.code} · Bin {item.location || '—'}</p>
              <div className={'bin-balance' + (low ? ' low' : '')} style={{ marginTop: 10 }}>
                {displayBalance ?? item.balance}<span className="unit"> {item.unit}</span>
              </div>
              {low && <div className="tag bad" style={{ marginTop: 6 }}>At or below minimum</div>}
            </div>
            <button type="button" className="btn sm" onClick={() => setBinOpen(true)}>Open bin card</button>
          </div>

          <form onSubmit={doIssue} style={{ marginTop: 18 }}>
            <div className="grid2">
              <label className="field" style={{ marginTop: 0 }}><span>Quantity to issue (max {item.balance} {item.unit})</span>
                <input className="input lg" type="number" min="0" max={item.balance} step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
              </label>
              <label className="field" style={{ marginTop: 0 }}><span>Department</span>
                <input className="input lg" list="stores-departments" value={department} onChange={(e) => setDepartment(e.target.value)} />
                <datalist id="stores-departments">{DEPARTMENTS.map((d) => <option key={d} value={d} />)}</datalist>
              </label>
              <label className="field"><span>Issued to</span><input className="input" value={person} onChange={(e) => setPerson(e.target.value)} /></label>
              <label className="field"><span>Issue note / MRN no.</span><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} /></label>
              <label className="field"><span>Date</span><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
              <label className="field"><span>Remarks</span><input className="input" value={remarks} onChange={(e) => setRemarks(e.target.value)} /></label>
            </div>
            <p className="msg" role="alert">{msg}</p>
            {doneMsg && <p className="msg ok" role="status">{doneMsg}</p>}
            <div className="row"><button className="btn red" disabled={busy || item.balance <= 0}>Issue</button></div>
          </form>

          <div className="table-wrap" style={{ marginTop: 18 }}>
            <table>
              <thead><tr><th>Date</th><th>Type</th><th>Qty</th><th>Department / supplier</th><th>Balance after</th></tr></thead>
              <tbody>
                {recent.map((t) => (
                  <tr key={t.id}><td>{t.date}</td><td>{t.type === 'R' ? 'Received' : 'Issued'}</td><td>{t.qty}</td><td>{t.party || '—'}</td><td>{t.balanceAfter}</td></tr>
                ))}
              </tbody>
            </table>
            {!recent.length && <div className="empty">No movements yet.</div>}
          </div>
        </div>
      )}

      {binOpen && item && <BinCard code={item.code} onClose={() => setBinOpen(false)} onChanged={() => { loadItem(item.code); load(); }} />}
    </>
  );
}
