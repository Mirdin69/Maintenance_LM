import { DAY_LONG, fmtDate, isoDow, minToHM, overlaps, parseISO, toMin } from './dates';
import { buildOccurrences } from './occupancy';
import type { Room, Session, Slot } from './types';

/**
 * Contrôles côté application, pour prévenir avant l'enregistrement.
 * La base de données applique les mêmes règles et reste l'autorité (triggers SQL).
 */

export interface SlotCandidate {
  id?: string;
  roomId: string;
  groupCode: string;
  teacherId?: string | null;
  teacherLabel?: string | null;
  weekday: number;
  start: number;
  end: number;
  from: string;
  to: string;
}

const sameTeacher = (
  a: { teacherId?: string | null; teacherLabel?: string | null },
  b: { teacherId?: string | null; teacherLabel?: string | null },
) =>
  (a.teacherId && b.teacherId && a.teacherId === b.teacherId) ||
  (!a.teacherId && !!a.teacherLabel && !!b.teacherLabel && a.teacherLabel.toLowerCase() === b.teacherLabel.toLowerCase());

export function slotConflicts(c: SlotCandidate, slots: Slot[], sessions: Session[], rooms: Room[]): string[] {
  const out: string[] = [];
  const room = rooms.find((r) => r.id === c.roomId);
  if (c.end <= c.start) return ['L’heure de fin doit être après l’heure de début.'];
  for (const s of slots) {
    if (s.id === c.id || s.weekday !== c.weekday) continue;
    if (!overlaps(c.start, c.end, toMin(s.start_time), toMin(s.end_time))) continue;
    if (s.valid_from > c.to || c.from > s.valid_to) continue;
    const when = `${DAY_LONG[c.weekday - 1]} de ${minToHM(toMin(s.start_time))} à ${minToHM(toMin(s.end_time))}`;
    if (s.room_id === c.roomId && !room?.shared)
      out.push(`Conflit de salle : ${room?.name ?? 'la salle'} est déjà occupée le ${when} (${s.group_code}).`);
    if (s.group_code === c.groupCode) out.push(`Conflit de groupe : ${c.groupCode} a déjà cours le ${when}.`);
    if (sameTeacher(c, { teacherId: s.teacher_id, teacherLabel: s.teacher_label }))
      out.push(`Conflit d’enseignant : déjà occupé le ${when}.`);
  }
  if (!room?.shared) {
    const x = sessions.find(
      (s) =>
        !s.slot_id &&
        s.status !== 'cancelled' &&
        s.room_id === c.roomId &&
        isoDow(parseISO(s.session_date)) === c.weekday &&
        s.session_date >= c.from &&
        s.session_date <= c.to &&
        overlaps(c.start, c.end, toMin(s.start_time), toMin(s.end_time)),
    );
    if (x)
      out.push(
        `Conflit de salle : ${room?.name ?? 'la salle'} est réservée le ${fmtDate(x.session_date)} de ${minToHM(toMin(x.start_time))} à ${minToHM(toMin(x.end_time))} (${x.group_code ?? x.label ?? 'réservation'}).`,
      );
  }
  return [...new Set(out)];
}

export interface SessionCandidate {
  id?: string;
  slotId?: string | null;
  date: string;
  start: number;
  end: number;
  roomId: string | null;
  groupCode: string | null;
  teacherId?: string | null;
  teacherLabel?: string | null;
}

export function sessionConflicts(c: SessionCandidate, slots: Slot[], sessions: Session[], rooms: Room[]): string[] {
  if (c.end <= c.start) return ['L’heure de fin doit être après l’heure de début.'];
  const out: string[] = [];
  const room = rooms.find((r) => r.id === c.roomId);
  const { occs } = buildOccurrences(
    slots,
    sessions.filter((s) => s.id !== c.id),
    c.date,
    c.date,
  );
  for (const o of occs) {
    if (c.slotId && o.source === 'slot' && o.slotId === c.slotId) continue;
    if (!overlaps(c.start, c.end, o.start, o.end)) continue;
    const when = `${fmtDate(c.date)} de ${minToHM(o.start)} à ${minToHM(o.end)}`;
    if (c.roomId && o.roomId === c.roomId && !room?.shared)
      out.push(`Conflit de salle : ${room?.name ?? 'la salle'} est déjà occupée le ${when} (${o.groupCode ?? o.label ?? 'une réservation'}).`);
    if (c.groupCode && o.groupCode === c.groupCode) out.push(`Conflit de groupe : ${c.groupCode} a déjà cours le ${when}.`);
    if (sameTeacher(c, { teacherId: o.teacherId, teacherLabel: o.teacherLabel }))
      out.push(`Conflit d’enseignant : déjà occupé le ${when}.`);
  }
  return [...new Set(out)];
}
