import { describe, expect, it } from 'vitest';
import { buildWarnings, copyWeekOps, indexCells, weekNeeds } from '@/lib/semainier';
import { buildRotation } from '@/lib/rotation';
import { blocksFrom, periodsOf } from '@/lib/schedule';
import { competencesOf, groupShare, studentCompetence } from '@/lib/competences';
import { buildBilan } from '@/lib/bilan';
import { undoPlan, entryLabel } from '@/lib/restore';
import { checkImage, newImagePath } from '@/lib/images';
import type { AuditEntry, PlanningCell } from '@/lib/types';

const cell = (day: string, group_code: string, tp_id: string | null, label: string | null = null, part: PlanningCell['part'] = 'J'): PlanningCell => ({ day, group_code, part, room_id: null, tp_id, label, note: null, updated_by: null, updated_at: '' });

describe('avertissements du semainier', () => {
  const tps = new Map([['a', { system_ids: ['s1'] }], ['b', { system_ids: ['s1', 's2'] }], ['c', { system_ids: [] as string[] }]]);
  const systems = new Map([['s1', { name: 'Banc API', state: 'service' }], ['s2', { name: 'Zelio', state: 'hs' }]]);
  it('signale un système hors service et un système réclamé par deux groupes le même jour', () => {
    const w = buildWarnings([cell('2026-10-05', '2PB1.1', 'a'), cell('2026-10-05', '2PB1.2', 'b'), cell('2026-10-06', '2PB1.1', 'a'), cell('2026-10-06', '2PB1.2', 'c')], tps, systems);
    expect(w.get('2026-10-05|2PB1.1|J')).toEqual(['« Banc API » aussi prévu pour 2PB1.2']);
    expect(w.get('2026-10-05|2PB1.2|J')).toEqual(expect.arrayContaining(['« Zelio » est hors service', '« Banc API » aussi prévu pour 2PB1.1']));
    expect(w.has('2026-10-06|2PB1.1|J')).toBe(false);
  });
});

describe('copie de semaine', () => {
  it('copie lundi-vendredi, respecte les cases remplies et les jours bloqués', () => {
    const cells = indexCells([cell('2026-10-05', 'G', 'a'), cell('2026-10-06', 'G', null, 'Évaluation'), cell('2026-10-12', 'G', 'z'), cell('2026-10-14', 'G', 'a')]);
    const base = { overwrite: false, blocked: (d: string) => d === '2026-10-14' };
    expect(copyWeekOps(cells, ['G'], '2026-10-05', '2026-10-12', base)).toEqual([{ day: '2026-10-13', group: 'G', part: 'J', room: null, value: 'lab:Évaluation' }]);
    const ow = copyWeekOps(cells, ['G'], '2026-10-05', '2026-10-12', { ...base, overwrite: true });
    expect(ow.map((o) => o.day)).toEqual(['2026-10-12', '2026-10-13']);
  });
});

describe('besoins en matériel', () => {
  it('regroupe par système et outil', () => {
    const tps = new Map([['a', { system_ids: ['s1'], tool_ids: ['t1'], code: 'P1', title: 'x' }]]);
    const n = weekNeeds([cell('2026-10-05', 'G1', 'a'), cell('2026-10-06', 'G2', 'a'), cell('2026-11-02', 'G3', 'a')], ['2026-10-05', '2026-10-06'], tps);
    expect(n.systems.get('s1')!.map((u) => u.group)).toEqual(['G1', 'G2']);
    expect(n.tools.get('t1')).toHaveLength(2);
  });
});

describe('rotation', () => {
  it('répartit à parts égales et fait tourner chaque sous-groupe sur toutes les stations', () => {
    const p = buildRotation(['A', 'B', 'C', 'D', 'E', 'F', 'G'], 3);
    expect(p.subgroups.map((g) => g.length)).toEqual([3, 2, 2]);
    expect(p.rounds).toEqual([[0, 1, 2], [1, 2, 0], [2, 0, 1]]);
    for (let i = 0; i < 3; i++) expect(new Set(p.rounds.map((r) => r[i])).size).toBe(3);
    expect(buildRotation(['A'], 0).rounds).toEqual([]);
  });
});

