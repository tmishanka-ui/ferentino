'use client';

import { useEffect, useState } from 'react';
import { qrDataUrl, downloadDataUrl } from '@/lib/client/qr';
import { buildLabelSheetHtml, printLabelSheet } from '@/lib/client/labels';

/** The QR label for one item: the code, name and bin shown next to the QR image, with print / save buttons. */
export function QrLabel({ code, name, location, unit, size = 120 }: { code: string; name: string; location: string; unit: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState('');
  useEffect(() => {
    let on = true;
    qrDataUrl(code, size * 2).then((d) => { if (on) setDataUrl(d); });
    return () => { on = false; };
  }, [code, size]);

  return (
    <div className="qr-box">
      <div className="qr-row">
        {dataUrl ? <img src={dataUrl} width={size} height={size} alt={`QR code ${code}`} /> : <div className="qr-ph" style={{ width: size, height: size }} />}
        <div>
          <div className="qr-code">{code}</div>
          <div>{name}</div>
          <div className="sub">Bin {location || '—'}, Unit {unit}</div>
        </div>
      </div>
      <div className="row">
        <button type="button" className="btn sm" onClick={() => buildLabelSheetHtml([{ code, name, location, unit }]).then(printLabelSheet)}>Print label</button>
        <button type="button" className="btn sm" disabled={!dataUrl} onClick={() => dataUrl && downloadDataUrl(dataUrl, `${code}.png`)}>Save QR image</button>
      </div>
    </div>
  );
}
