import { DAY_END, DAY_START } from './domain';
import { eachDay, isoDow, parseISO, toMin } from './dates';
import { dayEnd, dayStart } from './schedule';
import type { PlanningCell, Room, Session, Slot, Tp } from './types';

/** Une occupation effective un jour donné (emploi du temps ou séance datée) */
export interface Occ {
  key: string;
  source: 'slot' | 'session' | 'semainier';
  slotId: string | null;
  sessionId: string | null;
  date: string;
  start: number;
  end: number;
  roomId: string | null;
  groupCode: string | null;
  teacherId: string | null;
  teacherLabel: string | null;
  label: string | null;
  tpId: string | null;
  systemId: string | null;
  status: 'planned' | 'done';
  /** Occurrence de l'emploi du temps déplacée (autre salle ou autre horaire) */
  moved: boolean;
}

export interface Occurrences {
  occs: Occ[];
  /** Occurrences de l'emploi du temps annulées ce jour-là */
  cancelled: Occ[];
}

function fromSlot(s: Slot, date: string): Occ {
  return {
    key: `slot:${s.id}:${date}`,
    source: 'slot',
    slotId: s.id,
    sessionId: null,
    date,
    start: toMin(s.start_time),
    end: toMin(s.end_time),
    roomId: s.room_id,
    groupCode: s.group_code,
    teacherId: s.teacher_id,
    teacherLabel: s.teacher_label,
    label: s.label,
    tpId: s.tp_id,
    systemId: s.system_id,
    status: 'planned',
    moved: false,
  };
}

function fromSession(x: Session, slot?: Slot): Occ {
  const start = toMin(x.start_time);
  const end = toMin(x.end_time);
  return {
    key: `session:${x.id}`,
    source: 'session',
    slotId: x.slot_id,
    sessionId: x.id,
    date: x.session_date,
    start,
    end,
    roomId: x.room_id,
    groupCode: x.group_code,
    teacherId: x.teacher_id,
    teacherLabel: x.teacher_label,
    label: x.label,
    tpId: x.tp_id,
    systemId: x.system_id,
    status: x.status === 'done' ? 'done' : 'planned',
    moved: slot
      ? slot.room_id !== x.room_id || toMin(slot.start_time) !== start || toMin(slot.end_time) !== end
      : false,
  };
}

/**
 * Occupations effectives entre deux dates (incluses) : chaque ligne de l'emploi du temps
 * se répète chaque semaine sur sa période de validité, une séance liée remplace
 * l'occurrence du jour (déplacement ou annulation), et les séances ponctuelles s'ajoutent.
 * Même règle que la fonction SQL `room_occupancy`.
 */
export function buildOccurrences(slots: Slot[], sessions: Session[], from: string, to: string): Occurrences {
  const occs: Occ[] = [];
  const cancelled: Occ[] = [];
  const bySlotDate = new Map<string, Session>();
  for (const s of sessions) if (s.slot_id) bySlotDate.set(`${s.slot_id}|${s.session_date}`, s);
  const used = new Set<string>();

  for (const day of eachDay(from, to)) {
    const dow = isoDow(parseISO(day));
    for (const slot of slots) {
      if (slot.weekday !== dow || day < slot.valid_from || day > slot.valid_to) continue;
      const ov = bySlotDate.get(`${slot.id}|${day}`);
      if (ov) {
        used.add(ov.id);
        if (ov.status === 'cancelled') cancelled.push(fromSession(ov, slot));
        else occs.push(fromSession(ov, slot));
      } else {
        occs.push(fromSlot(slot, day));
      }
    }
  }
  for (const s of sessions) {
    if (used.has(s.id) || s.status === 'cancelled') continue;
    if (s.session_date < from || s.session_date > to) continue;
    occs.push(fromSession(s));
  }
  occs.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start || a.end - b.end);
  return { occs, cancelled };
}

/**
 * Occupations déduites du semainier de l'année : une case avec salle occupe cette salle sur sa demi-journée
 * (matin, après-midi, ou les deux pour une journée entière). Une case n'est comptée que si le même groupe n'a pas déjà
 * une occupation détaillée (emploi du temps ou séance datée) sur ces horaires : le détail l'emporte, sans double compte.
 */
