import { normalize } from './domain';
import type { PlanningCell, Profile, Tp } from './types';

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

export const cellKey = (day: string, group: string) => `${day}|${group}`;

export function indexCells(cells: PlanningCell[]): Map<string, PlanningCell> {
  return new Map(cells.map((c) => [cellKey(c.day, c.group_code), c]));
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
  for (const c of cells) {
    const tp = c.tp_id ? byId.get(c.tp_id) : undefined;
    if (!tp) continue;
    const cur = out.get(tp.id) ?? { days: 0, tp };
    cur.days++;
    out.set(tp.id, cur);
  }
  return out;
};

/** Une écriture dans le semainier : valeur vide = case effacée */
export interface CellOp { day: string; group: string; value: string }

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
        const others = list.filter((o) => o.group_code !== c.group_code && tpById.get(o.tp_id!)?.system_ids.includes(id)).map((o) => o.group_code);
        if (others.length) msgs.push(`« ${sys.name} » aussi prévu pour ${others.join(', ')}`);
      }
      if (msgs.length) out.set(cellKey(c.day, c.group_code), msgs);
    }
  }
  return out;
}

/** Recopie une semaine (lundi à vendredi) vers une autre pour les groupes donnés. `blocked` : jours de la cible à ignorer. */
export function copyWeekOps(
  cells: Map<string, PlanningCell>,
  groups: string[],
  fromMonday: string,
  toMonday: string,
  opts: { overwrite: boolean; blocked: (day: string) => boolean },
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
    for (const g of groups) {
      const c = cells.get(cellKey(src, g));
      const value = cellValue(c);
      if (!value) continue;
      if (cells.get(cellKey(dst, g)) && !opts.overwrite) continue;
      ops.push({ day: dst, group: g, value });
    }
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
