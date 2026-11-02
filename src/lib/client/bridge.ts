import { ensureLoaded, keyOfSource, win } from './frames';
import { getState, setState, SignRequest, SignResult } from './store';
import { sha256, api } from './api';

/* The hub through which the working apps talk to each other. An app announces something with postMessage
   (for example Production Summary announces an uploaded workbook); this page passes it on to whichever apps need it,
   loading them first if they have not been opened yet. */

type Msg = { type?: string; items?: unknown[]; files?: any[]; [k: string]: any };

let started = false;
const post = (key: string, m: unknown) => { const w = win(key); if (w) w.postMessage(m, '*'); };

/* ---- RCA auto-listing: the CAPA platform and the Management Agenda announce issues; the RCA Workbench adds each as its own RCA ---- */
const rcaCandidates: Record<string, unknown[]> = {};
let rcaReady = false;
const sendCandidates = (src: string) => { if (rcaReady && win('rca') && rcaCandidates[src]) post('rca', { type: 'fitl-rca-candidates', source: src, items: rcaCandidates[src] }); };

/* ---- Press Monitoring -> CAPA / Agenda, Housekeeping + Internal Audit -> Agenda, Agenda <-> CAPA ---- */
let shiftItems: unknown[] | null = null, capaReady = false, lastHkReq: Msg | null = null, agendaReady = false, meetStatus: Msg | null = null, lastCapaReq: Msg | null = null;
const auditWmm: Msg[] = [], meetCapa: Msg[] = [], capaAcks: Msg[] = [], rcaDone: Msg[] = [];
function sendAgenda() {
  if (!agendaReady || !win('agenda')) return;
  if (shiftItems) post('agenda', { type: 'fitl-shifts', items: shiftItems });
  if (lastHkReq) post('agenda', lastHkReq);
  auditWmm.splice(0).forEach((x) => post('agenda', x));    // internal audit NCs sent on purpose
  capaAcks.splice(0).forEach((x) => post('agenda', x));    // CAPA's answer: issue and action plan codes
  rcaDone.splice(0).forEach((x) => post('agenda', x));     // an RCA was finished: the issue goes to CAPA
}
function sendCapaMeet() {
  if (!capaReady || !win('capa')) return;
  if (meetStatus) post('capa', meetStatus);
  meetCapa.splice(0).forEach((x) => post('capa', x));
}
const sendShifts = () => { if (capaReady && shiftItems && win('capa')) post('capa', { type: 'fitl-shifts', items: shiftItems }); };

/* ---- Production Summary workbook -> QC, Defect Analyser, KPI dashboards; downtime / attendance / accidents -> KPI, Mixing ---- */
let lastWorkbook: Msg | null = null, qcReady = false, qckReady = false, defectReady = false, lastDowntimeWb: Msg | null = null, kpiReady = false, psReady = false,
  lastAccidents: Msg | null = null, mixReady = false, lastAttendance: Msg | null = null, lastEmployees: Msg | null = null, lastGroups: Msg | null = null, attReady = false, sgReady = false;
function sendMix() {
  if (!mixReady || !win('mixingdash')) return;
  if (lastDowntimeWb) post('mixingdash', lastDowntimeWb);
  if (lastAttendance) post('mixingdash', lastAttendance);
}
const sendSg = () => { if (sgReady && lastEmployees && win('shiftgroups')) post('shiftgroups', lastEmployees); };   // HR Attendance -> Shift Groups (the employee list)
const sendAtt = () => { if (attReady && lastGroups && win('attendance')) post('attendance', lastGroups); };         // Shift Groups -> Attendance (who is in which group)
function sendPs() {
  if (!psReady || !win('prodsum')) return;
  if (lastWorkbook) post('prodsum', lastWorkbook);
  if (lastDowntimeWb) post('prodsum', lastDowntimeWb);
}
function sendKpi() {
  if (!kpiReady || !win('kpi')) return;
  if (lastWorkbook) post('kpi', lastWorkbook);
  if (lastAttendance) post('kpi', lastAttendance);
  if (lastDowntimeWb) post('kpi', lastDowntimeWb);
  if (lastAccidents) post('kpi', lastAccidents);
}

/* ---- Press Trace reports: whichever Production dashboard they are imported on, the other one gets them ---- */
const traceReports: Record<string, any> = {};
let dashReady = false, opReady = false;
function sendTrace(to: string) {
  const files = Object.keys(traceReports).map((k) => traceReports[k]);
  if (!files.length || !win(to)) return;
  post(to, { type: 'fitl-trace-reports', files });
}

