import { describe, expect, it } from 'vitest';
import { parseGroup } from '@/lib/domain';
import { planImport, parseCsv, rowsFromGrid } from '@/lib/importStudents';
import { buildOccurrences, freeRooms, roomLoads, unionMinutes } from '@/lib/occupancy';
import { sessionConflicts, slotConflicts } from '@/lib/conflicts';
import type { Room, Session, Slot } from '@/lib/types';

const room = (id: string, extra: Partial<Room> = {}): Room => ({ id, name: id, building: null, kind: 'atelier', seats: 16, shared: false, notes: null, active: true, created_at: '', ...extra });
const slot = (id: string, extra: Partial<Slot> = {}): Slot => ({
  id, room_id: 'A', group_code: '2PB1.1', teacher_id: 't1', teacher_label: null, weekday: 2, start_time: '08:00', end_time: '12:00', label: null,
  tp_id: null, system_id: null, valid_from: '2026-09-01', valid_to: '2027-07-07', created_by: null, created_at: '', ...extra,
});
const session = (id: string, extra: Partial<Session>): Session => ({
  id, slot_id: null, session_date: '2026-11-03', start_time: '08:00', end_time: '10:00', room_id: 'A', group_code: null, tp_id: null, system_id: null,
  teacher_id: null, teacher_label: null, label: 'Réservation', note: null, status: 'planned', created_by: null, created_at: '', ...extra,
});

describe('parseGroup', () => {
  it.each([['2PB1.1', '2PB1.1'], ['2p b1,2', '2PB1.2'], ['1PB2', '1PB2'], ['TPB1.1', 'TPB1.1'], ['Terminale B2', 'TPB2'], ['seconde b1.1', '2PB1.1']])('%s', (raw, code) => {
    expect(parseGroup(raw)?.code).toBe(code);
  });
  it('rejette un groupe inconnu', () => {
    expect(parseGroup('4PB1.1')).toBeNull();
    expect(parseGroup('')).toBeNull();
  });
});

describe('import des élèves', () => {
  it('lit un CSV avec en-têtes', () => {
    const rows = rowsFromGrid(parseCsv('Nom;Prénom;Groupe\nDupont;Léa;2PB1.1\nMartin;Tom;1PB2'), 'x');
    expect(rows).toHaveLength(2);
  });
  it('planifie ajout, déplacement, inchangé, absent, groupe inconnu', () => {
    const rows = [
      { nom: 'Dupont', prenom: 'Léa', groupe: '2PB1.1' },
      { nom: 'Martin', prenom: 'Tom', groupe: '2PB1.2' },
      { nom: 'Durand', prenom: 'Zoé', groupe: '2PB1.1' },
      { nom: 'Autre', prenom: 'Max', groupe: 'XYZ' },
    ];
    const existing = [
      { id: '1', name: 'Léa D.', group_code: '2PB1.1' },
      { id: '2', name: 'Tom M.', group_code: '2PB1.1' },
      { id: '3', name: 'Ancien A.', group_code: '2PB1.1' },
    ];
    const plan = planImport(rows, existing, true);
    expect(plan.same.map((p) => p.name)).toEqual(['Léa D.']);
    expect(plan.move.map((p) => [p.name, p.fromGroup, p.groupCode])).toEqual([['Tom M.', '2PB1.1', '2PB1.2']]);
    expect(plan.add.map((p) => p.name)).toEqual(['Zoé D.']);
    expect(plan.gone.map((g) => g.id)).toEqual(['3']);
    expect(plan.bad).toHaveLength(1);
  });
});

