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
