import { ObjectId } from 'mongodb';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { env } from './env';
import { Ctx, ApiError, clip, iso, json, needAdmin, needUser, now, str } from './http';
import { Store, nextId, topSeq, withLock } from './db';
import { log } from './auth';

/** The records of every page (data_items) and the attached files (GridFS): what the management system's pages synchronise with. */

export function keyOf(c: Ctx): string {
  const k = c.params.key || '';
  if (!k || k.length > 190) throw new ApiError(400, 'That name is not allowed.');
  for (let i = 0; i < k.length; i++) if (k.charCodeAt(i) < 0x20) throw new ApiError(400, 'That name is not allowed.');
  return k;
}

const parse = (s: string | null, d: number) => { const n = Number((s ?? '').trim()); return s != null && s.trim() !== '' && Number.isFinite(n) ? Math.trunc(n) : d; };

async function readBody(req: Request, max: number): Promise<Buffer> {
  const tooBig = () => new ApiError(413, `That is too large to save (the limit is ${Math.round(max / 1048576)} MB).`);
  if (Number(req.headers.get('content-length') || 0) > max) throw tooBig();
  const chunks: Buffer[] = [];
  let n = 0;
  if (req.body) {
    const reader = req.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.length;
      if (n > max) { await reader.cancel().catch(() => undefined); throw tooBig(); }
      chunks.push(Buffer.from(value));
    }
  }
  return Buffer.concat(chunks);
}

/* ---------------- records ---------------- */

/** everything saved since change number {since}, with the values, in pages of about maxMB megabytes */
export async function pull(c: Ctx) {
  needUser(c);
  const since = parse(c.query.get('since'), 0);
  const mb = Math.max(0.1, Math.min(64, Number(c.query.get('maxMB') ?? 8) || 8));
  const budget = mb * 1048576;
  const top = await topSeq(c.s);
  const items: unknown[] = [];
  let lastSeq = since, used = 0, more = false, stop = false;
  while (!stop) {
    const rows = await c.s.items.find({ seq: { $gt: lastSeq, $lte: top } }).sort({ seq: 1 }).limit(100).toArray();
    if (!rows.length) break;
    for (const r of rows) {
      const size = r.v ? r.v.length : 0;
      if (items.length && used + size > budget) { stop = true; more = true; break; }
      items.push({ key: r._id, value: r.deleted ? null : r.v, version: r.version, deleted: !!r.deleted, seq: r.seq });
      used += size;
      lastSeq = r.seq;
    }
    if (rows.length < 100) break;
  }
  if (!more) lastSeq = top;
  return json(200, { items, seq: lastSeq, more });
}

/** which items changed since change number {since} (without the values) */
export async function changes(c: Ctx) {
  needUser(c);
  const since = parse(c.query.get('since'), 0);
  const top = await topSeq(c.s);
  const rows = await c.s.items.find({ seq: { $gt: since, $lte: top } }, { projection: { v: 0 } }).sort({ seq: 1 }).limit(2000).toArray();
  const changed = rows.map((r) => ({ key: r._id, deleted: !!r.deleted, version: r.version, seq: r.seq, by: r.updated_by_name, at: r.updated_at }));
  const seq = rows.length >= 2000 ? rows[rows.length - 1].seq : top;
  return json(200, { changed, seq });
}

