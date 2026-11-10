import { normalize } from './domain';
import type { Part, PlanningCell, Profile, Tp } from './types';

export const SPECIAL_LABELS = [
  'Période d’observation',
  'Semaine d’accueil des élèves',
  'Semaine de bilan de compétences',
  'Remédiation',
  'PFMP',
  'Évaluation',
  'Oraux de stage',
  'Sortie pédagogique',
];

export const PARTS: readonly Part[] = ['J', 'M', 'A'];
export const PART_LABEL: Record<Part, string> = { J: 'Journée', M: 'Matin', A: 'Après-midi' };

/** Nombre maximal de cours dans une même demi-journée */
export const MAX_SEQ = 4;
/** Clé d'une case ; le premier cours de la demi-journée garde la clé « jour|groupe|partie » */
export const cellKey = (day: string, group: string, part: Part = 'J', seq = 1) => `${day}|${group}|${part}${seq > 1 ? `|${seq}` : ''}`;
/** Deux parties de journée se chevauchent si l'une est la journée entière, ou si elles sont identiques */
export const partsOverlap = (a: Part, b: Part) => a === 'J' || b === 'J' || a === b;
/** Poids d'une case en journées : une demi-journée compte 0,5 */
export const partWeight = (p: Part | undefined) => (p === 'M' || p === 'A' ? 0.5 : 1);

export function indexCells(cells: PlanningCell[]): Map<string, PlanningCell> {
  return new Map(cells.map((c) => [cellKey(c.day, c.group_code, c.part ?? 'J', c.seq ?? 1), c]));
}

/**
 * Le TP est-il à moi ? Par le compte lié au TP, sinon par le nom saisi (« Verwaerde »)
 * retrouvé dans le nom affiché ou l'adresse e-mail.
 */
export function isMine(tp: Pick<Tp, 'teacher_id' | 'teacher_label'> | undefined, me: Profile | null): boolean {
  if (!tp || !me) return false;
  if (tp.teacher_id) return tp.teacher_id === me.id;
  const label = normalize(tp.teacher_label ?? '');
  if (label.length < 3) return false;
  const hay = normalize(`${me.full_name ?? ''} ${me.email.split('@')[0]}`);
  return hay.includes(label);
}

/** Valeur d'une liste déroulante de case : tp:<id>, lab:<texte> ou vide */
export const cellValue = (c: PlanningCell | undefined) =>
  !c ? '' : c.tp_id ? `tp:${c.tp_id}` : c.label ? `lab:${c.label}` : '';

export function cellPatch(value: string): { tp_id: string | null; label: string | null } {
  if (value.startsWith('tp:')) return { tp_id: value.slice(3), label: null };
  if (value.startsWith('lab:')) return { tp_id: null, label: value.slice(4) };
  return { tp_id: null, label: null };
}

export const hoursOf = (tps: Tp[], cells: PlanningCell[]) => {
  const byId = new Map(tps.map((t) => [t.id, t]));
  const out = new Map<string, { days: number; tp: Tp }>();
  // Plusieurs cours dans une même demi-journée (ou journée) : ils se partagent son poids à parts égales
  const count = new Map<string, number>();
  for (const c of cells) if (c.tp_id || c.label) { const k = `${c.day}|${c.group_code}|${c.part ?? 'J'}`; count.set(k, (count.get(k) ?? 0) + 1); }
  for (const c of cells) {
    const tp = c.tp_id ? byId.get(c.tp_id) : undefined;
    if (!tp) continue;
    const cur = out.get(tp.id) ?? { days: 0, tp };
    cur.days += partWeight(c.part) / (count.get(`${c.day}|${c.group_code}|${c.part ?? 'J'}`) ?? 1);
    out.set(tp.id, cur);
  }
  return out;
};

/** Une écriture dans le semainier : valeur vide = case effacée */
export interface CellOp { day: string; group: string; value: string; part?: Part; seq?: number; room?: string | null }

/** Ligne de la table planning_cells correspondant à une écriture (la salle n'est écrite que si elle est précisée) */
export function rowOfOp(o: CellOp) {
  return { day: o.day, group_code: o.group, part: o.part ?? 'J', seq: o.seq ?? 1, ...(o.room !== undefined ? { room_id: o.room } : {}), ...cellPatch(o.value) };
}
export const CONFLICT_COLS = 'day,group_code,part,seq';