describe('compétences', () => {
  const tps = [{ id: 't1', competences: ['C1', 'C10'] }, { id: 't2', competences: ['C1'] }];
  it('calcule la moyenne par compétence et la part du groupe', () => {
    expect(competencesOf(tps)).toEqual(['C1', 'C10']);
    const progress = [{ student_id: 's', tp_id: 't1', level: 'A' as const }, { student_id: 's', tp_id: 't2', level: 'PA' as const }, { student_id: 'u', tp_id: 't1', level: 'NA' as const }];
    expect(studentCompetence('s', 'C1', tps, progress)).toEqual({ level: 'A', done: 2, total: 2 });
    expect(studentCompetence('u', 'C1', tps, progress)).toEqual({ level: 'NA', done: 1, total: 2 });
    expect(studentCompetence('x', 'C1', tps, progress)).toEqual({ level: '', done: 0, total: 2 });
    expect(groupShare([studentCompetence('s', 'C1', tps, progress), studentCompetence('u', 'C1', tps, progress), studentCompetence('x', 'C1', tps, progress)])).toBe(50);
    expect(groupShare([])).toBeNull();
  });
});

describe('bilan', () => {
  it('compte heures, usage, pannes et achats sur la période', () => {
    const b = buildBilan({
      planning_cells: [cell('2026-10-05', 'G', 'a'), cell('2026-10-06', 'G', 'a'), cell('2025-01-01', 'G', 'a')],
      tps: [{ id: 'a', code: 'P1', title: 'x', hours: 4, system_ids: ['s'] }] as never,
      systems: [{ id: 's', name: 'Banc' }] as never,
      maintenance: [{ system_id: 's', kind: 'corr', created_at: '2026-10-01T08:00:00Z', closed_at: '2026-10-04T08:00:00Z', status: 'done' }, { system_id: 's', kind: 'prev', created_at: '2026-10-01T08:00:00Z', closed_at: null, status: 'open' }] as never,
      purchases: [{ kind: 'mat', status: 'ord', qty: 2, unit_price: 10, created_at: '2026-10-02T00:00:00Z' }, { kind: 'mat', status: 'req', qty: 1, unit_price: 5, created_at: '2026-10-02T00:00:00Z' }] as never,
      rooms: [{ id: 'r', name: 'A101' }] as never,
      timetable_slots: [{ room_id: 'r', start_time: '08:00:00', end_time: '12:30:00' }] as never,
    }, '2026-09-01', '2027-07-07');
    expect(b.groups).toEqual([{ group: 'G', days: 2, hours: 8, byTp: [{ tp: 'P1', days: 2 }] }]);
    expect(b.systems[0]).toEqual({ name: 'Banc', days: 2, faults: 1, open: 0, downtimeDays: 3 });
    expect(b.totals).toMatchObject({ cells: 2, faults: 1, faultsClosed: 1, spent: 20 });
    expect(b.rooms).toEqual([{ name: 'A101', hoursPerWeek: 4.5 }]);
  });
});

describe('historique : retour en arrière', () => {
  const e = (op: AuditEntry['op'], old_data: AuditEntry['old_data'], new_data: AuditEntry['new_data'], table = 'systems'): AuditEntry => ({ id: 1, at: '', user_id: null, table_name: table, op, row_key: 'k', old_data, new_data });
  it('défait un ajout, une suppression et une modification', () => {
    expect(undoPlan(e('INSERT', null, { id: 'x', name: 'N' }))).toEqual({ kind: 'remove', match: { id: 'x' } });
    expect(undoPlan(e('DELETE', { id: 'x', name: 'N' }, null))).toEqual({ kind: 'insert', row: { id: 'x', name: 'N' } });
    expect(undoPlan(e('UPDATE', { id: 'x', qty: 1 }, { id: 'x', qty: 4 }))).toEqual({ kind: 'update', match: { id: 'x' }, patch: { qty: 1 } });
    expect(undoPlan(e('UPDATE', { day: 'd', group_code: 'g', label: 'a' }, { day: 'd', group_code: 'g', label: 'b' }, 'planning_cells')))
      .toEqual({ kind: 'update', match: { day: 'd', group_code: 'g' }, patch: { label: 'a' } });
    expect(entryLabel(e('INSERT', null, { id: 'x', name: 'Banc' }))).toBe('Banc');
  });
});