function onApp(ev: MessageEvent) {
  const m = ev.data as Msg;
  if (!m || typeof m !== 'object') return;
  const from = keyOfSource(ev.source);
  if (!from) return;
  const items = Array.isArray(m.items);

  // RCA candidates
  if (m.type === 'fitl-rca-candidates') {
    const src = from === 'agenda' ? 'agenda' : from === 'capa' ? 'capa' : null;
    if (!src || !items) return;
    rcaCandidates[src] = m.items!;
    if (rcaReady) sendCandidates(src); else ensureLoaded('rca');
  } else if (m.type === 'fitl-rca-ready' && from === 'rca') {
    rcaReady = true;
    Object.keys(rcaCandidates).forEach(sendCandidates);
  }

  // shifts, housekeeping, audit, agenda, CAPA
  if (m.type === 'fitl-shifts' && from === 'press' && items) {
    shiftItems = m.items!;
    if (capaReady) sendShifts(); else ensureLoaded('capa');
    if (agendaReady) sendAgenda(); else ensureLoaded('agenda');
  } else if (m.type === 'fitl-wmm-requirements' && from === 'housekeeping' && items) {
    lastHkReq = m;
    if (agendaReady) sendAgenda(); else ensureLoaded('agenda');
  } else if (m.type === 'fitl-wmm-requirements' && from === 'audit' && items) {
    auditWmm.push(m);
    if (agendaReady) sendAgenda(); else ensureLoaded('agenda');
  } else if (m.type === 'fitl-agenda-ready' && from === 'agenda') {
    agendaReady = true; sendAgenda();
  } else if (m.type === 'fitl-capa-requests' && from === 'audit' && items) {
    lastCapaReq = m;
    if (capaReady && win('capa')) post('capa', m); else ensureLoaded('capa');
  } else if (m.type === 'fitl-meeting-to-capa' && from === 'agenda' && items) {
    meetCapa.push(m);
    if (capaReady) sendCapaMeet(); else ensureLoaded('capa');
  } else if (m.type === 'fitl-meeting-status' && from === 'agenda' && items) {
    meetStatus = m;
    if (capaReady) sendCapaMeet(); else ensureLoaded('capa');
  } else if (m.type === 'fitl-capa-ack' && from === 'capa' && items) {
    capaAcks.push(m);
    if (agendaReady) sendAgenda(); else ensureLoaded('agenda');
  } else if (m.type === 'fitl-rca-finished' && from === 'rca') {
    rcaDone.push(m);
    if (agendaReady) sendAgenda(); else ensureLoaded('agenda');
  } else if (m.type === 'fitl-capa-ready' && from === 'capa') {
    capaReady = true;
    sendCapaMeet();
    sendShifts();
    if (lastCapaReq && win('capa')) post('capa', lastCapaReq);
  }

  // production workbooks, downtime, accidents, attendance
  if (m.type === 'fitl-workbook' && from === 'prodsum') {
    lastWorkbook = m;
    if (defectReady && win('defect')) post('defect', m); else ensureLoaded('defect');
    if (qcReady && win('qc')) post('qc', m); else ensureLoaded('qc');
    if (qckReady && win('qckpi')) post('qckpi', m); else ensureLoaded('qckpi');
    if (kpiReady) sendKpi(); else ensureLoaded('kpi');
    if (psReady) sendPs(); else ensureLoaded('prodsum');
  } else if (m.type === 'fitl-qckpi-ready' && from === 'qckpi') {
    qckReady = true;
    if (lastWorkbook) post('qckpi', lastWorkbook);
  } else if (m.type === 'fitl-qc-ready' && from === 'qc') {
    qcReady = true;
    if (lastWorkbook) post('qc', lastWorkbook);
  } else if (m.type === 'fitl-defect-ready' && from === 'defect') {
    defectReady = true;
    if (lastWorkbook) post('defect', lastWorkbook);
  } else if (m.type === 'fitl-downtime-workbook' && from === 'downtime' && Array.isArray(m.files)) {
    lastDowntimeWb = m;
    if (kpiReady) sendKpi(); else ensureLoaded('kpi');
    if (psReady) sendPs(); else ensureLoaded('prodsum');
    if (mixReady) sendMix(); else ensureLoaded('mixingdash');
  } else if (m.type === 'fitl-accidents' && from === 'accidents' && items) {
    lastAccidents = m;
    if (kpiReady) sendKpi(); else ensureLoaded('kpi');
  } else if (m.type === 'fitl-attendance' && from === 'attendance') {
    lastAttendance = m;                                    // daily headcount -> Mixing KPI 3.4, group attendance -> KPI 4.3
    if (mixReady) sendMix(); else ensureLoaded('mixingdash');
    if (kpiReady) sendKpi(); else ensureLoaded('kpi');
  } else if (m.type === 'fitl-employees' && from === 'attendance') {
    lastEmployees = m;
    if (sgReady) sendSg(); else ensureLoaded('shiftgroups');
  } else if (m.type === 'fitl-shiftgroups' && from === 'shiftgroups') {
    lastGroups = m;
    if (attReady) sendAtt(); else ensureLoaded('attendance');
  } else if (m.type === 'fitl-shiftgroups-ready' && from === 'shiftgroups') {
    sgReady = true; sendSg();
  } else if (m.type === 'fitl-attendance-ready' && from === 'attendance') {
    attReady = true; sendAtt();
  } else if (m.type === 'fitl-mixing-ready' && from === 'mixingdash') {
    mixReady = true; sendMix();
  } else if (m.type === 'fitl-kpi-ready' && from === 'kpi') {
    kpiReady = true; sendKpi();
  } else if (m.type === 'fitl-prodsum-ready' && from === 'prodsum') {
    psReady = true; sendPs();
  } else if (m.type === 'fitl-trace-reports' && Array.isArray(m.files) && (from === 'downtime' || from === 'opboard')) {
    m.files.forEach((f) => { traceReports[f.name] = f; });
    const to = from === 'downtime' ? 'opboard' : 'downtime';
    if ((to === 'opboard' && opReady) || (to === 'downtime' && dashReady)) sendTrace(to); else ensureLoaded(to);
  } else if (m.type === 'fitl-opboard-ready' && from === 'opboard') {
    opReady = true;
    // a dashboard opened later still gets the reports imported earlier in this session
    if (Object.keys(traceReports).length) sendTrace('opboard');
  } else if (m.type === 'fitl-dash-ready' && from === 'downtime') {
    dashReady = true;
    if (Object.keys(traceReports).length) sendTrace('downtime');
  }

  // sign-in state and electronic signatures
  if (m.type === 'fitl-auth-request') {
    (ev.source as Window).postMessage(authMessage(), '*');
  } else if (m.type === 'fitl-sign-request') {
    handleSignRequest(ev, m as unknown as SignRequest);
  }
}

