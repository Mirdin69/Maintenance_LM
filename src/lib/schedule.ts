import type { Part } from './types';

/** Trame horaire du lycée, réglable dans Administration > Horaires de TP (réglage `schedule`) */
export interface ScheduleConfig {
  /** Durée d'une séance, en minutes */
  periodMin: number;
  /** Pauses (début, fin), en minutes depuis minuit */
  breaks: Array<[number, number]>;
  /** Pour chaque jour (1 = lundi … 5 = vendredi) : début et fin du matin et de l'après-midi */
  days: Record<number, { M: [number, number]; A: [number, number] }>;
}

const hm = (h: number, m = 0) => h * 60 + m;
export const DEFAULT_SCHEDULE: ScheduleConfig = {
  periodMin: 55,
  breaks: [[hm(9, 35), hm(9, 50)], [hm(15, 55), hm(16, 10)]],
  days: {
    1: { M: [hm(8, 40), hm(11, 40)], A: [hm(13, 10), hm(18)] },
    2: { M: [hm(7, 45), hm(11, 40)], A: [hm(13, 10), hm(18)] },
    3: { M: [hm(7, 45), hm(11, 40)], A: [hm(13, 10), hm(18)] },
    4: { M: [hm(7, 45), hm(11, 40)], A: [hm(13, 10), hm(18)] },
    5: { M: [hm(7, 45), hm(11, 40)], A: [hm(13, 10), hm(18)] },
  },
};

export const toHM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const fromHM = (v: unknown): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? ''));
  if (!m) return null;
  const t = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[1]) < 24 && Number(m[2]) < 60 ? t : null;
};

/** Lit le réglage ; toute valeur absente ou invalide retombe sur la trame par défaut */
export function parseSchedule(raw: string | undefined): ScheduleConfig {
  try {
    const v = JSON.parse(raw || '{}') as { periodMin?: unknown; breaks?: unknown; days?: Record<string, { M?: unknown[]; A?: unknown[] }> };
    const periodMin = Number.isInteger(v.periodMin) && (v.periodMin as number) >= 15 && (v.periodMin as number) <= 240 ? (v.periodMin as number) : DEFAULT_SCHEDULE.periodMin;
    const breaks = Array.isArray(v.breaks)
      ? (v.breaks as unknown[][]).map((b) => [fromHM(b?.[0]), fromHM(b?.[1])] as const).filter((b): b is readonly [number, number] => b[0] !== null && b[1] !== null && b[1] > b[0]).map((b) => [b[0], b[1]] as [number, number]).slice(0, 6)
      : DEFAULT_SCHEDULE.breaks;
    const days: ScheduleConfig['days'] = {};
    for (let d = 1; d <= 5; d++) {
      const pick = (p: 'M' | 'A'): [number, number] => {
        const a = fromHM(v.days?.[d]?.[p]?.[0]);
        const b = fromHM(v.days?.[d]?.[p]?.[1]);
        return a !== null && b !== null && b > a ? [a, b] : DEFAULT_SCHEDULE.days[d][p];
      };
      days[d] = { M: pick('M'), A: pick('A') };
    }
    return { periodMin, breaks, days };
  } catch {
    return DEFAULT_SCHEDULE;
  }
}

export function formatSchedule(c: ScheduleConfig): string {
  return JSON.stringify({
    periodMin: c.periodMin,
    breaks: c.breaks.map(([a, b]) => [toHM(a), toHM(b)]),
    days: Object.fromEntries(Object.entries(c.days).map(([d, h]) => [d, { M: h.M.map(toHM), A: h.A.map(toHM) }])),
  });
}

let current: ScheduleConfig = DEFAULT_SCHEDULE;
/** Enregistre la trame courante (appelée au chargement des réglages) */
export function registerSchedule(c: ScheduleConfig) { current = c; }
export const scheduleConfig = () => current;

export const PERIOD_MIN = 55; // valeur par défaut, conservée pour compatibilité
export const BREAKS = DEFAULT_SCHEDULE.breaks;
export const dayStart = (weekday: number, part: Exclude<Part, 'J'>) => (current.days[weekday] ?? current.days[2])[part][0];
export const dayEnd = (part: Exclude<Part, 'J'>, weekday = 2) => (current.days[weekday] ?? current.days[2])[part][1];

export interface Period { start: number; end: number }

/** Les séances d'une demi-journée selon une trame donnée, en sautant les pauses */
export function periodsIn(cfg: ScheduleConfig, weekday: number, part: Exclude<Part, 'J'>): Period[] {
  const out: Period[] = [];
  const [from, end] = (cfg.days[weekday] ?? cfg.days[2])[part];
  let t = from;
  while (t + cfg.periodMin <= end) {
    const br = cfg.breaks.find(([s, e]) => t >= s && t < e);
    if (br) { t = br[1]; continue; }
    out.push({ start: t, end: t + cfg.periodMin });
    t += cfg.periodMin;
  }
  return out;
}
export const periodsOf = (weekday: number, part: Exclude<Part, 'J'>) => periodsIn(current, weekday, part);

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
