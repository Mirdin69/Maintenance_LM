import type { MarkLevel, Progress, Tp } from './types';

const VALUE: Record<MarkLevel, number> = { NA: 1, ECA: 2, PA: 3, A: 4 };

export interface CompCell { level: MarkLevel | ''; done: number; total: number }

const levelOf = (avg: number): MarkLevel => (avg >= 3.5 ? 'A' : avg >= 2.5 ? 'PA' : avg >= 1.5 ? 'ECA' : 'NA');

/** Compétences couvertes par les TP d'un niveau, dans l'ordre C1, C2… */
export function competencesOf(tps: Array<Pick<Tp, 'competences'>>): string[] {
  const set = new Set(tps.flatMap((t) => t.competences));
  return [...set].sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')) || a.localeCompare(b));
}

/**
 * Niveau d'un élève dans une compétence : moyenne de ses évaluations sur les TP qui la travaillent
 * (non acquis 1, en cours 2, partiellement acquis 3, acquis 4). Vide tant qu'aucun TP n'est évalué.
 */
export function studentCompetence(studentId: string, comp: string, tps: Array<Pick<Tp, 'id' | 'competences'>>, progress: Array<Pick<Progress, 'student_id' | 'tp_id' | 'level'>>): CompCell {
  const covering = tps.filter((t) => t.competences.includes(comp));
  const marks = covering.map((t) => progress.find((p) => p.student_id === studentId && p.tp_id === t.id)?.level).filter((x): x is MarkLevel => !!x);
  if (!marks.length) return { level: '', done: 0, total: covering.length };
  return { level: levelOf(marks.reduce((a, m) => a + VALUE[m], 0) / marks.length), done: marks.length, total: covering.length };
}

/** Part des élèves au moins « partiellement acquis » dans la compétence, sur ceux qui ont été évalués */
export function groupShare(cells: CompCell[]): number | null {
  const rated = cells.filter((c) => c.level);
  if (!rated.length) return null;
  return Math.round((rated.filter((c) => c.level === 'A' || c.level === 'PA').length / rated.length) * 100);
}
