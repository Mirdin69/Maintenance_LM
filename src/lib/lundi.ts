import { sessionConflicts } from './conflicts';
import { minToHM } from './dates';
import type { Room, Session, Slot } from './types';

/** Ce que fait un groupe pendant une séance : un enseignant, une salle et, au choix, un TP ou une activité (« valeur » du semainier) */
export interface Station { teacherId: string | null; roomId: string | null; value: string }
export type Grid = Array<Array<Station | null>>; // [séance][groupe]

export const emptyStation = (s: Station | null | undefined) => !s || (!s.teacherId && !s.roomId && !s.value);

/**
 * Carrousel : la première séance décide qui commence avec quel groupe, les suivantes en découlent.
 * À la séance b, le groupe g reprend ce que faisait à la première séance le groupe (g − b) modulo n.
 */
export function carouselGrid(first: Array<Station | null>, rows: number): Grid {
  const n = first.length;
  return Array.from({ length: rows }, (_, b) => first.map((_s, g) => (n ? first[(((g - b) % n) + n) % n] : null)));
}

export interface LundiInput {
  date: string;
  groups: string[];
  periods: Array<{ start: number; end: number }>;
  grid: Grid;
}

/** Contrôle toutes les séances prévues contre l'existant (hors séances remplacées) et entre elles ; retourne les messages de conflit */
export function gridConflicts(inp: LundiInput, slots: Slot[], sessions: Session[], rooms: Room[], replacedIds: Set<string>): string[] {
  const kept = sessions.filter((s) => !replacedIds.has(s.id));
  const virtual: Session[] = [];
  const out: string[] = [];
  inp.grid.forEach((row, b) =>
    row.forEach((st, g) => {
      if (emptyStation(st) || !inp.periods[b]) return;
      const { start, end } = inp.periods[b];
      const msgs = sessionConflicts(
        { date: inp.date, start, end, roomId: st!.roomId, groupCode: inp.groups[g], teacherId: st!.teacherId },
        slots, [...kept, ...virtual], rooms,
      );
      out.push(...msgs.map((m) => `${inp.groups[g]} à ${minToHM(start)} : ${m}`));
      virtual.push({
        id: `plan-${b}-${g}`, slot_id: null, session_date: inp.date, start_time: minToHM(start), end_time: minToHM(end), room_id: st!.roomId,
        group_code: inp.groups[g], tp_id: null, system_id: null, teacher_id: st!.teacherId, teacher_label: null, label: null, note: null,
        status: 'planned', created_by: null, created_at: '',
      } as Session);
    }),
  );
  return [...new Set(out)];
}