export async function get(c: Ctx) {
  needUser(c);
  const r = await c.s.items.findOne({ _id: keyOf(c) });
  if (!r || r.deleted) throw new ApiError(404, 'Nothing is saved under that name.');
  return new Response(str(r.v), { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Version': String(r.version) } });
}

async function snapshot(s: Store, key: string, version: number, v: string | null, who: string) {
  const t = now();
  const last = await s.history.find({ k: key }).sort({ _id: -1 }).limit(1).next();
  if (last && t - last.saved_ms < 600_000) return;     // at most one earlier copy every ten minutes
  await s.history.insertOne({ _id: await nextId(s, 'history'), k: key, version, v, saved_ms: t, saved_at: iso(), saved_by_name: who });
  const tenth = await s.history.find({ k: key }, { projection: { _id: 1 } }).sort({ _id: -1 }).skip(9).limit(1).next();
  if (tenth) await s.history.deleteMany({ k: key, _id: { $lt: tenth._id } });   // the last ten are kept
}

/** save or delete one item. Another person's newer save is not overwritten (409) unless the person chooses to (X-Force). */
async function write(c: Ctx, del: boolean) {
  const me = needUser(c);
  const key = keyOf(c);
  const val = del ? null : (await readBody(c.req, env.maxDataMb * 1048576)).toString('utf8');
  const base = parse(c.req.headers.get('x-base-version'), 0);
  const force = c.req.headers.get('x-force') === '1';
  const res = await withLock(async () => {
    const row = await c.s.items.findOne({ _id: key });
    const exists = !!row, live = exists && !row!.deleted;
    const cur = row ? row.version : 0;
    if (del && !live) return { ok: true, version: cur };                         // nothing to delete
    if (!force && exists && base !== cur && (live || base !== 0))
      return { conflict: { version: cur, by: row!.updated_by_name, at: row!.updated_at, deleted: !live } };
    const version = cur + 1, seq = await nextId(c.s, 'seq');
    if (live) await snapshot(c.s, key, cur, row!.v, str(row!.updated_by_name));
    await c.s.items.updateOne({ _id: key }, { $set: { v: val, version, seq, deleted: del, updated_at: iso(), updated_by: me._id, updated_by_name: me.name } }, { upsert: true });
    return { ok: true, version, seq };
  });
  if ('conflict' in res) throw new ApiError(409, 'Somebody else saved a newer version first.', res.conflict);
  return json(200, res);
}
export const put = (c: Ctx) => write(c, false);
export const del = (c: Ctx) => write(c, true);

/** administrator: what is stored */
export async function list(c: Ctx) {
  needAdmin(c);
  const items = await c.s.items.aggregate([
    { $sort: { _id: 1 } },
    { $project: { _id: 0, key: '$_id', version: 1, deleted: 1, size: { $strLenCP: { $ifNull: ['$v', ''] } }, at: '$updated_at', by: '$updated_by_name' } },
  ]).toArray();
  return json(200, { items });
}

/** administrator: earlier versions of one item, and bringing one back */
export async function history(c: Ctx) {
  needAdmin(c);
  const rows = await c.s.history.find({ k: keyOf(c) }, { projection: { v: 0 } }).sort({ _id: -1 }).toArray();
  return json(200, { versions: rows.map((r) => ({ id: r._id, version: r.version, at: r.saved_at, by: r.saved_by_name })) });
}

export async function restore(c: Ctx) {
  const me = needAdmin(c);
  const key = keyOf(c), id = Number(c.params.id);
  const res = await withLock(async () => {
    const h = await c.s.history.findOne({ _id: id, k: key });
    if (!h) throw new ApiError(404, 'No such earlier version.');
    const row = await c.s.items.findOne({ _id: key });
    const version = row ? row.version + 1 : 1, seq = await nextId(c.s, 'seq');
    await c.s.items.updateOne({ _id: key }, { $set: { v: h.v, version, seq, deleted: false, updated_at: iso(), updated_by: me._id, updated_by_name: me.name } }, { upsert: true });
    return { ok: true, version };
  });
  await log(c.s, me._id, 'data-restored', `${key} from version ${id}`, c.ip);
  return json(200, res);
}

/* ---------------- files (GridFS) ---------------- */
interface FileDoc { _id: ObjectId; filename: string; length: number; uploadDate: Date; contentType?: string; metadata?: { name?: string; mime?: string; by?: string } }
const filesColl = (s: Store) => s.db.collection<FileDoc>('files.files');
const latestFile = (s: Store, key: string) => filesColl(s).find({ filename: key }).sort({ uploadDate: -1 }).limit(1).next();
const bump = (s: Store) => withLock(() => nextId(s, 'seq'));

export async function filesList(c: Ctx) {
  needUser(c);
  const rows = await filesColl(c.s).find().sort({ filename: 1, uploadDate: -1 }).toArray();
  const seen = new Set<string>(), files: unknown[] = [];
  for (const r of rows) {
    if (seen.has(r.filename)) continue;
    seen.add(r.filename);
    files.push({ key: r.filename, name: r.metadata?.name ?? r.filename, type: r.metadata?.mime ?? 'application/octet-stream', size: r.length, at: r.uploadDate.toISOString(), by: r.metadata?.by ?? null });
  }
  return json(200, { files });
}

export async function filePut(c: Ctx) {
  const me = needUser(c);
  const key = keyOf(c);
  const max = env.maxFileMb * 1048576;
  const tooBig = () => new ApiError(413, `That file is too large (the limit is ${env.maxFileMb} MB).`);
  if (Number(c.req.headers.get('content-length') || 0) > max) throw tooBig();
  let rawName = c.req.headers.get('x-file-name') || key;
  try { rawName = decodeURIComponent(rawName); } catch { /* keep as sent */ }
  const name = clip(rawName, 255) || key;
  const mime = clip(c.req.headers.get('content-type') || 'application/octet-stream', 120);
  const up = c.s.files.openUploadStream(key, { metadata: { name, mime, by: me.name } });
  let size = 0;
  const counter = new Transform({
    transform(chunk, _enc, cb) { size += chunk.length; if (size > max) cb(tooBig()); else cb(null, chunk); },
  });
  try {
    if (c.req.body) await pipeline(Readable.fromWeb(c.req.body as any), counter, up);
    else await new Promise<void>((res, rej) => { up.on('finish', () => res()); up.on('error', rej); up.end(); });
  } catch (e) {
    await up.abort().catch(() => undefined);
    throw e;
  }
  // the new copy is complete: only now are the older copies of this file removed
  for (const old of await filesColl(c.s).find({ filename: key, _id: { $ne: up.id } }).toArray()) await c.s.files.delete(old._id).catch(() => undefined);
  await bump(c.s);
  return json(200, { ok: true, size });
}

export async function fileGet(c: Ctx) {
  needUser(c);
  const f = await latestFile(c.s, keyOf(c));
  if (!f) throw new ApiError(404, 'No such file.');
  const stream = Readable.toWeb(c.s.files.openDownloadStream(f._id)) as ReadableStream;
  return new Response(stream, {
    status: 200,
    headers: {
      'X-File-Name': encodeURIComponent(f.metadata?.name ?? f.filename).replace(/\+/g, '%20'),
      'Content-Type': f.metadata?.mime ?? 'application/octet-stream',
      'Content-Length': String(f.length),
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function fileDelete(c: Ctx) {
  needUser(c);
  for (const f of await filesColl(c.s).find({ filename: keyOf(c) }).toArray()) await c.s.files.delete(f._id).catch(() => undefined);
  await bump(c.s);
  return json(200, { ok: true });
}
