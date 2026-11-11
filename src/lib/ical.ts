import { isoDow, parseISO } from './dates';
import { dayEnd, dayStart } from './schedule';
import { cellRoomIds, isMyCell } from './semainier';
import type { Occ } from './occupancy';
import type { PlanningCell, Profile, Tp } from './types';

export interface IcsEvent {
  uid: string;
  /** AAAA-MM-JJ */
  date: string;
  /** Minutes depuis minuit */
  start: number;
  end: number;
  summary: string;
  location?: string;
  description?: string;
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const hm = (date: string, min: number) => `${date.replace(/-/g, '')}T${String(Math.floor(min / 60)).padStart(2, '0')}${String(min % 60).padStart(2, '0')}00`;
/** Lignes de 75 caractères au plus (RFC 5545), la suite commence par une espace */
const fold = (line: string) => (line.match(/.{1,73}/gu) ?? ['']).map((x, i) => (i ? ' ' : '') + x).join('\r\n');

/** Fichier .ics (heure locale de Paris) à importer dans Google Agenda, Outlook ou le téléphone */
export function buildIcs(events: IcsEvent[], name: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Parc MELEC//Planning//FR', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(name)}`, 'X-WR-TIMEZONE:Europe/Paris'];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@parc-melec`, `DTSTAMP:${stamp}`, `DTSTART;TZID=Europe/Paris:${hm(e.date, e.start)}`, `DTEND;TZID=Europe/Paris:${hm(e.date, e.end)}`, `SUMMARY:${esc(e.summary)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/**
 * Mes cours : cases du semainier où je figure (matin, après-midi ou journée ; une demi-journée à plusieurs cours est partagée),
 * et créneaux de l'emploi du temps ou séances dont je suis l'enseignant.
 */
export function myEvents(args: {
  cells: PlanningCell[];
  tpById: Map<string, Tp>;
  me: Profile;
  from: string;
  to: string;
  roomName: (id: string | null | undefined) => string;
  occs: Occ[];
  tpLabel?: (tp: Tp) => string;
}): IcsEvent[] {
  const { cells, tpById, me, from, to, roomName, occs } = args;
  const out: IcsEvent[] = [];
  const filled = cells.filter((c) => (c.tp_id || c.label) && c.day >= from && c.day <= to);
  const mates = new Map<string, PlanningCell[]>();
  for (const c of filled) {
    const k = `${c.day}|${c.group_code}|${c.part ?? 'J'}`;
    mates.set(k, [...(mates.get(k) ?? []), c].sort((a, b) => (a.seq ?? 1) - (b.seq ?? 1)));
  }
  for (const c of filled) {
    const tp = c.tp_id ? tpById.get(c.tp_id) : undefined;
    if (!isMyCell(c, tp, me)) continue;
    const dow = isoDow(parseISO(c.day));
    if (dow > 5) continue;
    const list = mates.get(`${c.day}|${c.group_code}|${c.part ?? 'J'}`)!;
    const i = list.indexOf(c);
    const part = c.part ?? 'J';
    for (const p of part === 'J' ? (['M', 'A'] as const) : [part]) {
      const a0 = dayStart(dow, p);
      const b0 = dayEnd(p, dow);
      const step = (b0 - a0) / list.length;
      const start = Math.round((a0 + step * i) / 5) * 5;
      const end = i === list.length - 1 ? b0 : Math.round((a0 + step * (i + 1)) / 5) * 5;
      const rooms = cellRoomIds(c, tp).map(roomName).filter(Boolean).join(' + ');
      out.push({
        uid: `cell-${c.day}-${c.group_code}-${part}-${c.seq ?? 1}-${p}`, date: c.day, start, end,
        summary: `${c.group_code} · ${tp ? (tp.code ? `${tp.code} ${tp.title}` : tp.title) : c.label ?? ''}`,
        location: rooms || undefined,
        description: [tp?.objective, tp?.competences.length ? `Compétences : ${tp.competences.join(', ')}` : '', c.note].filter(Boolean).join('\n') || undefined,
      });
    }
  }
  for (const o of occs) {
    if (o.teacherId !== me.id || o.date < from || o.date > to) continue;
    const tp = o.tpId ? tpById.get(o.tpId) : undefined;
    out.push({
      uid: `${o.key}`, date: o.date, start: o.start, end: o.end,
      summary: `${o.groupCode ?? ''}${o.groupCode ? ' · ' : ''}${tp ? tp.code ?? tp.title : o.label ?? 'Cours'}`,
      location: roomName(o.roomId) || undefined, description: tp?.title,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
}
