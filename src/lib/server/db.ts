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
