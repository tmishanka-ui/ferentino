import type { Filter } from 'mongodb';
import { ApiError, Ctx, clip, iso, json, needUser, now, str } from './http';
import { Store, StoreItem, StoreTxn, nextId, withLock } from './db';

const UNITS = ['Nos', 'kg', 'g', 'L', 'ml', 'm', 'Box', 'Roll', 'Set', 'Pair', 'Packet', 'Drum'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function dateOf(v: unknown): string {
  const d = str(v).trim();
  if (!d) return iso().slice(0, 10);
  if (!DATE_RE.test(d)) throw new ApiError(400, 'Enter a valid date (YYYY-MM-DD).');
  return d;
}
function qtyOf(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new ApiError(400, 'Enter a quantity greater than zero.');
  return round3(n);
}
function minLevelOf(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new ApiError(400, 'The minimum level must be a number (or left blank).');
  return round3(n);
}

/** sum of received/issued/balance per item code, computed from the transactions — never stored */
async function balancesFor(s: Store, codes?: string[]): Promise<Map<string, { received: number; issued: number; balance: number }>> {
  const match = codes ? { code: { $in: codes } } : {};
  const rows = await s.storesTxns.aggregate<{ _id: string; received: number; issued: number }>([
    { $match: match },
    { $group: { _id: '$code', received: { $sum: { $cond: [{ $eq: ['$type', 'R'] }, '$qty', 0] } }, issued: { $sum: { $cond: [{ $eq: ['$type', 'I'] }, '$qty', 0] } } } },
  ]).toArray();
  return new Map(rows.map((r) => [r._id, { received: round3(r.received), issued: round3(r.issued), balance: round3(r.received - r.issued) }]));
}

/** running balance after every transaction, for every item, in date/ts order — used by the bin card and movements list */
async function runningBalances(s: Store): Promise<Map<string, number>> {
  const all = await s.storesTxns.find().sort({ code: 1, date: 1, ts: 1 }).toArray();
  const map = new Map<string, number>();
  let curCode: string | null = null, running = 0;
  for (const t of all) {
    if (t.code !== curCode) { curCode = t.code; running = 0; }
    running += t.type === 'R' ? t.qty : -t.qty;
    map.set(t._id, round3(running));
  }
  return map;
}

const itemOut = (it: StoreItem, b?: { received: number; issued: number; balance: number }) => ({
  code: it._id, name: it.name, category: it.category, unit: it.unit, location: it.location, minLevel: it.minLevel,
  createdAt: it.createdAt, createdBy: it.createdBy,
  received: b ? b.received : 0, issued: b ? b.issued : 0, balance: b ? b.balance : 0,
});
const txnOut = (t: StoreTxn, extra?: Record<string, unknown>) => ({
  id: t._id, code: t.code, type: t.type, date: t.date, ts: t.ts, qty: t.qty, ref: t.ref, party: t.party, person: t.person, remarks: t.remarks, enteredBy: t.enteredBy, ...extra,
});

/* ---------------- items ---------------- */
export async function listItems(c: Ctx) {
  needUser(c);
  const [its, bal] = await Promise.all([c.s.storesItems.find().sort({ name: 1 }).toArray(), balancesFor(c.s)]);
  return json(200, { items: its.map((it) => itemOut(it, bal.get(it._id))), units: UNITS });
}

export async function getItem(c: Ctx) {
  needUser(c);
  const code = clip(c.params.code, 40).toUpperCase();
  const it = await c.s.storesItems.findOne({ _id: code });
  if (!it) throw new ApiError(404, 'Item not found.');
  const txns = await c.s.storesTxns.find({ code }).sort({ date: 1, ts: 1 }).toArray();
  let running = 0, received = 0, issued = 0;
  const binCard = txns.map((t) => {
    running += t.type === 'R' ? t.qty : -t.qty;
    if (t.type === 'R') received = round3(received + t.qty); else issued = round3(issued + t.qty);
    return txnOut(t, { balanceAfter: round3(running) });
  });
  binCard.reverse(); // newest first for display
  return json(200, { item: itemOut(it, { received, issued, balance: round3(running) }), txns: binCard });
}

export async function editItem(c: Ctx) {
  needUser(c);
  const code = clip(c.params.code, 40).toUpperCase();
  const it = await c.s.storesItems.findOne({ _id: code });
  if (!it) throw new ApiError(404, 'Item not found.');
  const b = await c.json();
  const name = 'name' in b ? clip(b.name, 160) : it.name;
  if (!name) throw new ApiError(400, 'Enter the item name.');
  const unit = 'unit' in b ? clip(b.unit, 20) : it.unit;
  if (!unit) throw new ApiError(400, 'Choose a unit.');
  const nameLower = name.toLowerCase();
  if (nameLower !== it.nameLower) {
    const dup = await c.s.storesItems.findOne({ nameLower, _id: { $ne: code } });
    if (dup) throw new ApiError(409, `"${dup.name}" already uses that name (code ${dup._id}). Choose a different name.`);
  }
  const category = 'category' in b ? clip(b.category, 80) : it.category;
  const location = 'location' in b ? clip(b.location, 80) : it.location;
  const minLevel = 'minLevel' in b ? minLevelOf(b.minLevel) : it.minLevel;
  await c.s.storesItems.updateOne({ _id: code }, { $set: { name, nameLower, unit, category, location, minLevel } });
  const bal = (await balancesFor(c.s, [code])).get(code);
  return json(200, { item: itemOut({ ...it, name, nameLower, unit, category, location, minLevel }, bal) });
}

/* ---------------- receive ---------------- */
export async function receive(c: Ctx) {
  const u = needUser(c);
  const b = await c.json();
  let code = clip(b.code, 40).toUpperCase();
  let item: StoreItem;

  if (code) {
    const found = await c.s.storesItems.findOne({ _id: code });
    if (!found) throw new ApiError(404, 'Item not found. Pick the item from the list, or switch to New item.');
    item = found;
  } else {
    const name = clip(b.name, 160);
    if (!name) throw new ApiError(400, 'Enter the item name, or switch to "Item already in stores" and pick it from the list.');
    const unit = clip(b.unit, 20);
    if (!unit) throw new ApiError(400, 'Choose a unit.');
    const nameLower = name.toLowerCase();
    const dup = await c.s.storesItems.findOne({ nameLower });
    if (dup) throw new ApiError(409, `"${dup.name}" is already in stores (code ${dup._id}). Pick the existing item instead of adding a new one.`, { code: dup._id });
    code = 'FITL-ST-' + String(await nextId(c.s, 'stores_item_code')).padStart(5, '0');
    item = {
      _id: code, name, nameLower, category: clip(b.category, 80), unit, location: clip(b.location, 80),
      minLevel: minLevelOf(b.minLevel), createdAt: iso(), createdBy: u.name,
    };
    try { await c.s.storesItems.insertOne(item); }
    catch (e: any) { if (e?.code === 11000) throw new ApiError(409, 'An item with that name was just added by somebody else. Pick it from the list.'); throw e; }
  }

  const qty = qtyOf(b.qty);
  const date = dateOf(b.date);
  const txn: StoreTxn = {
    _id: String(await nextId(c.s, 'stores_txn')), code, type: 'R', date, ts: now(), qty,
    ref: clip(b.ref, 120), party: clip(b.party, 120), person: clip(b.person, 120), remarks: clip(b.remarks, 400), enteredBy: u.name,
  };
  await c.s.storesTxns.insertOne(txn);
  const bal = (await balancesFor(c.s, [code])).get(code)!;
  return json(200, { item: itemOut(item, bal), txn: txnOut(txn), balance: bal.balance });
}

/* ---------------- issue ---------------- */
export async function issue(c: Ctx) {
  const u = needUser(c);
  const b = await c.json();
  const code = clip(b.code, 40).toUpperCase();
  if (!code) throw new ApiError(400, 'Scan or choose an item first.');
  const item = await c.s.storesItems.findOne({ _id: code });
  if (!item) throw new ApiError(404, 'Item not found. Scan the label again, or search by name.');
  const qty = qtyOf(b.qty);
  const party = clip(b.party, 120);
  if (!party) throw new ApiError(400, 'Choose the department the items are issued to.');
  const date = dateOf(b.date);
  const person = clip(b.person, 120), ref = clip(b.ref, 120), remarks = clip(b.remarks, 400);

  // serialized within this process so two simultaneous issues can never take the balance below zero
  const before = await withLock(async () => {
    const bal = (await balancesFor(c.s, [code])).get(code);
    const balance = bal?.balance ?? 0;
    if (qty > balance + 1e-9) throw new ApiError(400, `Only ${balance} ${item.unit} in stores.`, { balance });
    const txn: StoreTxn = { _id: String(await nextId(c.s, 'stores_txn')), code, type: 'I', date, ts: now(), qty, ref, party, person, remarks, enteredBy: u.name };
    await c.s.storesTxns.insertOne(txn);
    return balance;
  });
  const after = round3(before - qty);
  return json(200, { item: itemOut(item), balanceBefore: before, balanceAfter: after, unit: item.unit });
}

/* ---------------- transactions ---------------- */
export async function deleteTxn(c: Ctx) {
  needUser(c);
  const id = clip(c.params.id, 60);
  const t = await c.s.storesTxns.findOne({ _id: id });
  if (!t) throw new ApiError(404, 'That movement was not found (it may have already been deleted).');
  await c.s.storesTxns.deleteOne({ _id: id });
  return json(200, { ok: true, code: t.code });
}

export async function listTxns(c: Ctx) {
  needUser(c);
  const from = clip(c.query.get('from'), 10), to = clip(c.query.get('to'), 10);
  const type = clip(c.query.get('type'), 1);
  const search = clip(c.query.get('search'), 120);
  const all = c.query.get('all') === '1';

  const query: Filter<StoreTxn> = {};
  if (from || to) query.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  if (type === 'R' || type === 'I') query.type = type;
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    const nameMatches = await c.s.storesItems.find({ name: rx }).project({ _id: 1 }).toArray();
    const codes = nameMatches.map((i) => i._id);
    query.$or = [{ code: rx }, { party: rx }, { person: rx }, { ref: rx }, ...(codes.length ? [{ code: { $in: codes } }] : [])];
  }

  const items = await c.s.storesItems.find().toArray();
  const names = new Map(items.map((i) => [i._id, { name: i.name, unit: i.unit }]));
  const runBal = await runningBalances(c.s);

  let cursor = c.s.storesTxns.find(query).sort({ date: -1, ts: -1 });
  if (!all) cursor = cursor.limit(500);
  const rows = await cursor.toArray();
  const total = await c.s.storesTxns.countDocuments(query);
  const receipts = await c.s.storesTxns.countDocuments({ ...query, type: 'R' });

  return json(200, {
    txns: rows.map((t) => txnOut(t, { itemName: names.get(t.code)?.name ?? t.code, unit: names.get(t.code)?.unit ?? '', balanceAfter: runBal.get(t._id) ?? null })),
    total, receipts, issues: total - receipts,
  });
}

