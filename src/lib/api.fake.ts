/**
 * Base en mémoire pour `npm run demo` et pour les tests de l'interface.
 * Jamais incluse dans la version déployée (voir vite.config.ts).
 * Les données sont des exemples : aucune ne vient d'un vrai élève ou collègue.
 */
import { slotConflicts, sessionConflicts } from './conflicts';
import { addDays, iso, mondayOf, schoolYearBounds, schoolYearOf } from './dates';
import { GROUP_CODES, LCODE, LEVELS, SUBS } from './domain';
import { toMin } from './dates';
import type { Api, AuthUser, Match, Query, Row } from './apiTypes';
import type { Profile, Room, Session, Slot } from './types';

type Tbl = Row[];
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

export interface DemoOptions {
  as?: 'admin' | 'prof' | 'lecture' | 'pending' | 'signedout';
  empty?: boolean;
  /** Fonctions élèves actives (par défaut : désactivées en attente de validation RGPD) */
  studentsOn?: boolean;
}

const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
let options: DemoOptions = { as: (params.get('as') as DemoOptions['as']) ?? 'admin', studentsOn: params.get('students') === 'on' };
export const configureDemo = (o: DemoOptions) => {
  options = { ...options, ...o };
  reset();
};

const ME: Record<string, string> = {
  admin: '00000000-0000-4000-8000-000000000001',
  prof: '00000000-0000-4000-8000-000000000002',
  lecture: '00000000-0000-4000-8000-000000000003',
  pending: '00000000-0000-4000-8000-000000000004',
};

let T: Record<string, Tbl> = {};
let signedIn = true;
const passwords = new Map<string, string>();
const withPassword = new Set<string>();
const listeners = new Set<(t: string) => void>();
const authListeners = new Set<(u: AuthUser | null) => void>();

function currentProfile(): Profile | undefined {
  return (T.profiles as unknown as Profile[]).find((p) => p.id === ME[options.as ?? 'admin']);
}
const currentUser = (): AuthUser | null => {
  const p = currentProfile();
  return signedIn && p ? { id: p.id, email: p.email, hasPassword: withPassword.has(p.id) } : null;
};

