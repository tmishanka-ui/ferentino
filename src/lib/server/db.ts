import { Collection, Db, GridFSBucket, MongoClient } from 'mongodb';
import { env } from './env';
import { hashPassword, tempPassword } from './security';

export interface User {
  _id: number;
  email: string;
  name: string;
  designation: string;
  department: string;
  role: 'admin' | 'executive' | 'manager';
  pass_hash: string;
  must_change: boolean;
  active: boolean;
  failed: number;
  locked_until: number;
  reset_requested_at: string | null;
  created_at: string;
  last_login: string | null;
}
export interface Session { _id: string; user_id: number; created_at: number; expires_at: number }
export interface Reset { _id: number; user_id: number; code_hash: string; expires_at: number; used: boolean }
export interface Signature {
  _id: number; user_id: number; name: string; designation: string; department: string; email: string;
  purpose: string; ref: string; content_hash: string; signed_at: string; ip: string;
}
export interface AuditEntry { at: string; user_id: number | null; action: string; detail: string; ip: string }
export interface DataItem {
  _id: string; v: string | null; version: number; seq: number; deleted: boolean;
  updated_at: string; updated_by: number | null; updated_by_name: string | null;
}
export interface HistoryEntry { _id: number; k: string; version: number; v: string | null; saved_ms: number; saved_at: string; saved_by_name: string | null }
export interface Counter { _id: string; v: number }

export interface StoreItem {
  _id: string; // item code, e.g. FITL-ST-00001
  name: string; nameLower: string; category: string; unit: string; location: string;
  minLevel: number | null; createdAt: string; createdBy: string;
}
export interface StoreTxn {
  _id: string; code: string; type: 'R' | 'I'; date: string; ts: number; qty: number;
  ref: string; party: string; person: string; remarks: string; enteredBy: string;
}
/* The Press Downtime import can be too large for a browser's localStorage (which the generic
   data_items/localStorage sync is built around and would otherwise try to mirror into every
   signed-in browser), so it gets its own small dedicated storage instead: one small metadata
   document (file names, tablet report log) plus one row per downtime record — never one big
   blob, since a Vercel Function also refuses any single request/response over 4.5 MB. */
export interface DowntimeMeta { _id: string; v: string; version: number; updated_at: string; updated_by_name: string | null }
export interface DowntimeRecord {
  _id: string; src: 'PRW' | 'TR';
  s: number; y: number; m: number; w: number; dw: number; dd: number;
  c: string; r: string; l: string; p: string; sh: string; n: number; tab: string;
}

/* The Press Monitoring Dashboard previously saved every shift straight into the browser's
   localStorage, which is per-device (so other computers never saw an upload) and quota-limited
   (uploads eventually started failing with "storage full"). It keeps its own simple key/value
   shape (one small "index" document plus one small document per shift), so rather than forcing it
   through the generic data_items/localStorage sync, it gets a small dedicated key/value collection
   of its own — same idea as downtimeMeta/downtimeRecords above. */
export interface PressKv { _id: string; v: string; updated_at: string; updated_by_name: string | null }

/* The CAPA platform kept everything — issues, action plans, preventive forms, and every shift ever
   received from Press Monitoring — in one JSON blob in localStorage, re-saved whole on every edit.
   The shifts part grows without bound (one entry per shift, forever), so that blob eventually grew
   past what a browser's localStorage can hold. Same split as Downtime/Press above: a small meta
   document for everything except shifts, and one row per shift in its own collection. */
export interface CapaMeta { _id: string; v: string; version: number; updated_at: string; updated_by_name: string | null }
export interface CapaShift {
  _id: string; // the shift's key, e.g. "2026-08-21:A"
  date: string; shiftCode: string; shiftLabel: string; controller: string;
  risks: Record<string, unknown>[];
}