export function semainierOccurrences(
  cells: PlanningCell[], tpById: Map<string, Pick<Tp, 'teacher_id' | 'teacher_label'>>, existing: Occ[], from: string, to: string,
): Occ[] {
  const out: Occ[] = [];
  // Plusieurs cours dans une demi-journée : elle est partagée à parts égales, dans l'ordre des rangs
  const filled = cells.filter((c) => c.tp_id || c.label);
  const rank = new Map<string, PlanningCell[]>();
  for (const c of filled) {
    const k = `${c.day}|${c.group_code}|${c.part}`;
    rank.set(k, [...(rank.get(k) ?? []), c].sort((x, y) => (x.seq ?? 1) - (y.seq ?? 1)));
  }
  for (const c of filled) {
    const rooms = [c.room_id, ...(c.extra_room_ids ?? [])].filter((x): x is string => !!x);
    if (!rooms.length || c.day < from || c.day > to) continue;
    const dow = isoDow(parseISO(c.day));
    if (dow > 5) continue;
    const mates = rank.get(`${c.day}|${c.group_code}|${c.part}`)!;
    const i = mates.indexOf(c);
    const spans: Array<['M' | 'A', number, number]> = [];
    if (c.part !== 'A') spans.push(['M', dayStart(dow, 'M'), dayEnd('M', dow)]);
    if (c.part !== 'M') spans.push(['A', dayStart(dow, 'A'), dayEnd('A', dow)]);
    for (const [p, a0, b0] of spans) {
      const step = (b0 - a0) / mates.length;
      const start = Math.round((a0 + step * i) / 5) * 5;
      const end = i === mates.length - 1 ? b0 : Math.round((a0 + step * (i + 1)) / 5) * 5;
      const detailed = existing.some((o) => o.date === c.day && o.groupCode === c.group_code && o.start < end && start < o.end);
      if (detailed) continue;
      const tp = c.tp_id ? tpById.get(c.tp_id) : undefined;
      for (const roomId of rooms) {
        out.push({
          key: `cell:${c.day}|${c.group_code}|${c.part}|${c.seq ?? 1}|${p}${roomId === c.room_id ? '' : `|${roomId}`}`, source: 'semainier', slotId: null, sessionId: null, date: c.day, start, end, roomId,
          groupCode: c.group_code, teacherId: tp?.teacher_id ?? null, teacherLabel: tp?.teacher_label ?? null, label: c.label, tpId: c.tp_id, systemId: null,
          status: 'planned', moved: false,
        });
      }
    }
  }
  return out;
}

/** Durée totale couverte par des intervalles, sans compter deux fois les chevauchements */
export function unionMinutes(intervals: Array<[number, number]>, clipFrom = -Infinity, clipTo = Infinity): number {
  const list = intervals
    .map(([a, b]) => [Math.max(a, clipFrom), Math.min(b, clipTo)] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let curEnd = -Infinity;
  for (const [a, b] of list) {
    if (a > curEnd) {
      total += b - a;
      curEnd = b;
    } else if (b > curEnd) {
      total += b - curEnd;
      curEnd = b;
    }
  }
  return total;
}

export interface RoomLoad {
  roomId: string;
  /** minutes occupées par jour (clé = date) */
  byDay: Record<string, number>;
  minutes: number;
  openMinutes: number;
  rate: number;
}

/** Taux d'occupation de chaque salle sur une liste de jours ouvrés */
export function roomLoads(rooms: Room[], occs: Occ[], days: string[]): RoomLoad[] {
  return rooms.map((r) => {
    const byDay: Record<string, number> = {};
    let minutes = 0;
    for (const d of days) {
      const m = unionMinutes(
        occs.filter((o) => o.roomId === r.id && o.date === d).map((o) => [o.start, o.end] as [number, number]),
        DAY_START,
        DAY_END,
      );
      byDay[d] = m;
      minutes += m;
    }
    const openMinutes = days.length * (DAY_END - DAY_START);
    return { roomId: r.id, byDay, minutes, openMinutes, rate: openMinutes ? minutes / openMinutes : 0 };
  });
}

/** Salles actives sans occupation sur le créneau demandé (les salles partagées restent proposées) */
export function freeRooms(rooms: Room[], occs: Occ[], date: string, start: number, end: number, minSeats = 0): Room[] {
  return rooms.filter((r) => {
    if (!r.active) return false;
    if (minSeats && (r.seats ?? 0) < minSeats) return false;
    if (r.shared) return true;
    return !occs.some((o) => o.date === date && o.roomId === r.id && o.start < end && start < o.end);
  });
}

/** Nombre d'occupations qui utilisent déjà ce système sur le créneau */
export function systemUsage(occs: Occ[], systemId: string, date: string, start: number, end: number, ignoreKey?: string) {
  return occs.filter(
    (o) => o.systemId === systemId && o.date === date && o.start < end && start < o.end && o.key !== ignoreKey,
  );
}