function reset() {
  const t0 = new Date();
  const monday = mondayOf(t0);
  const sy = schoolYearBounds(schoolYearOf(t0));
  const day = (n: number) => iso(addDays(monday, n));

  const profile = (key: string, email: string, name: string | null, role: Profile['role'], active: boolean) => ({
    id: ME[key], email, full_name: name, role, active, created_at: now(), last_seen: now(),
  });
  const profiles = [
    profile('admin', 'alexandre.v@lamache.org', 'Alexandre V.', 'admin', true),
    profile('prof', 'marc.m@lamache.org', 'Marc M.', 'prof', true),
    profile('lecture', 'sophie.s@lamache.org', 'Sophie S.', 'lecture', true),
    profile('pending', 'nouveau.collegue@lamache.org', null, 'prof', false),
  ];

  const room = (name: string, building: string, kind: Room['kind'], seats: number, shared = false) => ({
    id: uid(), name, building, kind, seats, shared, notes: null, active: true, created_at: now(),
  });
  const rooms = [
    room('A101', 'Bâtiment A', 'atelier', 16),
    room('A102', 'Bâtiment A', 'atelier', 16),
    room('A103', 'Bâtiment A', 'labo', 12),
    room('B201', 'Bâtiment B', 'salle', 30),
    room('B202', 'Bâtiment B', 'info', 24),
    room('Grand atelier', 'Bâtiment A', 'atelier', 40, true),
  ];
  const R = (n: string) => rooms.find((r) => r.name === n)!.id as string;

  const sys = (name: string, ref: string | null, room: string | null, qty: number, state = 'service', notes: string | null = null) => ({
    id: uid(), name, ref, domain: 'ind', room_id: room ? R(room) : null, qty, state, notes, image_url: null, created_by: ME.admin, created_at: now(),
  });
  const systems = [
    sys('Capsuleuse Ravoux', '326-021', 'A101', 1, 'service', 'Fil rouge industriel (exemple).'),
    sys('Platine moteur triphasé à résistances', null, 'A102', 4),
    sys('Banc API M221', null, 'A102', 8),
    sys('Banc Zelio', null, 'A103', 6, 'maint'),
    sys('Armoire de câblage seconde', null, 'A101', 8),
  ];
  const S = (n: string) => systems.find((s) => s.name.startsWith(n))!.id as string;

  const tp = (code: string, title: string, level: string, hours: number | null, systemIds: string[], competences: string[]) => ({
    id: uid(), code, title, level, domain: 'ind', hours, system_ids: systemIds, competences, objective: null, teacher_id: null, teacher_label: null, sequence_name: null, documents: [], tool_ids: [], reusable: false, pair_size: 1, created_at: now(),
  });
  const tps = [
    tp('P1', 'Câblage avec fiches bananes sur platine à bornes repérées', 'Seconde', 4, [S('Armoire')], ['C1', 'C4', 'C5', 'C11']),
    tp('P2', 'Câblage filaire réel en armoire', 'Seconde', 4, [S('Armoire')], ['C1', 'C4', 'C5', 'C11']),
    tp('P3', 'Inversion du sens de rotation et verrouillage électrique', 'Seconde', 4, [S('Armoire')], ['C1', 'C4', 'C5', 'C11']),
    tp('TP5', 'Programmation de l’automate M221', 'Première', 5, [S('Banc API')], ['C6', 'C7']),
    tp('TP6', 'Programmation du relais Zelio', 'Première', 5, [S('Banc Zelio')], ['C6', 'C7']),
    { ...tp('Industrie (1)', 'Activité rail – contacts', 'Seconde', 2, [], ['C1', 'C4', 'C5', 'C11']), domain: 'ind', teacher_id: ME.admin, objective: 'Identifier les bornes au multimètre et faire le lien avec la platine banane' },
    { ...tp('Prod Ener (1)', 'Installation PV pour éclairage LED', 'Seconde', 11, [], ['C1', 'C3', 'C6']), domain: 'pen', teacher_label: 'Dupont', objective: 'Dimensionner et câbler une petite installation photovoltaïque' },
    { ...tp('Atelier', 'Travailler en milieu professionnel', 'Seconde', 7, [], ['C2', 'C4', 'C5', 'C12']), domain: 'ate', teacher_label: 'Martin', objective: 'Mise en situation réelle dans l’atelier de production' },
    { ...tp('REM Cours', 'Les bases de l’électricité', 'Seconde', null, [], ['C1', 'C3', 'C5']), domain: 'rem', teacher_id: ME.admin, objective: 'Principes physiques et calculs' },
  ];
  const planning = (() => {
    const out: Array<Record<string, unknown>> = [];
    const wk = mondayOf(t0);
    const tpId = (c: string) => tps.find((x) => x.code === c)!.id;
    const plan: Array<[number, string, string]> = [
      [0, '2PB1.1', 'REM Cours'], [0, '2PB1.2', 'REM Cours'], [0, '2PB2', 'REM Cours'],
      [1, '2PB1.1', 'Prod Ener (1)'], [1, '2PB1.2', 'Industrie (1)'], [1, '2PB2', 'Atelier'],
      [2, '2PB1.1', 'Prod Ener (1)'], [2, '2PB1.2', 'Industrie (1)'], [2, '2PB2', 'Atelier'],
      [3, '2PB1.1', 'Atelier'], [3, '2PB1.2', 'Prod Ener (1)'], [3, '2PB2', 'Industrie (1)'],
    ];
    for (const [d, g, c] of plan) out.push({ day: iso(addDays(wk, d)), group_code: g, part: 'J', seq: 1, room_id: null, teacher_ids: [], teacher_labels: [], tp_id: tpId(c), label: null, note: null, updated_by: ME.admin, updated_at: now() });
    out.push({ day: iso(addDays(wk, 7)), group_code: '2PB1.1', part: 'J', seq: 1, room_id: null, teacher_ids: [], teacher_labels: [], tp_id: null, label: 'Période d’observation', note: null, updated_by: ME.admin, updated_at: now() });
    return out;
  })();
  const TP = (c: string) => tps.find((x) => x.code === c)!.id as string;

  const slot = (roomName: string, group: string, who: string, weekday: number, start: string, end: string, label: string | null, tpCode: string | null, sysName: string | null) => ({
    id: uid(), room_id: R(roomName), group_code: group,
    teacher_id: who === 'alexandre' ? ME.admin : who === 'marc' ? ME.prof : null,
    teacher_label: who === 'alexandre' || who === 'marc' ? null : who,
    weekday, start_time: start + ':00', end_time: end + ':00', label,
    tp_id: tpCode ? TP(tpCode) : null, system_id: sysName ? S(sysName) : null,
    valid_from: sy.from, valid_to: sy.to, created_by: ME.admin, created_at: now(),
  });
  const slots = [
    slot('A101', '2PB1.1', 'alexandre', 2, '13:30', '17:30', null, 'P2', 'Armoire'),
    slot('A101', '2PB1.2', 'alexandre', 3, '08:00', '12:00', null, 'P1', 'Armoire'),
    slot('A102', '1PB1.1', 'alexandre', 1, '08:00', '13:00', null, 'TP5', 'Banc API'),
    slot('A102', '1PB1.2', 'M. S', 2, '08:00', '13:00', null, 'TP5', 'Banc API'),
    slot('A103', '1PB2', 'marc', 4, '08:00', '13:00', null, 'TP6', 'Banc Zelio'),
    slot('B201', '2PB2', 'marc', 1, '08:00', '10:00', 'Cours de technologie', null, null),
    slot('B201', '2PB1.1', 'alexandre', 1, '10:15', '12:15', 'Cours de technologie', null, null),
    slot('B202', 'TPB1.1', 'M. M', 3, '09:00', '12:00', 'Dossier technique', null, null),
    slot('Grand atelier', 'TPB2', 'M. S', 2, '08:00', '12:00', 'Production', null, null),
    slot('Grand atelier', 'TPB1.2', 'M. M', 2, '08:00', '12:00', 'Production', null, null),
  ];

  const sess = (slotRef: ReturnType<typeof slot> | null, date: string, extra: Partial<Session>) => ({
    id: uid(), slot_id: slotRef?.id ?? null, session_date: date,
    start_time: slotRef?.start_time ?? '14:00:00', end_time: slotRef?.end_time ?? '16:00:00',
    room_id: slotRef?.room_id ?? null, group_code: slotRef?.group_code ?? null,
    tp_id: slotRef?.tp_id ?? null, system_id: slotRef?.system_id ?? null,
    teacher_id: ME.admin, teacher_label: null, label: null, note: null, status: 'planned',
    created_by: ME.admin, created_at: now(), ...extra,
  });
  const sessions = [
    sess(slots[2], day(0), { status: 'done', note: 'Séance faite, 2 binômes en retard.' }),
    sess(slots[1], day(2), { status: 'cancelled' }),
    sess(slots[3], day(1), { room_id: R('B202'), label: 'Salle déplacée (panne)' }),
    sess(null, day(3), { room_id: R('B201'), start_time: '14:00:00', end_time: '16:00:00', label: 'Réunion d’équipe', teacher_id: ME.admin }),
  ];

  const students: Row[] = [];
  const progress: Row[] = [];
  const first = ['Emma', 'Hugo', 'Lina', 'Noah', 'Jade', 'Louis', 'Zoé', 'Adam', 'Inès', 'Léo'];
  for (const g of ['1PB1.1', '1PB1.2', '2PB1.1']) {
    first.slice(0, 8).forEach((f, i) => {
      const id = uid();
      students.push({ id, name: `${f} ${String.fromCharCode(65 + ((i * 3 + g.length) % 20))}.`, group_code: g, created_at: now() });
      const lv = g.startsWith('1P') ? ['TP5', 'TP6'] : ['P1', 'P2', 'P3'];
      lv.forEach((c, j) => {
        const k = (i + j + g.length) % 6;
        if (k < 5) progress.push({ student_id: id, tp_id: TP(c), level: ['NA', 'ECA', 'PA', 'A', 'A'][k], updated_at: now(), updated_by: ME.admin });
      });
    });
  }

  const maint = [
    { id: uid(), system_id: S('Banc Zelio'), kind: 'corr', title: 'Relais SR2 ne répond plus', description: 'Plus de communication avec le PC depuis lundi.', priority: 'u', due_date: day(4), status: 'wip', closed_at: null, photo_url: null, plan_id: null, created_by: ME.prof, created_at: now() },
    { id: uid(), system_id: S('Capsuleuse'), kind: 'prev', title: 'Contrôle annuel des protections', description: null, priority: 'n', due_date: day(14), status: 'open', closed_at: null, photo_url: null, plan_id: null, created_by: ME.admin, created_at: now() },
    { id: uid(), system_id: S('Banc API'), kind: 'corr', title: 'Câbles Ethernet à remplacer', description: null, priority: 'h', due_date: null, status: 'done', closed_at: now(), photo_url: null, plan_id: null, created_by: ME.admin, created_at: now() },
  ];
  const purchases = [
    { id: uid(), kind: 'mat', item: 'Contacteur 3P 25 A bobine 24 V', ref: 'LC1D25B7', qty: 6, unit_price: 38.5, system_id: S('Armoire'), justification: 'Remplacement avant TP P3', urgent: true, supplier: null, quote_ref: null, quote_url: null, status: 'req', requested_by: ME.prof, created_at: now() },
    { id: uid(), kind: 'conso', item: 'Embouts de câblage 1,5 mm² (boîte 500)', ref: null, qty: 3, unit_price: 14.9, system_id: null, justification: null, urgent: false, supplier: null, quote_ref: null, quote_url: null, status: 'ord', requested_by: ME.admin, created_at: now() },
  ];

  T = {
    profiles: profiles as Tbl,
    teacher_groups: [{ profile_id: ME.admin, group_code: '1PB1.1' }, { profile_id: ME.prof, group_code: '1PB2' }],
    groups: GROUP_CODES.map((code, i) => {
      const level = LEVELS.find((l) => code.startsWith(LCODE[l]))!;
      return { code, level, sub: SUBS.find((s) => code.endsWith(s)) ?? '', sort: i + 1 };
    }),
    rooms, systems, tps, timetable_slots: slots, sessions,
    maintenance: maint, maintenance_notes: [{ id: uid(), maintenance_id: maint[0].id, author_id: ME.prof, text: 'Pièce commandée chez le fournisseur.', created_at: now() }],
    purchases, students, progress,
    tools: [
      { id: uid(), name: 'Pince à dénuder automatique', ref: null, category: 'Outillage à main', qty: 8, room_id: rooms[0].id, state: 'ok', image_url: null, notes: null, created_at: now() },
      { id: uid(), name: 'Multimètre numérique CAT III', ref: 'MX 53', category: 'Mesure', qty: 12, room_id: rooms[2].id, state: 'ok', image_url: null, notes: 'Piles à vérifier chaque trimestre', created_at: now() },
      { id: uid(), name: 'Tournevis isolés 1000 V (jeu)', ref: null, category: 'Outillage à main', qty: 10, room_id: rooms[0].id, state: 'usage', image_url: null, notes: null, created_at: now() },
    ],
    settings: [
      { key: 'site_title', value: 'Parc MELEC' }, { key: 'site_logo_url', value: '' }, { key: 'school_logo_url', value: '' },
      { key: 'year_start', value: sy.from }, { key: 'year_end', value: sy.to }, { key: 'shown_days', value: '1,2,3,4' }, ...(options.studentsOn ? [{ key: 'students_enabled', value: '1' }] : []),
    ],
    calendar_periods: [
      { id: uid(), kind: 'vacances', label: 'Toussaint', start_date: `${sy.from.slice(0, 4)}-10-17`, end_date: `${sy.from.slice(0, 4)}-11-01` },
      { id: uid(), kind: 'ferie', label: 'Armistice', start_date: `${sy.from.slice(0, 4)}-11-11`, end_date: `${sy.from.slice(0, 4)}-11-11` },
    ],
    planning_cells: planning as Tbl,
    fiches: [], maintenance_plans: [], companies: [], pfmp_periods: [], ideas: [], audit_log: [], invitations: [],
    headcounts: [['2PB1.1', 24], ['2PB1.2', 22], ['2PB2', 12]].map(([g, n]) => ({ id: uid(), group_code: g, day: sy.from, kind: 'initial', n, note: null, created_at: now() })) as Tbl,
  };
  if (options.empty) {
    for (const k of ['rooms', 'systems', 'tps', 'timetable_slots', 'sessions', 'maintenance', 'maintenance_notes', 'purchases', 'students', 'progress', 'tools', 'calendar_periods', 'planning_cells', 'fiches', 'maintenance_plans', 'companies', 'pfmp_periods', 'ideas', 'headcounts', 'invitations']) T[k] = [];
  }
  signedIn = options.as !== 'signedout';
}
reset();

