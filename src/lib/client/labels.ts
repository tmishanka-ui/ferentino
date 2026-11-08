import { qrDataUrl } from './qr';

export interface LabelItem { code: string; name: string; location: string; unit: string }

const esc = (s: string) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** One self-contained, printable HTML page with a QR label (64x34mm, QR ~26mm) for every item given. */
export async function buildLabelSheetHtml(items: LabelItem[]): Promise<string> {
  const withQr = await Promise.all(items.map(async (it) => ({ ...it, dataUrl: await qrDataUrl(it.code, 300) })));
  const labels = withQr.map((it) => `
    <div class="label">
      <img class="qr" src="${it.dataUrl}" alt="${esc(it.code)}" />
      <div class="info">
        <div class="code">${esc(it.code)}</div>
        <div class="name">${esc(it.name)}</div>
        <div class="bin">Bin ${esc(it.location || '—')}, Unit ${esc(it.unit)}</div>
      </div>
    </div>`).join('');
  return `<!doctype html>
<html><head><meta charset="utf-8" /><title>Stores QR labels</title>
<style>
  @page { size: A4; margin: 8mm; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; }
  .bar { padding: 10px; }
  .bar button { min-height: 34px; padding: 0 16px; }
  .sheet { display: flex; flex-wrap: wrap; gap: 3mm; padding: 0 3mm; }
  .label { width: 64mm; height: 34mm; border: 1px dashed #999; padding: 2mm; display: flex; align-items: center; gap: 2mm; break-inside: avoid; page-break-inside: avoid; }
  .qr { width: 26mm; height: 26mm; flex: none; }
  .info { overflow: hidden; }
  .code { font-weight: 700; font-size: 11pt; white-space: nowrap; }
  .name { font-size: 8.5pt; margin-top: 1mm; max-width: 30mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bin { font-size: 8pt; color: #333; margin-top: 1mm; }
  @media print { .bar { display: none; } }
</style>
</head><body>
  <div class="bar"><button onclick="window.print()">Print</button></div>
  <div class="sheet">${labels}</div>
</body></html>`;
}

export function printLabelSheet(html: string) {
  const win = window.open('', '_blank');
  if (!win) { alert('The browser blocked the print window. Allow pop-ups for this site and try again.'); return; }
  win.document.open(); win.document.write(html); win.document.close();
  win.focus();
  const go = () => { try { win.print(); } catch { /* ignore */ } };
  if (win.document.readyState === 'complete') setTimeout(go, 300);
  else win.addEventListener('load', () => setTimeout(go, 300));
}

export function downloadHtml(html: string, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