describe('occupation', () => {
  const slots = [slot('s1')];
  it('répète un créneau chaque semaine sur sa période', () => {
    const { occs } = buildOccurrences(slots, [], '2026-11-02', '2026-11-15');
    expect(occs.map((o) => o.date)).toEqual(['2026-11-03', '2026-11-10']);
  });
  it('une annulation retire l’occurrence', () => {
    const { occs, cancelled } = buildOccurrences(slots, [session('x', { slot_id: 's1', session_date: '2026-11-03', status: 'cancelled' })], '2026-11-02', '2026-11-08');
    expect(occs).toHaveLength(0);
    expect(cancelled).toHaveLength(1);
  });
  it('un déplacement remplace l’occurrence', () => {
    const { occs } = buildOccurrences(slots, [session('x', { slot_id: 's1', session_date: '2026-11-03', room_id: 'B', group_code: '2PB1.1' })], '2026-11-02', '2026-11-08');
    expect(occs).toHaveLength(1);
    expect(occs[0].roomId).toBe('B');
    expect(occs[0].moved).toBe(true);
  });
  it('une réservation ponctuelle s’ajoute, une annulée est ignorée', () => {
    const { occs } = buildOccurrences([], [session('a', {}), session('b', { status: 'cancelled' })], '2026-11-02', '2026-11-08');
    expect(occs).toHaveLength(1);
  });
  it('unionMinutes ne compte pas deux fois les chevauchements', () => {
    expect(unionMinutes([[480, 600], [540, 660]])).toBe(180);
  });
  it('taux d’occupation et salles libres', () => {
    const rooms = [room('A'), room('B'), room('S', { shared: true })];
    const { occs } = buildOccurrences(slots, [], '2026-11-03', '2026-11-03');
    const l = roomLoads(rooms, occs, ['2026-11-03']);
    expect(l[0].minutes).toBe(240);
    expect(l[0].rate).toBeCloseTo(0.4);
    expect(freeRooms(rooms, occs, '2026-11-03', 9 * 60, 10 * 60).map((r) => r.id)).toEqual(['B', 'S']);
    expect(freeRooms(rooms, occs, '2026-11-03', 13 * 60, 14 * 60).map((r) => r.id)).toEqual(['A', 'B', 'S']);
  });
});

describe('conflits', () => {
  const rooms = [room('A'), room('S', { shared: true })];
  const slots = [slot('s1')];
  const cand = { roomId: 'A', groupCode: '1PB1.1', teacherId: 't2', weekday: 2, start: 9 * 60, end: 11 * 60, from: '2026-09-01', to: '2027-07-07' };
  it('détecte la salle occupée', () => {
    expect(slotConflicts(cand, slots, [], rooms).join()).toMatch(/salle/i);
  });
  it('détecte groupe et enseignant', () => {
    const r = slotConflicts({ ...cand, roomId: 'S', groupCode: '2PB1.1', teacherId: 't1' }, slots, [], rooms).join();
    expect(r).toMatch(/groupe/i);
    expect(r).toMatch(/enseignant/i);
  });
  it('une salle partagée accepte deux groupes', () => {
    expect(slotConflicts({ ...cand, roomId: 'S' }, [slot('s2', { room_id: 'S' })], [], rooms)).toEqual([]);
  });
  it('pas de conflit sur un autre jour ou un autre horaire', () => {
    expect(slotConflicts({ ...cand, weekday: 3 }, slots, [], rooms)).toEqual([]);
    expect(slotConflicts({ ...cand, start: 12 * 60, end: 13 * 60 }, slots, [], rooms)).toEqual([]);
  });
  it('refuse une fin avant le début', () => {
    expect(slotConflicts({ ...cand, end: cand.start }, slots, [], rooms)).toHaveLength(1);
  });
  it('conflit d’une séance ponctuelle avec l’emploi du temps', () => {
    const r = sessionConflicts({ date: '2026-11-03', start: 9 * 60, end: 10 * 60, roomId: 'A', groupCode: null }, slots, [], rooms);
    expect(r.join()).toMatch(/salle/i);
    expect(sessionConflicts({ date: '2026-11-04', start: 9 * 60, end: 10 * 60, roomId: 'A', groupCode: null }, slots, [], rooms)).toEqual([]);
  });
});