const PK: Record<string, string[]> = {
  progress: ['student_id', 'tp_id'], teacher_groups: ['profile_id', 'group_code'], groups: ['code'],
  planning_cells: ['day', 'group_code', 'part', 'seq'], settings: ['key'], invitations: ['email'],
};
const pkOf = (table: string) => PK[table] ?? ['id'];
const same = (table: string, a: Row, b: Row) => pkOf(table).every((k) => a[k] === b[k]);

const matches = (row: Row, match: Match) =>
  Object.entries(match).every(([k, v]) => (Array.isArray(v) ? v.includes(row[k]) : row[k] === v));

const notify = (table: string) => queueMicrotask(() => listeners.forEach((cb) => cb(table)));

const ADMIN_ONLY = new Set(['rooms', 'teacher_groups', 'tools', 'settings', 'calendar_periods', 'audit_log', 'headcounts', 'invitations']);
const AUDITED: Record<string, string[]> = {
  systems: ['id'], tps: ['id'], fiches: ['id'], maintenance: ['id'], maintenance_plans: ['id'], purchases: ['id'], rooms: ['id'], tools: ['id'],
  students: ['id'], planning_cells: ['day', 'group_code', 'part', 'seq'], companies: ['id'], pfmp_periods: ['id'], sessions: ['id'], timetable_slots: ['id'],
};
let auditSeq = 0;
function audit(table: string, op: 'INSERT' | 'UPDATE' | 'DELETE', before: Row | null, after: Row | null) {
  const keys = AUDITED[table];
  if (!keys) return;
  if (op === 'UPDATE' && JSON.stringify({ ...before, updated_at: 0 }) === JSON.stringify({ ...after, updated_at: 0 })) return;
  const src = (after ?? before)!;
  (T.audit_log ??= []).push({ id: ++auditSeq, at: now(), user_id: currentUser()?.id ?? null, table_name: table, op, row_key: keys.map((k) => src[k]).join('/'), old_data: before ? structuredClone(before) : null, new_data: after ? structuredClone(after) : null });
}

