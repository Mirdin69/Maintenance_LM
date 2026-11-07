const pad = (n: number) => String(n).padStart(2, '0');

/** AAAA-MM-JJ en heure locale */
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseISO = (s: string) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));

export const addDays = (d: Date, n: number) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
};

/** 1 = lundi ... 7 = dimanche */
export const isoDow = (d: Date) => ((d.getDay() + 6) % 7) + 1;

export const mondayOf = (d: Date) => addDays(d, 1 - isoDow(d));

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = parseISO(from); iso(d) <= to; d = addDays(d, 1)) out.push(iso(d));
  return out;
}

/** Année scolaire (année de la rentrée) : septembre à août */
export const schoolYearOf = (d: Date) => (d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1);

export const schoolYearBounds = (y: number) => ({ from: `${y}-09-01`, to: `${y + 1}-07-07` });

export const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const minToHM = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
/** 08:00:00 -> 08:00 */
export const hm = (t: string) => t.slice(0, 5);

export const overlaps = (a1: number, a2: number, b1: number, b2: number) => a1 < b2 && b1 < a2;

export const DAY_LONG = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
export const DAY_SHORT = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

export const fmtDate = (s: string) => {
  const d = parseISO(s);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

export const fmtDayLong = (s: string) =>
  parseISO(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

export const fmtShort = (s: string) => parseISO(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

export const fmtStamp = (t: string | null) =>
  t ? new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';

export const fmtHours = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h} h ${pad(m)}` : `${h} h`;
};