describe('images', () => {
  it('accepte les images courantes, refuse le reste', () => {
    expect(checkImage({ name: 'a.png', size: 10, type: 'image/png' })).toBeNull();
    expect(checkImage({ name: 'a.svg', size: 10, type: 'image/svg+xml' })).toMatch(/pas une image/);
    expect(checkImage({ name: 'a.jpg', size: 6 * 1024 * 1024, type: 'image/jpeg' })).toMatch(/5 Mo/);
    expect(newImagePath('Photo é#1.JPG')).toMatch(/^img\/[0-9a-f-]{36}\/Photo e_1\.JPG$/);
  });
});

import { parsePaste, num } from '@/lib/paste';
describe('collage depuis Excel', () => {
  it('ignore l’en-tête, accepte tabulations et point-virgule, lit les nombres français', () => {
    expect(parsePaste('Nom\tRéférence\tPostes\nBanc A\tR1\t4\n\nBanc B\t\t2', ['Nom', 'Référence', 'Postes'])).toEqual([['Banc A', 'R1', '4'], ['Banc B', '', '2']]);
    expect(parsePaste('Banc;R;3', ['Nom'])).toEqual([['Banc', 'R', '3']]);
    expect(num('1 234,5', 0)).toBe(1234.5);
    expect(num('abc', 7)).toBe(7);
    expect(num(undefined, 1)).toBe(1);
  });
});

describe('demi-journées du semainier', () => {
  it('lit et écrit les jours retenus avec matin / après-midi', async () => {
    const { parsePartsByDay, formatPartsByDay, parseWeekdays } = await import('@/lib/calendar');
    expect(parseWeekdays('1,2M,3A,4MA')).toEqual([1, 2, 3, 4]);
    expect(parsePartsByDay('1,2M,3A,4MA')).toEqual({ 1: ['J'], 2: ['M'], 3: ['A'], 4: ['M', 'A'] });
    expect(formatPartsByDay([1, 2, 3, 4], { 2: ['M'], 3: ['A'], 4: ['M', 'A'] })).toBe('1,2M,3A,4MA');
  });
  it('une case du matin et une de l’après-midi coexistent le même jour', () => {
    const cells = indexCells([cell('2026-10-05', 'G', 'a', null, 'M'), cell('2026-10-05', 'G', null, 'REM', 'A')]);
    expect(cells.size).toBe(2);
    expect(cells.get('2026-10-05|G|M')?.tp_id).toBe('a');
  });
  it('compte une demi-journée pour 0,5 jour', async () => {
    const { hoursOf } = await import('@/lib/semainier');
    const tp = { id: 'a', code: 'X', title: 'X' } as never;
    expect([...hoursOf([tp], [cell('2026-10-05', 'G', 'a', null, 'M'), cell('2026-10-05', 'H', 'a'), cell('2026-10-06', 'G', 'a', null, 'A')]).values()][0].days).toBe(2);
  });
  it('la copie de semaine garde la partie de journée et la salle', () => {
    const c = { ...cell('2026-10-05', 'G', 'a', null, 'A'), room_id: 'r1' };
    const ops = copyWeekOps(indexCells([c]), ['G'], '2026-10-05', '2026-10-12', { overwrite: false, blocked: () => false });
    expect(ops).toEqual([{ day: '2026-10-12', group: 'G', part: 'A', room: 'r1', value: 'tp:a' }]);
  });
  it('deux avertissements de système ne se mélangent pas entre matin et après-midi', () => {
    const tps = new Map([['a', { system_ids: ['s1'] }], ['b', { system_ids: ['s1'] }]]);
    const w = buildWarnings([cell('2026-10-05', 'G1', 'a', null, 'M'), cell('2026-10-05', 'G2', 'b', null, 'A')], tps, new Map([['s1', { name: 'Banc', state: 'service' }]]));
    expect(w.size).toBe(0);
  });
});