function guard(table: string, op: 'insert' | 'update' | 'delete') {
  const p = currentProfile();
  const role = p?.active ? p.role : null;
  const denied = () => {
    throw new Error(`new row violates row-level security policy for table "${table}"`);
  };
  if (!role) return denied();
  if (table === 'ideas') return op === 'insert' || role === 'admin' ? undefined : denied();
  if (table === 'profiles') return role === 'admin' ? undefined : denied();
  if (ADMIN_ONLY.has(table) && role !== 'admin') return denied();
  if (role === 'lecture') return denied();
  if (op === 'delete' && ['systems', 'tps', 'maintenance', 'students'].includes(table) && role !== 'admin') return denied();
  if (table === 'fiches' && op !== 'insert' && role !== 'admin') return undefined;
  if (table === 'purchases' && op === 'update' && role !== 'admin') throw new Error('Seul un gestionnaire peut changer le statut d’une demande.');
}

function defaults(table: string, row: Row): Row {
  const me = currentUser()?.id ?? null;
  const base: Row = { created_at: now() };
  switch (table) {
    case 'systems': Object.assign(base, { domain: 'ind', qty: 1, state: 'service', created_by: me }); break;
    case 'tps': Object.assign(base, { domain: 'ind', system_ids: [], competences: [], documents: [], tool_ids: [], reusable: false, pair_size: 1, parent_id: null }); break;
    case 'maintenance_plans': Object.assign(base, { priority: 'n', checklist: [], active: true }); break;
    case 'pfmp_periods': Object.assign(base, { status: 'planned' }); break;
    case 'ideas': Object.assign(base, { category: 'autre', status: 'nouvelle', answer: null, body: null, votes: [], created_by: me }); break;
    case 'maintenance': Object.assign(base, { kind: 'corr', priority: 'n', status: 'open', closed_at: null, photo_url: null, plan_id: null, created_by: me }); break;
    case 'maintenance_notes': Object.assign(base, { author_id: me }); break;
    case 'purchases': Object.assign(base, { kind: 'mat', qty: 1, unit_price: 0, urgent: false, supplier: null, quote_ref: null, quote_url: null, status: 'req', requested_by: me }); break;
    case 'timetable_slots': Object.assign(base, { created_by: me }); break;
    case 'sessions': Object.assign(base, { teacher_id: me, status: 'planned', created_by: me }); break;
    case 'rooms': Object.assign(base, { kind: 'salle', shared: false, active: true }); break;
    case 'progress': Object.assign(base, { updated_at: now(), updated_by: me }); break;
    case 'tools': Object.assign(base, { qty: 1, state: 'ok', image_url: null }); break;
    case 'planning_cells': Object.assign(base, { part: 'J', seq: 1, room_id: null, teacher_ids: [], teacher_labels: [], tp_id: null, label: null, note: null, updated_by: me, updated_at: now() }); break;
    case 'fiches': Object.assign(base, { data: {}, documents: [], reusable: false, sequence_id: null, created_by: me, updated_at: now() }); break;
  }
  const out = { ...base, ...row };
  if (pkOf(table).length === 1 && pkOf(table)[0] === 'id' && !out.id) out.id = uid();
  return out;
}