/** Avertissements par case : système hors service ou en maintenance, ou réclamé par un autre groupe le même jour */
export function buildWarnings(
  cells: PlanningCell[],
  tpById: Map<string, Pick<Tp, 'system_ids'>>,
  systemById: Map<string, { name: string; state: string }>,
): Map<string, string[]> {
  const byDay = new Map<string, PlanningCell[]>();
  for (const c of cells) if (c.tp_id) byDay.set(c.day, [...(byDay.get(c.day) ?? []), c]);
  const out = new Map<string, string[]>();
  for (const list of byDay.values()) {
    for (const c of list) {
      const msgs: string[] = [];
      for (const id of tpById.get(c.tp_id!)?.system_ids ?? []) {
        const sys = systemById.get(id);
        if (!sys) continue;
        if (sys.state === 'hs') msgs.push(`« ${sys.name} » est hors service`);
        else if (sys.state === 'maint') msgs.push(`« ${sys.name} » est en maintenance`);
        const others = list.filter((o) => o.group_code !== c.group_code && partsOverlap(o.part ?? 'J', c.part ?? 'J') && tpById.get(o.tp_id!)?.system_ids.includes(id)).map((o) => o.group_code);
        if (others.length) msgs.push(`« ${sys.name} » aussi prévu pour ${others.join(', ')}`);
      }
      if (msgs.length) out.set(cellKey(c.day, c.group_code, c.part ?? 'J', c.seq ?? 1), msgs);
    }
  }
  return out;
}

/** Recopie une semaine (lundi à vendredi) vers une autre pour les groupes donnés. `blocked` : jours de la cible à ignorer.
 *  `shift` : décalage des groupes (carrousel), 0 = simple copie. */
export function copyWeekOps(
  cells: Map<string, PlanningCell>,
  groups: string[],
  fromMonday: string,
  toMonday: string,
  opts: { overwrite: boolean; blocked: (day: string) => boolean; shift?: number },
): CellOp[] {
  const ops: CellOp[] = [];
  const shift = (d: string, n: number) => {
    const x = new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)) + n);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };
  for (let i = 0; i < 5; i++) {
    const src = shift(fromMonday, i);
    const dst = shift(toMonday, i);
    if (opts.blocked(dst)) continue;
    for (const [gi, g] of groups.entries()) {
      // Carrousel : le groupe g reçoit ce que faisait, la semaine source, le groupe situé `shift` rangs avant lui
      const from = groups[(((gi - (opts.shift ?? 0)) % groups.length) + groups.length) % groups.length];
      for (const part of PARTS) for (let seq = 1; seq <= MAX_SEQ; seq++) {
        const c = cells.get(cellKey(src, from, part, seq));
        const value = cellValue(c);
        if (!value) continue;
        if (cells.get(cellKey(dst, g, part, seq)) && !opts.overwrite) continue;
        ops.push({ day: dst, group: g, part, seq, value, room: c?.room_id ?? null });
      }
    }
  }
  return ops;
}

/** Carrousel : la semaine source est recopiée sur `weeks` semaines consécutives, les groupes tournant d'un cran à chaque semaine (A : 1.1, B : 1.2, C : 2…). */
export function carouselOps(
  cells: Map<string, PlanningCell>,
  groups: string[],
  fromMonday: string,
  firstTargetMonday: string,
  weeks: number,
  opts: { overwrite: boolean; blocked: (day: string) => boolean },
): CellOp[] {
  const ops: CellOp[] = [];
  const [y, m, d] = [Number(firstTargetMonday.slice(0, 4)), Number(firstTargetMonday.slice(5, 7)) - 1, Number(firstTargetMonday.slice(8, 10))];
  for (let k = 0; k < weeks; k++) {
    const t = new Date(y, m, d + 7 * k);
    const monday = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    ops.push(...copyWeekOps(cells, groups, fromMonday, monday, { ...opts, shift: k + 1 }));
  }
  return ops;
}

/** Besoins en systèmes et outils sur des jours donnés : qui en a besoin, et quels groupes se les disputent */
export function weekNeeds(
  cells: PlanningCell[],
  days: string[],
  tpById: Map<string, Pick<Tp, 'system_ids' | 'tool_ids' | 'code' | 'title'>>,
) {
  const sys = new Map<string, Array<{ day: string; group: string; tp: string }>>();
  const tools = new Map<string, Array<{ day: string; group: string; tp: string }>>();
  for (const c of cells) {
    if (!c.tp_id || !days.includes(c.day)) continue;
    const tp = tpById.get(c.tp_id);
    if (!tp) continue;
    const use = { day: c.day, group: c.group_code, tp: tp.code ?? tp.title };
    for (const id of tp.system_ids) sys.set(id, [...(sys.get(id) ?? []), use]);
    for (const id of tp.tool_ids ?? []) tools.set(id, [...(tools.get(id) ?? []), use]);
  }
  return { systems: sys, tools };
}