describe('générateur de demi-journée en carrousel', () => {
  const room = (id: string, shared = false) => ({ id, name: id, shared, active: true }) as never;
  const rooms = [room('A'), room('B'), room('C')];
  const acts = [{ kind: 'TP' as const, roomId: 'A', teacherId: null }, { kind: 'TD' as const, roomId: 'B', teacherId: null }, { kind: 'Cours' as const, roomId: 'C', teacherId: null }];
  const inp = { subject: 'REM', groups: ['2PB1.1', '2PB1.2', '2PB2'], activities: acts, weekday: 1, blocks: blocksFrom(periodsOf(1, 'A'), 0, 3), from: '2026-09-01', to: '2027-06-30' };

  it('fait tourner chaque groupe sur toutes les activités, sans jamais deux groupes dans la même salle', async () => {
    const { planHalfday } = await import('@/lib/halfday');
    const p = planHalfday(inp, [], [], rooms);
    expect(p).toHaveLength(9);
    expect(p.every((x) => !x.conflicts.length)).toBe(true);
    const of = (g: string) => p.filter((x) => x.group === g).sort((a, b) => a.start - b.start).map((x) => x.activity.kind);
    expect(of('2PB1.1')).toEqual(['TP', 'TD', 'Cours']);
    expect(of('2PB1.2')).toEqual(['TD', 'Cours', 'TP']);
    expect(of('2PB2')).toEqual(['Cours', 'TP', 'TD']);
    expect(p[0].start).toBe(13 * 60 + 10);
    expect(p[p.length - 1].end).toBe(15 * 60 + 55);
    expect(p[0].label).toBe('REM · TP');
  });
  it('signale un créneau en conflit avec l’emploi du temps existant et ne le compte pas', async () => {
    const { planHalfday, noteOf } = await import('@/lib/halfday');
    const existing = [{ id: 'x', room_id: 'B', group_code: 'AUTRE', teacher_id: null, teacher_label: null, weekday: 1, start_time: '13:10', end_time: '14:05', label: null, tp_id: null, system_id: null, valid_from: '2026-09-01', valid_to: '2027-06-30', created_by: null, created_at: '' }] as never;
    const p = planHalfday(inp, existing, [], rooms);
    const bad = p.filter((x) => x.conflicts.length);
    expect(bad).toHaveLength(1);
    expect(bad[0].group).toBe('2PB1.2');
    expect(bad[0].conflicts[0]).toMatch(/Conflit de salle/);
    expect(noteOf(p, '2PB1.1')).toBe('TP 13:10 · TD 14:05 · Cours 15:00');
  });
  it('détecte deux groupes envoyés dans la même salle quand il y a plus de groupes que d’activités', async () => {
    const { planHalfday } = await import('@/lib/halfday');
    const p = planHalfday({ ...inp, groups: ['a', 'b', 'c', 'd'] }, [], [], rooms);
    expect(p.filter((x) => x.conflicts.length).length).toBeGreaterThan(0);
  });
  it('liste les dates du jour choisi en évitant les vacances', async () => {
    const { datesFor } = await import('@/lib/halfday');
    expect(datesFor('2026-10-05', '2026-10-26', 1, (d) => d === '2026-10-19')).toEqual(['2026-10-05', '2026-10-12', '2026-10-26']);
  });
});

describe('trame horaire du lycée (séances de 55 min)', () => {
  const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const starts = (w: number, p: 'M' | 'A') => periodsOf(w, p).map((x) => hm(x.start));
  it('lundi la matinée commence à 8h40, du mardi au vendredi à 7h45, pause 9h35-9h50, fin 11h40', () => {
    expect(starts(1, 'M')).toEqual(['08:40', '09:50', '10:45']);
    expect(starts(2, 'M')).toEqual(['07:45', '08:40', '09:50', '10:45']);
    expect(hm(periodsOf(3, 'M').at(-1)!.end)).toBe('11:40');
  });
  it('l’après-midi : 13h10 à 18h avec la pause de 15h55 à 16h10 (14h05 est la 2e séance)', () => {
    expect(starts(1, 'A')).toEqual(['13:10', '14:05', '15:00', '16:10', '17:05']);
    expect(hm(periodsOf(1, 'A').at(-1)!.end)).toBe('18:00');
  });
  it('3 séances de 1 h à partir de 14h05 se terminent à 16h55 en sautant la pause', () => {
    const b = blocksFrom(periodsOf(2, 'A'), 1, 3);
    expect(b.map((x) => `${hm(x.start)}-${hm(x.end)}`)).toEqual(['14:05-15:00', '15:00-15:55', '16:10-17:05']);
  });
  it('refuse de déborder de la demi-journée', () => {
    expect(blocksFrom(periodsOf(1, 'M'), 1, 3)).toHaveLength(2);
  });
});
