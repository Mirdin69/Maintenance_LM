import type { Headcount } from './types';

/** Effectif d'un groupe à une date : initial, plus les arrivées, moins les départs jusqu'à cette date (jour compris) */
export function headcountAt(rows: Headcount[], group: string, date: string): number {
  const mine = rows.filter((r) => r.group_code === group);
  const initial = mine.find((r) => r.kind === 'initial');
  if (!initial) return 0;
  let n = initial.n;
  for (const r of mine) {
    if (r.kind === 'initial' || r.day > date) continue;
    n += r.kind === 'arrivee' ? r.n : -r.n;
  }
  return Math.max(0, n);
}

/** Mouvements d'un groupe, du plus ancien au plus récent, avec l'effectif après chacun */
export function headcountTimeline(rows: Headcount[], group: string): Array<{ row: Headcount; after: number }> {
  const mine = rows.filter((r) => r.group_code === group).sort((a, b) => a.day.localeCompare(b.day) || a.created_at.localeCompare(b.created_at));
  let n = 0;
  return mine.map((row) => {
    n = row.kind === 'initial' ? row.n : n + (row.kind === 'arrivee' ? row.n : -row.n);
    return { row, after: Math.max(0, n) };
  });
}