/* The Maintenance department's Waste Removing page (public/apps/waste.html) kept its one small
   record of waste limits/entries purely in localStorage, with no server copy at all — fine for a
   single browser, but it means nothing server-side (e.g. a daily cron job checking whether a waste
   type has exceeded its critical limit) could ever see it. Small and bounded, so one meta document
   is enough — same shape as downtimeMeta/capaMeta above. */
export interface WasteMeta { _id: string; v: string; version: number; updated_at: string; updated_by_name: string | null }

/* The HR Department's KPI Dashboard (public/apps/hrkpi.html) keeps one month's attendance-summary
   upload (OT hours, leave, nopay, late minutes per employee) per month, plus a couple of editable
   settings (the absenteeism baseline). All of it together across a year is still tiny, so one meta
   document is enough — same shape as waste/capa/downtime above. */
export interface HrkpiMeta { _id: string; v: string; version: number; updated_at: string; updated_by_name: string | null }

/* The Production Department's Shift Groups page (public/apps/shiftgroups.html) lets anyone signed in
   reassign who is in which group, but adding, removing or renumbering an employee is meant to be
   limited to up to three named coordinators, chosen by an administrator. That allow-list has to live
   somewhere every browser can check it, unlike the rest of that page's data (plain localStorage) —
   one tiny document is enough. */
export interface ShiftgroupsEditors { _id: string; people: { id: number; name: string; email: string }[]; updated_at: string; updated_by_name: string | null }

/* The Training Section's Employee Survey (public/apps/training.html) used to keep every submission —
   one grows-forever JSON array, one entry per employee, each carrying the full set of questionnaire
   answers — in a single localStorage key, re-saved whole on every new submission. That blob eventually
   grew past what a browser's localStorage can hold, so new submissions silently stopped saving once it
   did. One row per submission (keyed by EPF number) avoids re-saving everyone else's answers just to
   add one. */
export interface TrainingSubmission {
  _id: string; // EPF number
  name: string; deptIndex: number; deptName: string; designation: string; years: string;
  qualification: string; supervisor: string; date: string; year: string;
  answers: Record<string, unknown>; submittedAt: string; updated_at: string;
}

export interface Store {
  client: MongoClient;
  db: Db;
  users: Collection<User>;
  sessions: Collection<Session>;
  resets: Collection<Reset>;
  signatures: Collection<Signature>;
  audit: Collection<AuditEntry>;
  counters: Collection<Counter>;
  items: Collection<DataItem>;
  history: Collection<HistoryEntry>;
  files: GridFSBucket;
  storesItems: Collection<StoreItem>;
  storesTxns: Collection<StoreTxn>;
  downtimeMeta: Collection<DowntimeMeta>;
  downtimeRecords: Collection<DowntimeRecord>;
  pressKv: Collection<PressKv>;
  capaMeta: Collection<CapaMeta>;
  capaShifts: Collection<CapaShift>;
  wasteMeta: Collection<WasteMeta>;
  hrkpiMeta: Collection<HrkpiMeta>;
  shiftgroupsEditors: Collection<ShiftgroupsEditors>;
  trainingSubmissions: Collection<TrainingSubmission>;
}

const g = globalThis as unknown as { __ferStore?: Promise<Store> };

/** Opens the database once per server process, creates the indexes and, on the very first start, the administrator. */
export function store(): Promise<Store> {
  if (!g.__ferStore) {
    g.__ferStore = connect().catch((e) => { g.__ferStore = undefined; throw e; });
  }
  return g.__ferStore;
}

