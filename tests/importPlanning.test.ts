import { describe, expect, it } from 'vitest';
import { buildCells, domainGuess, findUnknowns, parseDate, parsePlanning, teacherMatch, tpMatch } from '@/lib/importPlanning';
import type { Profile, Room, Tp } from '@/lib/types';

const bounds = { from: '2026-09-01', to: '2027-07-04' };
const prof = (id: string, full_name: string, email: string) => ({ id, full_name, email, role: 'prof', active: true, created_at: '', last_seen: null }) as Profile;
const profiles = [prof('p1', 'Gilles Morel', 'g.morel@lamache.org'), prof('p2', 'Alexandre Verwaerde', 'alex@lamache.org')];
const tps = [{ id: 't1', code: 'P1', title: 'Câblage fiches', level: 'Seconde', domain: 'ind' }] as unknown as Tp[];
const rooms = [{ id: 'r1', name: 'A101' }] as unknown as Room[];
const cat = { tps, profiles, rooms, domains: { ind: 'Industriel', bat: 'Bâtiment' } };

describe('import de planning', () => {
  it('lit les dates', () => {
    expect(parseDate('Mardi 3 novembre', bounds)).toBe('2026-11-03');
    expect(parseDate('5 janvier', bounds)).toBe('2027-01-05');
    expect(parseDate('03/11/2026', bounds)).toBe('2026-11-03');
    expect(parseDate('2026-11-03', bounds)).toBe('2026-11-03');
  });
  it('lit le tableau avec plusieurs enseignants et plusieurs cours', () => {
    const grid = [
      ['Date', 'Groupe', 'Partie', 'TP', 'Enseignant', 'Salle'],
      ['2026-11-03', '2PB1.1', 'Matin', 'P1', 'G. Morel / A. Verwaerde', 'A101'],
      ['2026-11-03', '2PB1.1', 'Matin', 'Remédiation', 'Verwaerde', ''],
      ['2026-11-04', 'xx', '', 'P1', '', ''],
    ];
    const p = parsePlanning(grid, bounds);
    expect(p.layout).toBe('tableau');
    expect(p.rows).toHaveLength(2);
    expect(p.problems).toHaveLength(1);
    const { cells } = buildCells(p.rows, cat, { tps: {}, teachers: {}, rooms: {}, created: {}, createdRooms: {} }, [], false);
    expect(cells.map((c) => [c.seq, c.tp_id, c.label])).toEqual([[1, 't1', null], [2, null, 'Remédiation']]);
    expect(cells[0].teacher_ids).toEqual(['p1', 'p2']);
    expect(cells[0].room_id).toBe('r1');
  });
  it('lit un emploi du temps par groupe', () => {
    const grid = [
      ['Groupe / contenu', 'Lundi\n2 novembre', 'Mardi\n3 novembre'],
      ['2PB1.1\nDomaine', 'Prod Ener (1)', 'VACANCES'],
      ['Enseignant', 'G. MOREL', ''],
      ['TP-Activité', 'Éclairage', ''],
      ['Objectif', 'Câbler', ''],
      ['Compétences', 'C1, C4', ''],
    ];
    const p = parsePlanning(grid, bounds);
    expect(p.layout).toBe('edt');
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0]).toMatchObject({ day: '2026-11-02', group: '2PB1.1', title: 'Éclairage', teachers: ['G. MOREL'], competences: ['C1', 'C4'] });
  });
  it('repère les inconnus et les correspondances', () => {
    const p = parsePlanning([['Date', 'Groupe', 'TP', 'Enseignant', 'Salle', 'Domaine'], ['2026-11-03', '2PB1.1', 'Z9', 'Dupont', 'B7', 'Froid et clim']], bounds);
    const u = findUnknowns(p.rows, cat);
    expect(u.tps).toHaveLength(1);
    expect(u.teachers).toEqual(['Dupont']);
    expect(u.rooms).toEqual(['B7']);
    expect(u.domains).toEqual(['Froid et clim']);
    expect(tpMatch('p1', '', tps)?.id).toBe('t1');
    expect(teacherMatch('Morel', profiles)?.id).toBe('p1');
    expect(domainGuess('Bâtiment (2)', cat.domains)).toBe('bat');
  });
  it('applique les décisions et respecte les cases remplies', () => {
    const p = parsePlanning([['Date', 'Groupe', 'TP', 'Salle'], ['2026-11-03', '2PB1.1', 'Z9', 'B7'], ['2026-11-04', '2PB1.1', 'Y1', '']], bounds);
    const dec = { tps: { z9: { mode: 'create' as const }, y1: { mode: 'skip' as const } }, teachers: {}, rooms: { B7: { mode: 'create' as const } }, created: { z9: 'new1' }, createdRooms: { B7: 'r9' } };
    const r = buildCells(p.rows, cat, dec, [], false);
    expect(r.cells).toHaveLength(1);
    expect(r.cells[0]).toMatchObject({ tp_id: 'new1', room_id: 'r9' });
    expect(r.skipped).toBe(1);
    const again = buildCells(p.rows.slice(0, 1), cat, dec, [{ day: '2026-11-03', group_code: '2PB1.1', part: 'J', seq: 1, tp_id: 't1', label: null }] as never, false);
    expect(again.cells).toHaveLength(0);
  });
  it('lit la feuille SEMAINIER : mois côte à côte, cinq lignes par jour, valeurs 0 ignorées', () => {
    const blank = ['', '', ''];
    const day = (sem: string, j: string, d: string, lines: string[][]) => lines.map((l) => [sem, j, d, ...l, '', '', sem, j, '1', '', '', '']);
    const grid = [
      ['SEPTEMBRE 2026', 'SEPTEMBRE 2026', 'SEPTEMBRE 2026', 'SEPTEMBRE 2026', 'SEPTEMBRE 2026', '', '', 'OCTOBRE 2026', 'OCTOBRE 2026', 'OCTOBRE 2026', 'OCTOBRE 2026', 'OCTOBRE 2026'],
      ['semaine', 'jour', 'date', '2PRO B1.1', '2PRO B1.2', '', '', 'semaine', 'jour', 'date', '2PRO B1.1', '2PRO B1.2'],
      ...[['Prod Ener (1)', 'VACANCES'], ['G. MOREL', ''], ['Éclairage', ''], ['Câbler', ''], ['C1, C4', '']].map(([a, b]) => ['37', 'L', '7', a, b, '', '', '40', 'J', '1', 'Période d’observation', 'Période d’observation']),
      ...['Période d’observation', '0', '0', '0', '0'].map((v) => ['37', 'Ma', '8', v, v, '', '', '40', 'S', '3', '', '']),
    ];
    void blank; void day;
    const p = parsePlanning(grid, bounds);
    expect(p.layout).toBe('semainier');
    const sep = p.rows.filter((r) => r.day === '2026-09-07');
    expect(sep).toHaveLength(1);
    expect(sep[0]).toMatchObject({ group: '2PB1.1', ref: 'Prod Ener (1)', title: 'Éclairage', teachers: ['G. MOREL'], competences: ['C1', 'C4'] });
    const obs = p.rows.filter((r) => r.day === '2026-10-01');
    expect(obs.map((r) => [r.group, r.teachers.length, r.title])).toEqual([['2PB1.1', 0, ''], ['2PB1.2', 0, '']]);
  });
  it('un jour sans date dans l’en-tête reprend celle de la semaine ; le titre fait le TP', () => {
    const grid = [
      ['EMPLOI DU TEMPS - SEMAINE 37 - du 07/09/2026 au 13/09/2026'],
      ['Groupe / contenu', 'Lundi', 'Mardi\n8 septembre'],
      ['2PRO B1.1\nDomaine', 'Prod Ener (1)', 'Prod Ener (1)'],
      ['Enseignant', 'Verwaerde', 'Verwaerde'],
      ['TP / Activité', 'TP A', 'TP B'],
    ];
    const p = parsePlanning(grid, bounds);
    expect(p.rows.map((r) => r.day)).toEqual(['2026-09-07', '2026-09-08']);
    const u = findUnknowns(p.rows, cat);
    expect(u.tps.map((t) => t.title)).toEqual(['TP A', 'TP B']);
  });
});
