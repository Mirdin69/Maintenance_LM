import { eachDay, isoDow, minToHM, parseISO } from './dates';
import { slotConflicts } from './conflicts';
import type { Part, Room, Session, Slot } from './types';

/** Une activité de la demi-journée : TP, TD ou cours, dans une salle, avec un enseignant éventuel */
export interface Activity {
  kind: 'TP' | 'TD' | 'Cours';
  roomId: string;
  teacherId: string | null;
}

export interface PlannedSlot {
  group: string;
  block: number;
  activity: Activity;
  start: number;
  end: number;
  label: string;
  conflicts: string[];
}

export interface HalfdayInput {
  subject: string;
  groups: string[];
  activities: Activity[];
  weekday: number;
  /** Heure de début de la demi-journée, en minutes */
  start: number;
  /** Durée d'une séance, en minutes */
  slotMin: number;
  from: string;
  to: string;
}

/** Quelle activité fait le groupe `gi` pendant la séance `block` : les groupes tournent d'une séance à l'autre */
export const activityIndex = (gi: number, block: number, n: number) => (((gi + block) % n) + n) % n;

/**
 * Carrousel dans la demi-journée : autant de séances que d'activités, chaque groupe passe par toutes les activités.
 * Les conflits (salle, groupe, enseignant) sont contrôlés contre l'existant et entre séances générées.
 */
export function planHalfday(inp: HalfdayInput, slots: Slot[], sessions: Session[], rooms: Room[]): PlannedSlot[] {
  const n = inp.activities.length;
  if (!n || !inp.groups.length) return [];
  const out: PlannedSlot[] = [];
  const virtual: Slot[] = [];
  for (let b = 0; b < n; b++) {
    const start = inp.start + b * inp.slotMin;
    const end = start + inp.slotMin;
    for (const [gi, group] of inp.groups.entries()) {
      const activity = inp.activities[activityIndex(gi, b, n)];
      const conflicts = slotConflicts(
        { roomId: activity.roomId, groupCode: group, teacherId: activity.teacherId, weekday: inp.weekday, start, end, from: inp.from, to: inp.to },
        [...slots, ...virtual], sessions, rooms,
      );
      const label = `${inp.subject.trim()} · ${activity.kind}`;
      out.push({ group, block: b, activity, start, end, label, conflicts });
      if (!conflicts.length)
        virtual.push({
          id: `plan-${b}-${gi}`, room_id: activity.roomId, group_code: group, teacher_id: activity.teacherId, teacher_label: null, weekday: inp.weekday,
          start_time: minToHM(start), end_time: minToHM(end), label, tp_id: null, system_id: null, valid_from: inp.from, valid_to: inp.to, created_by: null, created_at: '',
        } as Slot);
    }
  }
  return out;
}

/** Résumé d'un groupe pour la note du semainier : « TP 08:00 · TD 09:00 · Cours 10:00 » */
export function noteOf(planned: PlannedSlot[], group: string): string {
  return planned
    .filter((p) => p.group === group && !p.conflicts.length)
    .sort((a, b) => a.start - b.start)
    .map((p) => `${p.activity.kind} ${minToHM(p.start)}`)
    .join(' · ')
    .slice(0, 300);
}

/** Dates de la période tombant le jour choisi et ne tombant pas sur une période hors cours */
export function datesFor(from: string, to: string, weekday: number, blocked: (d: string) => boolean): string[] {
  return eachDay(from, to).filter((d) => isoDow(parseISO(d)) === weekday && !blocked(d));
}

export const DEFAULT_START: Record<Exclude<Part, 'J'>, string> = { M: '08:00', A: '13:30' };
