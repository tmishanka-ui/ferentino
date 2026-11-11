/** The departments and the working apps inside them (each app is a page in public/apps/<key>.html). */

export type IconName =
  | 'shield' | 'wrench' | 'cog' | 'factory' | 'calendar' | 'users' | 'coins' | 'globe' | 'compass' | 'flask' | 'book';

export interface Section {
  id: string;
  title: string;
  blurb: string;
  color: string;
  icon: IconName;
  tabs: [key: string, label: string][];
}

export const APP_TITLES: Record<string, string> = {
  capa: 'CAPA Control Platform', press: 'Press Monitoring Dashboard', qc: 'Tyre QC Dashboard', defect: 'Defect Analyser',
  agenda: 'Weekly Management Agenda', rca: 'RCA Workbench', live: 'Live and Tyre Production Monitoring', loading: 'Loading Report',
  pallet: 'Pallet Label Generator', trace: 'Press Trace', calib: 'Temperature Gauge Calibration', maintdash: 'Maintenance Dashboard',
  waste: 'Maintenance Department Waste Removing', downtime: 'Press Downtime Dashboard', training: 'Training Section', board: 'Strategy Board',
  doccontrol: 'Document Control System', kpi: 'Production KPI Dashboard', opboard: 'Press Operation and Downtime', prodsum: 'Production Summary',
  housekeeping: 'Housekeeping and Safety Check List', mixingdash: 'Mixing Department', library: 'Document Library', planner: 'Production Planner',
  firewood: 'Firewood Ledger', custsat: 'Customer Satisfaction', wastedisp: 'Waste Disposal', qckpi: 'QC KPI Dashboard', mkpi: 'Maintenance KPI',
  accidents: 'Accident Registry', attendance: 'Daily Attendance', shiftgroups: 'Shift Groups', audit: 'Internal Audit',
  hrkpi: 'HR KPI Dashboard',
};

export const APP_KEYS = Object.keys(APP_TITLES);

export const SECTIONS: Section[] = [
  { id: 'qc', title: 'QC Department', color: '#DA1B22', icon: 'shield',
    blurb: 'Press monitoring, tyre QC, defect analyser, CAPA control, internal audit',
    tabs: [['press', 'Press Monitoring'], ['qc', 'Tyre QC — Scrap & Repair'], ['defect', 'Defect Analyser'], ['qckpi', 'KPI Dashboard'], ['capa', 'CAPA Control'], ['audit', 'Internal Audit']] },
  { id: 'apps', title: 'Working Apps', color: '#2563EB', icon: 'cog',
    blurb: 'Live monitoring, loading, pallet labels, press trace, gauge calibration',
    tabs: [['live', 'Live & Tyre Production Monitoring'], ['loading', 'Loading Report'], ['pallet', 'Pallet Label Generator'], ['trace', 'Press Trace'], ['calib', 'Temperature Gauge Calibration']] },
  { id: 'maint', title: 'Maintenance Department', color: '#D97706', icon: 'wrench',
    blurb: 'Maintenance dashboard, KPI, waste removing records',
    tabs: [['maintdash', 'Maintenance Dashboard'], ['mkpi', 'KPI'], ['waste', 'Waste Removing']] },
  { id: 'prod', title: 'Production Department', color: '#16A34A', icon: 'factory',
    blurb: 'Press downtime, production KPIs, press operation board, production summary, shift groups',
    tabs: [['downtime', 'Press Downtime Dashboard'], ['kpi', 'Production KPI Dashboard'], ['opboard', 'Press Operation & Downtime'], ['prodsum', 'Production Summary'], ['shiftgroups', 'Shift Groups']] },
  { id: 'planning', title: 'Planning Department', color: '#7C3AED', icon: 'calendar',
    blurb: 'Production planner — tyre building press allocation and cycle times',
    tabs: [['planner', 'Production Planner']] },
  { id: 'hr', title: 'HR Department', color: '#DB2777', icon: 'users',
    blurb: 'Training records and reports, housekeeping checklist, accident registry, attendance, waste disposal, KPI dashboard',
    tabs: [['training', 'Training Section'], ['housekeeping', 'Housekeeping Checklist'], ['accidents', 'Accident Registry'], ['attendance', 'Attendance'], ['wastedisp', 'Waste Disposal'], ['hrkpi', 'KPI Dashboard']] },
  { id: 'finance', title: 'Finance Department', color: '#0D9488', icon: 'coins',
    blurb: 'Firewood receiving ledger — gate, boiler check, accounts, exit',
    tabs: [['firewood', 'Firewood Ledger']] },
  { id: 'export', title: 'Export Department', color: '#0891B2', icon: 'globe',
    blurb: 'Customer satisfaction dashboard — every indicator over 3, by customer and month',
    tabs: [['custsat', 'Customer Satisfaction']] },
  { id: 'general', title: 'General', color: '#64748B', icon: 'compass',
    blurb: 'RCA workbench, strategy board, management agenda, document control',
    tabs: [['rca', 'RCA Workbench'], ['board', 'Strategy Board'], ['agenda', 'Management Agenda'], ['doccontrol', 'Document Control System']] },
  { id: 'mixing', title: 'Mixing Department', color: '#EA580C', icon: 'flask',
    blurb: 'KPI 3.1–3.5 by day, week, month and year, compound-wise production',
    tabs: [['mixingdash', 'Mixing KPI Dashboard']] },
  { id: 'library', title: 'Library', color: '#A16207', icon: 'book',
    blurb: 'Manuals, policy, SOPs, work instructions and sectional documents — view and download',
    tabs: [['library', 'Document Library']] },
];

export const sectionById = (id: string) => SECTIONS.find((s) => s.id === id);

/** names shown for the stored items in messages such as "Changed by …: Document Control" */
const SY_NAMES: Record<string, string> = {
  fitl_dc: 'Document Control', fitl_waste_v1: 'Waste Disposal', fitl_mkpi_v1: 'Maintenance KPI', fitl_cs_v1: 'Customer Satisfaction',
  fitl_qckpi_v1: 'QC KPI Dashboard', fitl_kpi_v1: 'Production KPI', fitl_kpi45_v1: 'KPI 4.5', fitl_waste_months_v1: 'Waste months', fitl_qckpi_reasons_v1: 'QC KPI reasons',
};
export const itemName = (k: string) => SY_NAMES[k] || k.replace(/^fitl[_-]/, '').replace(/[_-]+/g, ' ');