/* ---------------- backup / restore ---------------- */
export async function backup(c: Ctx) {
  needUser(c);
  const [its, txns] = await Promise.all([c.s.storesItems.find().toArray(), c.s.storesTxns.find().toArray()]);
  const items: Record<string, unknown> = {};
  for (const it of its) items[it._id] = { code: it._id, name: it.name, category: it.category, unit: it.unit, location: it.location, minLevel: it.minLevel, createdAt: it.createdAt };
  const out: Record<string, unknown> = {};
  for (const t of txns) out[t._id] = { id: t._id, code: t.code, type: t.type, date: t.date, ts: t.ts, qty: t.qty, ref: t.ref, party: t.party, person: t.person, remarks: t.remarks };
  return json(200, { app: 'fitl-stores', version: 1, exported: iso(), items, txns: out });
}

export async function restore(c: Ctx) {
  const u = needUser(c);
  const b = await c.json();
  if (b.app !== 'fitl-stores' || !b.items || !b.txns) throw new ApiError(400, 'That is not a Stores backup file.');
  let items = 0, txns = 0;
  for (const code of Object.keys(b.items)) {
    const raw = b.items[code] || {};
    const name = clip(raw.name, 160);
    if (!code || !name) continue;
    await c.s.storesItems.updateOne({ _id: clip(code, 40).toUpperCase() }, {
      $set: {
        name, nameLower: name.toLowerCase(), category: clip(raw.category, 80), unit: clip(raw.unit, 20) || 'Nos',
        location: clip(raw.location, 80), minLevel: minLevelOf(raw.minLevel),
      },
      $setOnInsert: { createdAt: str(raw.createdAt) || iso(), createdBy: u.name },
    }, { upsert: true });
    items++;
  }
  for (const id of Object.keys(b.txns)) {
    const raw = b.txns[id] || {};
    const code = clip(raw.code, 40).toUpperCase();
    if (!id || !code || (raw.type !== 'R' && raw.type !== 'I')) continue;
    const qty = Number(raw.qty);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    await c.s.storesTxns.updateOne({ _id: clip(id, 60) }, {
      $set: {
        code, type: raw.type, date: DATE_RE.test(str(raw.date)) ? raw.date : iso().slice(0, 10), ts: Number(raw.ts) || now(), qty: round3(qty),
        ref: clip(raw.ref, 120), party: clip(raw.party, 120), person: clip(raw.person, 120), remarks: clip(raw.remarks, 400), enteredBy: u.name,
      },
    }, { upsert: true });
    txns++;
  }
  return json(200, { ok: true, items, txns });
}
