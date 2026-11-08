export interface StoreItemOut {
  code: string; name: string; category: string; unit: string; location: string; minLevel: number | null;
  received: number; issued: number; balance: number; createdAt: string; createdBy: string;
}
export interface StoreTxnRow {
  id: string; code: string; type: 'R' | 'I'; date: string; ts: number; qty: number;
  ref: string; party: string; person: string; remarks: string; enteredBy: string; balanceAfter: number;
}
export interface MovementRow extends StoreTxnRow { itemName: string; unit: string }

export const UNITS = ['Nos', 'kg', 'g', 'L', 'ml', 'm', 'Box', 'Roll', 'Set', 'Pair', 'Packet', 'Drum'];
export const DEPARTMENTS = ['Production', 'Mixing', 'Curing', 'Maintenance', 'QC / QA', 'Boiler', 'HR', 'Planning', 'Finance', 'Export', 'Stores'];

export const today = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** USB/Bluetooth scanners type the code then press Enter; this pulls a FITL-ST-nnnnn code out even if the scanner adds stray characters. */
export const SCAN_CODE_RE = /FITL-ST-\d{3,}/i;
export function extractScanCode(raw: string): string | null {
  const m = raw.match(SCAN_CODE_RE);
  return m ? m[0].toUpperCase() : null;
}

const SUPPLIERS_KEY = 'fitl_stores_recent_suppliers';
export function recentSuppliers(): string[] {
  try { return JSON.parse(localStorage.getItem(SUPPLIERS_KEY) || '[]'); } catch { return []; }
}
export function rememberSupplier(name: string) {
  if (!name.trim()) return;
  try {
    const list = [name, ...recentSuppliers().filter((s) => s.toLowerCase() !== name.toLowerCase())].slice(0, 25);
    localStorage.setItem(SUPPLIERS_KEY, JSON.stringify(list));
  } catch { /* storage unavailable */ }
}

export const fmtQty = (n: number): string => (Math.round(n * 1000) / 1000).toString();
