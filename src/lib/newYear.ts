import { addDays, fmtDate, iso, isoDow, mondayOf, parseISO } from './dates';
import { cellKey } from './semainier';
import type { CalendarPeriod, Part, PlanningCell } from './types';

/* ───────── Vacances de la zone A (données ouvertes du ministère) ───────── */

export const ZONE_A_URL = (year: number) =>
  'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records?' +
  new URLSearchParams({
    where: `zones="Zone A" and annee_scolaire="${year}-${year + 1}"`,
    select: 'description,start_date,end_date,zones,annee_scolaire,population',
    limit: '100',
  }).toString();

export type NewPeriod = { kind: 'vacances'; label: string; start_date: string; end_date: string };

/** Date locale (Paris) d'un horodatage ISO : « 2026-10-16T22:00:00+00:00 » → 2026-10-17 */
export function parisDay(stamp: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(stamp)) return stamp;
  return new Date(stamp).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
}

interface ZoneRecord { description?: string; start_date?: string; end_date?: string; population?: string | null; zones?: string }

/** Transforme les enregistrements de l'API en périodes de vacances. Le ministère donne le jour de reprise (un lundi) comme fin : on retient la veille. */
export function parseZoneA(records: ZoneRecord[]): NewPeriod[] {
  const seen = new Set<string>();
  const out: NewPeriod[] = [];
  for (const r of records) {
    if (!r.description || !r.start_date || !r.end_date) continue;
    if (!/vacances|pont/i.test(r.description) || /enseignants/i.test(r.population ?? '')) continue;
    if (r.zones && !/zone a/i.test(r.zones)) continue;
    const start = parisDay(r.start_date);
    let end = parisDay(r.end_date);
    if (isoDow(parseISO(end)) === 1) end = iso(addDays(parseISO(end), -1));
    if (end < start) end = start;
    const key = `${r.description}|${start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: 'vacances', label: r.description.trim().slice(0, 60), start_date: start, end_date: end });
  }
  return out.sort((a, b) => a.start_date.localeCompare(b.start_date));
}

/** Récupère les vacances de la zone A pour l'année scolaire commençant en `year` */
export async function fetchZoneA(year: number, fetcher: typeof fetch = fetch): Promise<NewPeriod[]> {
  let res: Response;
  try {
    res = await fetcher(ZONE_A_URL(year), { signal: AbortSignal.timeout(15000) });
  } catch {
    throw new Error('Impossible de joindre le site du ministère (data.education.gouv.fr). Réessayez plus tard ou saisissez les vacances à la main.');
  }
  if (!res.ok) throw new Error(`Le site du ministère a répondu une erreur (${res.status}). Saisissez les vacances à la main.`);
  const json = (await res.json()) as { results?: ZoneRecord[] };
  const list = parseZoneA(json.results ?? []);
  if (!list.length) throw new Error(`Aucune vacance publiée pour ${year}-${year + 1} (zone A). Le calendrier n'est peut-être pas encore publié.`);
  return list;
}

/** Retire les périodes déjà présentes (mêmes dates) */
export const onlyNewPeriods = (found: NewPeriod[], existing: CalendarPeriod[]) =>
  found.filter((f) => !existing.some((p) => p.kind === 'vacances' && p.start_date === f.start_date && p.end_date === f.end_date));

/* ───────── Préparation d'une nouvelle année à partir de la précédente ───────── */

export interface CellCopy { day: string; group: string; value: string; part?: Part; room?: string | null }
export interface HolidayDiff { label: string; before: string; after: string; status: 'identique' | 'decale' | 'nouveau' | 'absent' }

export interface YearPlan {
  /** Cases à écrire dans la nouvelle année */
  ops: CellCopy[];
  /** Cases ignorées : la nouvelle année tombe ce jour-là sur des vacances ou un jour férié */
  blocked: Array<{ day: string; group: string; part?: Part; value: string; why: string }>;
  /** Cases ignorées : la cible est déjà remplie */
  kept: number;
  /** Vacances de l'ancienne et de la nouvelle année, comparées par rapport à la rentrée (semaine n°) */
  diffs: HolidayDiff[];
  /** La nouvelle année n'a aucune vacance enregistrée */
  noNewHolidays: boolean;
  offsetDays: number;
}

const weekIndex = (day: string, monday: string) => Math.round((parseISO(day).getTime() - parseISO(monday).getTime()) / (7 * 86400000));
const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ').replace(/\b(de|la|du|des|les|d|l)\b/g, '').replace(/\s+/g, ' ').trim();
const inRange = (d: string, a: string, b: string) => d >= a && d <= b;
const range = (p: { start_date: string; end_date: string }) => `${fmtDate(p.start_date)} → ${fmtDate(p.end_date)}`;

/**
 * Prépare le semainier de la nouvelle année : chaque case de l'ancienne année est reportée au même jour de la même semaine
 * (depuis la rentrée), sauf sur les vacances et jours fériés de la nouvelle année. Compare aussi les vacances des deux années.
 */
export function planNewYear(args: {
  cells: PlanningCell[];
  periods: CalendarPeriod[];
  prev: { from: string; to: string };
  next: { from: string; to: string };
  includeLabels: boolean;
  overwrite?: boolean;
}): YearPlan {
  const { cells, periods, prev, next, includeLabels } = args;
  const pm = iso(mondayOf(parseISO(prev.from)));
  const nm = iso(mondayOf(parseISO(next.from)));
  const offsetDays = Math.round((parseISO(nm).getTime() - parseISO(pm).getTime()) / 86400000);
  const target = new Map(cells.map((c) => [cellKey(c.day, c.group_code, c.part ?? 'J'), c]));
  const blockedBy = (d: string) => periods.find((p) => inRange(d, p.start_date, p.end_date));

  const ops: CellCopy[] = [];
  const blocked: YearPlan['blocked'] = [];
  let kept = 0;
  for (const c of cells) {
    if (!inRange(c.day, prev.from, prev.to)) continue;
    const value = c.tp_id ? `tp:${c.tp_id}` : includeLabels && c.label ? `lab:${c.label}` : '';
    if (!value) continue;
    const day = iso(addDays(parseISO(c.day), offsetDays));
    if (!inRange(day, next.from, next.to)) continue;
    const p = blockedBy(day);
    if (p) { blocked.push({ day, group: c.group_code, part: c.part ?? 'J', value, why: p.label }); continue; }
    const ex = target.get(cellKey(day, c.group_code, c.part ?? 'J'));
    if (ex && (ex.tp_id || ex.label) && !args.overwrite) { kept++; continue; }
    ops.push({ day, group: c.group_code, part: c.part ?? 'J', value, room: c.room_id ?? null });
  }

  const vac = periods.filter((p) => p.kind === 'vacances');
  const before = vac.filter((p) => p.end_date >= prev.from && p.start_date <= prev.to);
  const after = vac.filter((p) => p.end_date >= next.from && p.start_date <= next.to);
  const diffs: HolidayDiff[] = [];
  const used = new Set<string>();
  for (const a of after) {
    const b = before.find((x) => !used.has(x.id) && norm(x.label) === norm(a.label));
    if (!b) { diffs.push({ label: a.label, before: '—', after: range(a), status: 'nouveau' }); continue; }
    used.add(b.id);
    const same = weekIndex(a.start_date, nm) === weekIndex(b.start_date, pm) && weekIndex(a.end_date, nm) === weekIndex(b.end_date, pm);
    diffs.push({ label: a.label, before: range(b), after: range(a), status: same ? 'identique' : 'decale' });
  }
  for (const b of before) if (!used.has(b.id)) diffs.push({ label: b.label, before: range(b), after: '—', status: 'absent' });

  return { ops, blocked, kept, diffs, noNewHolidays: after.length === 0, offsetDays };
}
