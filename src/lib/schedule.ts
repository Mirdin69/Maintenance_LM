import type { Part } from './types';

/** Trame horaire du lycée : séances de 55 min, pauses de 9h35 à 9h50 et de 15h55 à 16h10 */
export const PERIOD_MIN = 55;
export const BREAKS: ReadonlyArray<[number, number]> = [[9 * 60 + 35, 9 * 60 + 50], [15 * 60 + 55, 16 * 60 + 10]];
const hm = (h: number, m = 0) => h * 60 + m;
/** Début de la matinée : lundi 8h40, mardi à vendredi 7h45 ; fin à 11h40. Après-midi : 13h10 (ou 14h05) à 18h. */
export const dayStart = (weekday: number, part: Exclude<Part, 'J'>) => (part === 'A' ? hm(13, 10) : weekday === 1 ? hm(8, 40) : hm(7, 45));
export const dayEnd = (part: Exclude<Part, 'J'>) => (part === 'A' ? hm(18) : hm(11, 40));

export interface Period { start: number; end: number }

/** Les séances de 55 min d'une demi-journée, en sautant les pauses */
export function periodsOf(weekday: number, part: Exclude<Part, 'J'>): Period[] {
  const out: Period[] = [];
  let t = dayStart(weekday, part);
  while (t + PERIOD_MIN <= dayEnd(part)) {
    const br = BREAKS.find(([s, e]) => t >= s && t < e);
    if (br) { t = br[1]; continue; }
    out.push({ start: t, end: t + PERIOD_MIN });
    t += PERIOD_MIN;
    const after = BREAKS.find(([s]) => s === t);
    if (after) t = after[1];
  }
  return out;
}

/** `count` blocs de `size` séances consécutives à partir de la séance `first` (un bloc de 2 séances à cheval sur une pause l'englobe) */
export function blocksFrom(periods: Period[], first: number, count: number, size = 1): Period[] {
  const out: Period[] = [];
  for (let b = 0; b < count; b++) {
    const a = periods[first + b * size];
    const z = periods[first + b * size + size - 1];
    if (!a || !z) break;
    out.push({ start: a.start, end: z.end });
  }
  return out;
}
