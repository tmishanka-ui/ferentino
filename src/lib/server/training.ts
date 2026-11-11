import { Ctx, ApiError, iso, json, needUser } from './http';
import { TrainingSubmission } from './db';

/* Backs the Training Section's Employee Survey — see the TrainingSubmission comment in db.ts for why
   each submission is its own row instead of one growing blob. */

const MAX_VALUE = 200 * 1024; // one person's answers across the whole questionnaire; generous

export async function listSubmissions(c: Ctx) {
  needUser(c);
  const rows = await c.s.trainingSubmissions.find().toArray();
  return json(200, { submissions: rows.map(({ _id, updated_at: _u, ...rest }) => ({ epf: _id, ...rest })) });
}

/** Upserts one or more submissions by EPF number — used both for a single new submission and for
 *  migrating a browser's old localStorage blob up in one go the first time this loads. */
export async function putSubmissions(c: Ctx) {
  needUser(c);
  const b = await c.json();
  const list: unknown[] = Array.isArray(b.submissions) ? b.submissions : [];
  if (!list.length) throw new ApiError(400, 'No submissions given.');
  if (list.length > 2000) throw new ApiError(400, 'Too many submissions at once.');
  const ops = list.map((raw) => {
    const s = raw as Record<string, unknown>;
    const epf = String(s.epf || '').trim(), name = String(s.name || '').trim();
    if (!epf || !name) throw new ApiError(400, 'Each submission needs an EPF No and Employee Name.');
    const val = JSON.stringify(s);
    if (val.length > MAX_VALUE) throw new ApiError(413, 'One of the submissions is too large to save.');
    const doc: TrainingSubmission = {
      _id: epf, name, deptIndex: Number(s.deptIndex) || 0, deptName: String(s.deptName || ''),
      designation: String(s.designation || ''), years: String(s.years || ''), qualification: String(s.qualification || ''),
      supervisor: String(s.supervisor || ''), date: String(s.date || ''), year: String(s.year || ''),
      answers: (s.answers && typeof s.answers === 'object') ? s.answers as Record<string, unknown> : {},
      submittedAt: String(s.submittedAt || iso()), updated_at: iso(),
    };
    return { replaceOne: { filter: { _id: epf }, replacement: doc, upsert: true } };
  });
  await c.s.trainingSubmissions.bulkWrite(ops);
  return json(200, { ok: true, count: ops.length });
}

export async function clearSubmissions(c: Ctx) {
  needUser(c);
  await c.s.trainingSubmissions.deleteMany({});
  return json(200, { ok: true });
}
