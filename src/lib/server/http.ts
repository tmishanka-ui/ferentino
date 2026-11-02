import { NextRequest, NextResponse } from 'next/server';
import { env } from './env';
import { store, User, Store } from './db';
import { sha256 } from './security';

export class ApiError extends Error {
  constructor(public status: number, message: string, public extra?: unknown) { super(message); }
}

export interface Ctx {
  req: NextRequest;
  s: Store;
  params: Record<string, string>;
  user: User | null;
  sid: string | null;
  ip: string;
  query: URLSearchParams;
  json(): Promise<Record<string, any>>;
}

export const SESSION_COOKIE = 'fit_sid';

export const iso = () => new Date().toISOString();
export const now = () => Date.now();
export const clip = (v: unknown, n: number) => { const t = v == null ? '' : String(v).trim(); return t.length > n ? t.slice(0, n) : t; };
export const str = (v: unknown) => (v == null ? '' : String(v));

export function json(status: number, body: unknown, headers?: Record<string, string>): Response {
  return NextResponse.json(body, { status, headers });
}

export function setCookie(res: Response, value: string, maxAgeSeconds: number) {
  res.headers.append('Set-Cookie', `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${env.cookieSecure && maxAgeSeconds > 0 ? '; Secure' : ''}`);
}

function clientIp(req: NextRequest): string {
  const xf = req.headers.get('x-forwarded-for');
  if (xf) return xf.split(',')[0].trim().slice(0, 64);
  return req.headers.get('x-real-ip') || 'local';
}

async function identify(c: Ctx) {
  const t = c.req.cookies.get(SESSION_COOKIE)?.value;
  if (!t) return;
  const h = sha256(t);
  const sess = await c.s.sessions.findOne({ _id: h });
  if (!sess) return;
  if (sess.expires_at <= now()) { await c.s.sessions.deleteOne({ _id: h }); return; }
  const u = await c.s.users.findOne({ _id: sess.user_id, active: true });
  if (u) { c.user = u; c.sid = h; }
}

export const needUser = (c: Ctx): User => {
  if (!c.user) throw new ApiError(401, 'Please sign in.');
  return c.user;
};
export const needAdmin = (c: Ctx): User => {
  if (!c.user || c.user.role !== 'admin') throw new ApiError(403, 'Only the administrator can do this.');
  return c.user;
};

type Params = { params: Promise<Record<string, string>> };

/** Wraps one API handler: the CSRF header, the session, and turning ApiError into the JSON the pages expect. */
export function route(handler: (c: Ctx) => Promise<Response>) {
  return async (req: NextRequest, p: Params): Promise<Response> => {
    try {
      const m = req.method;
      // state-changing calls must carry a custom header, which other websites cannot add to a request made from a browser
      if (m !== 'GET' && m !== 'HEAD' && req.headers.get('x-fit-request') !== '1') throw new ApiError(400, 'Bad request.');
      let s: Store;
      try { s = await store(); } catch { throw new ApiError(503, 'The database is not reachable. Please tell the administrator.'); }
      const c: Ctx = {
        req, s, params: (await p?.params) || {}, user: null, sid: null, ip: clientIp(req), query: req.nextUrl.searchParams,
        async json() { try { const j = await req.json(); return j && typeof j === 'object' ? j : {}; } catch { return {}; } },
      };
      await identify(c);
      const res = await handler(c);
      res.headers.set('Cache-Control', 'no-store');
      return res;
    } catch (e: any) {
      if (e instanceof ApiError) {
        const body: Record<string, unknown> = { error: e.message };
        if (e.extra !== undefined) body.current = e.extra;
        return json(e.status, body, { 'Cache-Control': 'no-store' });
      }
      console.error(e);
      return json(500, { error: 'Something went wrong on the server.' }, { 'Cache-Control': 'no-store' });
    }
  };
}

export function idOf(s: string): number {
  const n = Number(s);
  if (!Number.isInteger(n)) throw new ApiError(404, 'Not found.');
  return n;
}
