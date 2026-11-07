import { describe, expect, it } from 'vitest';
import { buildWarnings, copyWeekOps, indexCells, weekNeeds } from '@/lib/semainier';
import { buildRotation } from '@/lib/rotation';
import { competencesOf, groupShare, studentCompetence } from '@/lib/competences';
import { buildBilan } from '@/lib/bilan';
import { undoPlan, entryLabel } from '@/lib/restore';
import { checkImage, newImagePath } from '@/lib/images';
import type { AuditEntry, PlanningCell } from '@/lib/types';

const cell = (day: string, group_code: string, tp_id: string | null, label: string | null = null): PlanningCell => ({ day, group_code, tp_id, label, note: null, updated_by: null, updated_at: '' });

describe('avertissements du semainier', () => {
  const tps = new Map([['a', { system_ids: ['s1'] }], ['b', { system_ids: ['s1', 's2'] }], ['c', { system_ids: [] as string[] }]]);
  const systems = new Map([['s1', { name: 'Banc API', state: 'service' }], ['s2', { name: 'Zelio', state: 'hs' }]]);
  it('signale un système hors service et un système réclamé par deux groupes le même jour', () => {
    const w = buildWarnings([cell('2026-10-05', '2PB1.1', 'a'), cell('2026-10-05', '2PB1.2', 'b'), cell('2026-10-06', '2PB1.1', 'a'), cell('2026-10-06', '2PB1.2', 'c')], tps, systems);
    expect(w.get('2026-10-05|2PB1.1')).toEqual(['« Banc API » aussi prévu pour 2PB1.2']);
    expect(w.get('2026-10-05|2PB1.2')).toEqual(expect.arrayContaining(['« Zelio » est hors service', '« Banc API » aussi prévu pour 2PB1.1']));
    expect(w.has('2026-10-06|2PB1.1')).toBe(false);
  });
});

describe('copie de semaine', () => {
  it('copie lundi-vendredi, respecte les cases remplies et les jours bloqués', () => {
    const cells = indexCells([cell('2026-10-05', 'G', 'a'), cell('2026-10-06', 'G', null, 'Évaluation'), cell('2026-10-12', 'G', 'z'), cell('2026-10-14', 'G', 'a')]);
    const base = { overwrite: false, blocked: (d: string) => d === '2026-10-14' };
    expect(copyWeekOps(cells, ['G'], '2026-10-05', '2026-10-12', base)).toEqual([{ day: '2026-10-13', group: 'G', value: 'lab:Évaluation' }]);
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
