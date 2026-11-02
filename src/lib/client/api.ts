export interface ApiResult<T = any> { ok: boolean; status: number; j: T }

/** one call to this site's own API; state-changing calls carry the header the server insists on */
export function api<T = any>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (method !== 'GET') headers['X-FIT-Request'] = '1';
  return fetch(path, { method, credentials: 'same-origin', headers, body: body ? JSON.stringify(body) : undefined })
    .then((r) => r.json().catch(() => ({})).then((j) => ({ ok: r.ok, status: r.status, j: (j || {}) as T })));
}

export interface RawResult { ok: boolean; status: number; j: any; text: string; r: Response }

/** like api(), for the records: the body is plain text and the answer is read as text first */
export function rawFetch(method: string, path: string, opt: { headers?: Record<string, string>; body?: BodyInit } = {}): Promise<RawResult> {
  const headers = { ...(opt.headers || {}) };
  if (method !== 'GET') headers['X-FIT-Request'] = '1';
  return fetch(path, { method, credentials: 'same-origin', headers, body: opt.body }).then((r) =>
    r.text().then((text) => {
      let j: any = null;
      try { j = JSON.parse(text); } catch { /* not JSON */ }
      return { ok: r.ok, status: r.status, j: j || {}, text, r };
    }));
}

export function fmtAt(s?: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** SHA-256 of a text, written without crypto.subtle so it also works on a plain http:// company address */
export function sha256(str: string): string {
  const enc = unescape(encodeURIComponent(String(str)));
  const l = enc.length;
  let i: number, j: number;
  const K: number[] = [], H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  let p = 0, c = 2, isP: boolean;
  while (p < 64) {
    isP = true;
    for (i = 2; i * i <= c; i++) if (c % i === 0) { isP = false; break; }
    if (isP) K[p++] = (Math.pow(c, 1 / 3) * 4294967296) | 0;
    c++;
  }
  const m: number[] = [];
  for (i = 0; i < l; i++) m[i >> 2] |= enc.charCodeAt(i) << (24 - (i % 4) * 8);
  m[l >> 2] |= 0x80 << (24 - (l % 4) * 8);
  m[(((l + 8) >> 6) + 1) * 16 - 1] = l * 8;
  for (j = 0; j < m.length; j += 16) {
    let a = H.slice(0);
    const t: number[] = [];
    for (i = 0; i < 64; i++) {
      if (i < 16) t[i] = m[j + i] | 0;
      else {
        const g = t[i - 15], d = t[i - 2];
        t[i] = (t[i - 16] + (((g >>> 7) | (g << 25)) ^ ((g >>> 18) | (g << 14)) ^ (g >>> 3)) + t[i - 7] + (((d >>> 17) | (d << 15)) ^ ((d >>> 19) | (d << 13)) ^ (d >>> 10))) | 0;
      }
      const e = a[4], f = a[5], gg = a[6];
      const T1 = (a[7] + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & gg)) + K[i] + t[i]) | 0;
      const A = a[0];
      const T2 = ((((A >>> 2) | (A << 30)) ^ ((A >>> 13) | (A << 19)) ^ ((A >>> 22) | (A << 10))) + ((A & a[1]) ^ (A & a[2]) ^ (a[1] & a[2]))) | 0;
      a = [(T1 + T2) | 0, A, a[1], a[2], (a[3] + T1) | 0, e, f, gg];
    }
    for (i = 0; i < 8; i++) H[i] = (H[i] + a[i]) | 0;
  }
  let out = '';
  for (i = 0; i < 8; i++) out += ('00000000' + (H[i] >>> 0).toString(16)).slice(-8);
  return out;
}
