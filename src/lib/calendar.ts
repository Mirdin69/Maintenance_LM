import { addDays, eachDay, iso, isoDow, parseISO } from './dates';
import type { CalendarPeriod } from './types';

/** Dimanche de Pâques (algorithme de Meeus/Jones/Butcher) */
export function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** Jours fériés français de l'année scolaire commençant en `startYear` (septembre à juillet) */
export function frenchHolidays(startYear: number): Array<{ label: string; date: string }> {
  const fixed = (y: number, m: number, d: number) => iso(new Date(y, m - 1, d));
  const y2 = startYear + 1;
  const e = easter(y2);
  return [
    { label: 'Toussaint', date: fixed(startYear, 11, 1) },
    { label: 'Armistice', date: fixed(startYear, 11, 11) },
    { label: 'Noël', date: fixed(startYear, 12, 25) },
    { label: 'Jour de l’an', date: fixed(y2, 1, 1) },
    { label: 'Lundi de Pâques', date: iso(addDays(e, 1)) },
    { label: 'Fête du travail', date: fixed(y2, 5, 1) },
    { label: 'Victoire 1945', date: fixed(y2, 5, 8) },
    { label: 'Ascension', date: iso(addDays(e, 39)) },
    { label: 'Lundi de Pentecôte', date: iso(addDays(e, 50)) },
    { label: 'Fête nationale', date: fixed(y2, 7, 14) },
  ].sort((a, b) => a.date.localeCompare(b.date));
}

/** Période qui couvre un jour (la plus spécifique d'abord : jour férié avant vacances) */
export function periodOn(day: string, periods: CalendarPeriod[]): CalendarPeriod | undefined {
  const hit = periods.filter((p) => p.start_date <= day && day <= p.end_date);
  return hit.find((p) => p.kind === 'ferie') ?? hit[0];
}

/** Numéro de semaine ISO */
export function isoWeek(day: string): number {
  const d = parseISO(day);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7);
}

export interface MonthBlock {
  key: string;
  label: string;
  days: string[];
}

/** Les jours affichés (jours de semaine retenus) de chaque mois entre deux dates */
export function monthBlocks(from: string, to: string, weekdays: number[]): MonthBlock[] {
  const out: MonthBlock[] = [];
  for (const day of eachDay(from, to)) {
    if (!weekdays.includes(isoDow(parseISO(day)))) continue;
    const key = day.slice(0, 7);
    let b = out[out.length - 1];
    if (!b || b.key !== key) {
      b = {
        key,
        label: parseISO(day).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
        days: [],
      };
      out.push(b);
    }
    b.days.push(day);
  }
  return out;
}

export function parseWeekdays(raw: string | undefined, fallback = [1, 2, 3, 4]): number[] {
  const list = (raw ?? '')
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 5);
  return list.length ? [...new Set(list)].sort() : fallback;
}