export function authMessage() {
  const { user } = getState().auth;
  return { type: 'fitl-auth-state', server: true, user: user ? { name: user.name, email: user.email, designation: user.designation, department: user.department, role: user.role } : null };
}

export function broadcastAuth() {
  const msg = authMessage();
  for (const k of Object.keys(getState().frames.loaded)) { try { win(k)?.postMessage(msg, '*'); } catch { /* ignore */ } }
}

function handleSignRequest(ev: MessageEvent, m: SignRequest) {
  const reply = (o: SignResult & { type?: string; id?: unknown }) => { o.type = 'fitl-sign-result'; o.id = m.id; try { (ev.source as Window).postMessage(o, '*'); } catch { /* the app was closed */ } };
  const ask = () => setState({ dialog: { type: 'sign', req: m, done: (r) => { setState({ dialog: null }); reply(r); } } });
  const { user } = getState().auth;
  if (!user) { reply({ ok: false, reason: 'cancelled' }); return; }
  ask();
}

/** called by the sign dialog: the password is the signature */
export async function submitSignature(req: SignRequest, password: string): Promise<{ result?: SignResult; error?: string; signedOut?: boolean }> {
  const hash = sha256(String(req.content == null ? req.ref : req.content));
  const r = await api('POST', '/api/sign', { password, purpose: req.purpose, ref: req.ref, contentHash: hash });
  if (r.status === 401 && /sign in/i.test(r.j.error || '')) return { signedOut: true };
  if (!r.ok) return { error: r.j.error || 'Could not sign.' };
  const s = r.j.signature;
  return { result: { ok: true, sig: { id: s.id, name: s.name, designation: s.designation, department: s.department, at: s.at, purpose: s.purpose, ref: s.ref, hash: s.contentHash } } };
}

export function initBridge() {
  if (started) return;
  started = true;
  window.addEventListener('message', onApp);
  // Quietly load the apps that feed each other, so flagged risks and RCA-required issues reach their targets
  // even before those tabs have been opened.
  setTimeout(() => ['press', 'agenda', 'capa', 'rca', 'kpi', 'prodsum', 'accidents', 'mixingdash'].forEach(ensureLoaded), 1500);
}