async function connect(): Promise<Store> {
  const client = new MongoClient(env.mongoUri, { serverSelectionTimeoutMS: 8000, maxPoolSize: 20 });
  await client.connect();
  const db = client.db(env.mongoDb);
  const s: Store = {
    client, db,
    users: db.collection<User>('users'),
    sessions: db.collection<Session>('sessions'),
    resets: db.collection<Reset>('resets'),
    signatures: db.collection<Signature>('signatures'),
    audit: db.collection<AuditEntry>('audit_log'),
    counters: db.collection<Counter>('counters'),
    items: db.collection<DataItem>('data_items'),
    history: db.collection<HistoryEntry>('data_history'),
    files: new GridFSBucket(db, { bucketName: 'files' }),
    storesItems: db.collection<StoreItem>('stores_items'),
    storesTxns: db.collection<StoreTxn>('stores_txns'),
    downtimeMeta: db.collection<DowntimeMeta>('downtime_meta'),
    downtimeRecords: db.collection<DowntimeRecord>('downtime_records'),
    pressKv: db.collection<PressKv>('press_kv'),
    capaMeta: db.collection<CapaMeta>('capa_meta'),
    capaShifts: db.collection<CapaShift>('capa_shifts'),
    wasteMeta: db.collection<WasteMeta>('waste_meta'),
    hrkpiMeta: db.collection<HrkpiMeta>('hrkpi_meta'),
    shiftgroupsEditors: db.collection<ShiftgroupsEditors>('shiftgroups_editors'),
    trainingSubmissions: db.collection<TrainingSubmission>('training_submissions'),
  };
  await Promise.all([
    s.users.createIndex({ email: 1 }, { unique: true }),
    s.sessions.createIndex({ user_id: 1 }),
    s.resets.createIndex({ user_id: 1 }),
    s.signatures.createIndex({ ref: 1 }),
    s.items.createIndex({ seq: 1 }),
    s.history.createIndex({ k: 1, _id: -1 }),
    db.collection('files.files').createIndex({ filename: 1, uploadDate: -1 }),
    s.storesItems.createIndex({ nameLower: 1 }, { unique: true }),
    s.storesTxns.createIndex({ code: 1 }),
    s.storesTxns.createIndex({ date: 1 }),
    s.storesTxns.createIndex({ code: 1, date: 1, ts: 1 }),
    s.downtimeRecords.createIndex({ src: 1 }),
  ]);
  await firstStart(s);
  return s;
}

export async function nextId(s: Store, name: string): Promise<number> {
  const r = await s.counters.findOneAndUpdate({ _id: name }, { $inc: { v: 1 } }, { upsert: true, returnDocument: 'after' });
  return r!.v;
}

/* One change number is taken for every save, delete and file change, so the pages can ask "what changed since N?".
   Taking the number and writing the record happen inside one lock, and the current number is read inside it too, so a
   reader never sees a number whose record is not written yet. (One server process; see README for more than one.) */
let chain: Promise<unknown> = Promise.resolve();
export function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}
export const currentSeq = async (s: Store) => (await s.counters.findOne({ _id: 'seq' }))?.v ?? 0;
export const topSeq = (s: Store) => withLock(() => currentSeq(s));

async function firstStart(s: Store) {
  if (await s.users.estimatedDocumentCount() > 0) return;
  const email = env.adminEmail || 'admin@ferentino.local';
  const pw = env.adminPassword || tempPassword();
  const id = await nextId(s, 'users');
  try {
    await s.users.insertOne({
      _id: id, email, name: env.adminName, designation: 'Administrator', department: 'Quality', role: 'admin',
      pass_hash: await hashPassword(pw), must_change: true, active: true, failed: 0, locked_until: 0,
      reset_requested_at: null, created_at: new Date().toISOString(), last_login: null,
    });
  } catch (e: any) {
    if (e?.code === 11000) return; // another start-up got there first
    throw e;
  }
  await s.audit.insertOne({ at: new Date().toISOString(), user_id: null, action: 'first-start', detail: 'administrator created: ' + email, ip: '' });
  console.log('\n==============================================================');
  console.log(' First start: the administrator account was created.');
  console.log('   Sign in with  : ' + email);
  console.log('   Password      : ' + pw + '   (you will be asked to change it)');
  console.log('==============================================================\n');
}
