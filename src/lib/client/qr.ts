import QRCode from 'qrcode';

/** A PNG data URL for a QR code holding just the item code. */
export function qrDataUrl(text: string, size = 220): Promise<string> {
  return QRCode.toDataURL(text, { width: size, margin: 1, color: { dark: '#000000', light: '#ffffff' } });
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