function checkConflicts(table: string, row: Row, previous?: Row) {
  if (table === 'fiches' && row.sequence_id) {
    if (row.kind !== 'seance') throw new Error('Seule une fiche séance peut être rattachée à une séquence.');
    const target = (T.fiches ?? []).find((f) => f.id === row.sequence_id);
    if (!target || target.kind !== 'sequence') throw new Error('La fiche rattachée doit être une fiche séquence.');
  }
  if ((table === 'fiches' || table === 'tps') && Array.isArray(row.documents) && row.documents.some((d: { url?: string; path?: string }) => !(/^https?:\/\//i.test(d?.url ?? '') || /^docs\/[\w-]{8,64}\/[^/]{1,150}$/.test(d?.path ?? ''))))
    throw new Error('violates check constraint "documents_check"');
  const slots = T.timetable_slots as unknown as Slot[];
  const sessions = T.sessions as unknown as Session[];
  const rooms = T.rooms as unknown as Room[];
  if (table === 'timetable_slots') {
    const msgs = slotConflicts(
      { id: row.id as string, roomId: row.room_id as string, groupCode: row.group_code as string, teacherId: row.teacher_id as string | null,
        teacherLabel: row.teacher_label as string | null, weekday: row.weekday as number, start: toMin(String(row.start_time)),
        end: toMin(String(row.end_time)), from: row.valid_from as string, to: row.valid_to as string },
      slots.filter((s) => s.id !== (previous?.id ?? row.id)), sessions, rooms);
    if (msgs.length) throw new Error(msgs[0]);
  }
  if (table === 'sessions' && row.status !== 'cancelled') {
    const msgs = sessionConflicts(
      { id: row.id as string, slotId: row.slot_id as string | null, date: row.session_date as string, start: toMin(String(row.start_time)),
        end: toMin(String(row.end_time)), roomId: row.room_id as string | null, groupCode: row.group_code as string | null,
        teacherId: row.teacher_id as string | null, teacherLabel: row.teacher_label as string | null },
      slots, sessions, rooms);
    if (msgs.length) throw new Error(msgs[0]);
  }
}

function cascade(table: string, removed: Row[]) {
  const ids = removed.map((r) => r.id);
  const drop = (t: string, pred: (r: Row) => boolean) => {
    const before = T[t].length;
    T[t] = T[t].filter((r) => !pred(r));
    if (T[t].length !== before) notify(t);
  };
  const nullify = (t: string, col: string) => {
    let changed = false;
    T[t].forEach((r) => { if (ids.includes(r[col] as string)) { r[col] = null; changed = true; } });
    if (changed) notify(t);
  };
  if (table === 'tps') drop('planning_cells', (r) => ids.includes(r.tp_id) && !r.label && !r.note);
  if (table === 'tps') nullify('planning_cells', 'tp_id');
  if (table === 'tps') nullify('tps', 'parent_id');
  if (table === 'fiches') nullify('fiches', 'sequence_id');
  if (table === 'students') drop('progress', (r) => ids.includes(r.student_id));
  if (table === 'tps') drop('progress', (r) => ids.includes(r.tp_id));
  if (table === 'systems') drop('maintenance', (r) => ids.includes(r.system_id));
  if (table === 'maintenance') drop('maintenance_notes', (r) => ids.includes(r.maintenance_id));
  if (table === 'timetable_slots') nullify('sessions', 'slot_id');
}

const FILES = new Map<string, Blob>();

/** Liens de connexion envoyés depuis l'administration (démo et tests) */
export const sentLinks: string[] = [];

export const api: Api = {
  async probe() { return 'ok'; },
  configured: true,
  storage: {
    async upload(path, file) {
      const p = currentProfile();
      if (!p?.active || p.role === 'lecture') throw new Error('new row violates row-level security policy for table "objects"');
      if (FILES.has(path)) throw new Error('The resource already exists');
      if (file.size > 10 * 1024 * 1024) throw new Error('The object exceeded the maximum allowed size');
      FILES.set(path, file);
    },
    async download(path) {
      const f = FILES.get(path);
      if (!f) throw new Error('Object not found');
      return f;
    },
    async remove(paths) { paths.forEach((x) => FILES.delete(x)); },
  },
  images: {
    async upload(file) {
      const p = currentProfile();
      if (!p?.active || p.role === 'lecture') throw new Error('new row violates row-level security policy for table "objects"');
      if (file.size > 5 * 1024 * 1024) throw new Error('The object exceeded the maximum allowed size');
      return `https://demo.local/images/${crypto.randomUUID()}/${encodeURIComponent(file.name)}`;
    },
  },
  auth: {
    async user() { return currentUser(); },
    onChange(cb) { authListeners.add(cb); return () => authListeners.delete(cb); },
    async sendLink(email) {
      if (!/@lamache\.org$/i.test(email)) throw new Error('Database error saving new user');
      signedIn = true;
      authListeners.forEach((cb) => cb(currentUser()));
    },
    async sendLoginLink(email) {
      if (!T.profiles.some((p) => p.email === email.toLowerCase())) throw new Error('Signups not allowed for otp');
      sentLinks.push(email.toLowerCase());
    },
    async sendInvite(email) {
      sentLinks.push(email.toLowerCase());
    },
    async verifyCode() { signedIn = true; authListeners.forEach((cb) => cb(currentUser())); },
    async signInPassword(email, password) {
      const p = currentProfile();
      if (!p || p.email !== email.toLowerCase() || passwords.get(p.id) !== password) throw new Error('Invalid login credentials');
      signedIn = true; authListeners.forEach((cb) => cb(currentUser()));
    },
    async setPassword(password) {
      const p = currentProfile();
      if (!p || !signedIn) throw new Error('Auth session missing');
      if (password.length < 8) throw new Error('Password should be at least 8 characters');
      passwords.set(p.id, password); withPassword.add(p.id);
      authListeners.forEach((cb) => cb(currentUser()));
    },
    async signOut() { signedIn = false; authListeners.forEach((cb) => cb(null)); },
  },
  async select<T>(table: string, q: Query = {}) {
    const p = currentProfile();
    if (table === 'settings' && !(p && p.active))
      return (T.settings ?? []).filter((r) => ['site_title', 'site_logo_url', 'school_logo_url'].includes(String(r.key))) as T[];
    if (table !== 'profiles' && !(p && p.active)) return [] as T[];
    if (table === 'audit_log' && p?.role !== 'admin') return [] as T[];
    let rows = (T[table] ?? []).filter((r) => !q.eq || matches(r, q.eq));
    if (table === 'profiles' && !(p && p.active)) rows = rows.filter((r) => r.id === p?.id);
    if (q.order) for (const [col, dir] of [...q.order].reverse())
      rows = [...rows].sort((a, b) => String(a[col] ?? '').localeCompare(String(b[col] ?? '')) * (dir === 'asc' ? 1 : -1));
    return structuredClone(q.limit ? rows.slice(0, q.limit) : rows) as T[];
  },
  async insert<T>(table: string, rows: Row | Row[]) {
    guard(table, 'insert');
    const list = (Array.isArray(rows) ? rows : [rows]).map((r) => defaults(table, r));
    if (table === 'rooms' && list.some((r) => (T.rooms.some((x) => x.name === r.name)))) throw new Error('duplicate key value violates unique constraint "rooms_name_key"');
    if (table === 'planning_cells' && list.some((r) => T.planning_cells.some((x) => x.day === r.day && x.group_code === r.group_code && (x.part ?? 'J') === (r.part ?? 'J') && (x.seq ?? 1) === (r.seq ?? 1))))
      throw new Error('duplicate key value violates unique constraint "planning_cells_pkey"');
    list.forEach((r) => checkConflicts(table, r));
    T[table] = [...(T[table] ?? []), ...list];
    list.forEach((r) => audit(table, 'INSERT', null, r));
    notify(table);
    return structuredClone(list) as T[];
  },
  async update(table, match, patch) {
    guard(table, 'update');
    let changed = false;
    T[table] = T[table].map((r) => {
      if (!matches(r, match)) return r;
      const next = { ...r, ...patch };
      checkConflicts(table, next, r);
      if (table === 'maintenance') next.closed_at = next.status === 'done' ? (r.status === 'done' ? r.closed_at : now()) : null;
      changed = true;
      audit(table, 'UPDATE', r, next);
      return next;
    });
    if (changed) notify(table);
  },
  async upsert(table, rows) {
    guard(table, 'update');
    for (const row of rows) {
      const i = T[table].findIndex((r) => same(table, r, row));
      if (i >= 0) { const prev = T[table][i]; T[table][i] = { ...prev, ...row }; audit(table, 'UPDATE', prev, T[table][i]); }
      else { const d = defaults(table, row); T[table].push(d); audit(table, 'INSERT', null, d); }
    }
    notify(table);
  },
  async remove(table, match) {
    guard(table, 'delete');
    const removed = T[table].filter((r) => matches(r, match));
    if (table === 'rooms' && removed.some((r) => T.timetable_slots.some((s) => s.room_id === r.id)))
      throw new Error('update or delete on table "rooms" violates foreign key constraint "timetable_slots_room_id_fkey"');
    T[table] = T[table].filter((r) => !matches(r, match));
    removed.forEach((r) => audit(table, 'DELETE', r, null));
    cascade(table, removed);
    if (removed.length) notify(table);
  },
  async rpc(fn, args) {
    const p = currentProfile();
    if (fn === 'toggle_idea_vote' && p) {
      const idea = T.ideas.find((x) => x.id === args?.p_id);
      if (idea) { const v = (idea.votes as string[]) ?? []; idea.votes = v.includes(p.id) ? v.filter((x) => x !== p.id) : [...v, p.id]; notify('ideas'); }
      return null;
    }
    if (fn === 'touch_me' && p) p.last_seen = now();
    if (fn === 'set_my_name' && p) { p.full_name = String(args?.p_name ?? '').trim() || null; notify('profiles'); }
    const adminOnly = () => { if (p?.role !== 'admin' || !p.active) throw new Error('Réservé aux gestionnaires'); };
    const months = (key: string) => Number(String(T.settings.find((x) => x.key === key)?.value ?? '12').replace(/\D/g, '')) || 12;
    const ago = (m: number) => { const d = new Date(); d.setMonth(d.getMonth() - m); return d; };
    const expiredStudents = () => T.students.filter((s) => s.left_at && new Date(String(s.left_at)) < ago(months('retention_students_months')));
    if (fn === 'purge_preview') {
      adminOnly();
      return { students: expiredStudents().length, audit: (T.audit_log ?? []).filter((a) => new Date(String(a.at)) < ago(months('retention_audit_months'))).length, students_months: months('retention_students_months'), audit_months: months('retention_audit_months') };
    }
    const scrub = (id: string) => { T.audit_log = (T.audit_log ?? []).filter((a) => { const d = (a.new_data ?? a.old_data) as Row | null; return !((a.table_name === 'students' && d?.id === id) || (a.table_name === 'progress' && d?.student_id === id)); }); };
    const erase = (id: string) => { T.students = T.students.filter((s) => s.id !== id); T.progress = T.progress.filter((x) => x.student_id !== id); scrub(id); };
    if (fn === 'purge_expired') {
      adminOnly();
      const ids = expiredStudents().map((s) => String(s.id));
      ids.forEach(erase);
      const before = (T.audit_log ?? []).length;
      T.audit_log = (T.audit_log ?? []).filter((a) => new Date(String(a.at)) >= ago(months('retention_audit_months')));
      notify('students'); notify('progress');
      return { students: ids.length, audit: before - T.audit_log.length };
    }
    if (fn === 'export_student') {
      adminOnly();
      const s = T.students.find((x) => x.id === args?.p_id);
      if (!s) return null;
      return { eleve: s, competences: T.progress.filter((x) => x.student_id === s.id).map((x) => ({ tp: T.tps.find((t) => t.id === x.tp_id)?.code ?? null, titre: T.tps.find((t) => t.id === x.tp_id)?.title ?? null, niveau: x.level, modifie_le: x.updated_at })), exporte_le: now() };
    }
    if (fn === 'erase_student') { adminOnly(); erase(String(args?.p_id)); notify('students'); notify('progress'); return null; }
    if (fn === 'generate_due_maintenance') {
      if (!p?.active || p.role === 'lecture') throw new Error('Droits insuffisants');
      const today = iso(new Date());
      let n = 0;
      for (const plan of T.maintenance_plans ?? []) {
        if (!plan.active || String(plan.next_due) > today) continue;
        if (!T.maintenance.some((m) => m.plan_id === plan.id && m.status !== 'done')) {
          T.maintenance.push({ id: uid(), system_id: plan.system_id, kind: 'prev', title: plan.title, description: [plan.description, ...((plan.checklist as string[]) ?? []).map((x) => `- ${x}`)].filter(Boolean).join('\n') || null,
            priority: plan.priority, due_date: plan.next_due, status: 'open', closed_at: null, photo_url: null, plan_id: plan.id, created_by: p.id, created_at: now() });
          n++;
        }
        let d = new Date(String(plan.next_due));
        while (iso(d) <= today) d = addDays(d, Number(plan.every_days));
        plan.next_due = iso(d);
      }
      if (n) { notify('maintenance'); }
      notify('maintenance_plans');
      return n;
    }
    return null;
  },
  subscribe(_tables, cb) { listeners.add(cb); return () => listeners.delete(cb); },
};

export const configured = true;
