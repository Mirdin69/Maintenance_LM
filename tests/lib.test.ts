import { describe, expect, it } from 'vitest';
import { parseGroup } from '@/lib/domain';
import { iso, isoDow, parseISO } from '@/lib/dates';
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

import { easter, frenchHolidays, isoWeek, monthBlocks, parseWeekdays, periodOn } from '@/lib/calendar';
import { driveId, imageSrc, isDriveFolder } from '@/lib/images';
import { cellPatch, cellValue, isMine } from '@/lib/semainier';

describe('calendrier', () => {
  it('Pâques et jours fériés 2026-2027 identiques à ceux du fichier Excel', () => {
    expect(iso(easter(2027))).toBe('2027-03-28');
    const h = Object.fromEntries(frenchHolidays(2026).map((x) => [x.label, x.date]));
    expect(h['Lundi de Pâques']).toBe('2027-03-29');
    expect(h['Ascension']).toBe('2027-05-06');
    expect(h['Lundi de Pentecôte']).toBe('2027-05-17');
    expect(h['Armistice']).toBe('2026-11-11');
    expect(h['Fête nationale']).toBe('2027-07-14');
    expect(frenchHolidays(2026)).toHaveLength(10);
  });
  it('numéro de semaine ISO', () => {
    expect(isoWeek('2026-09-01')).toBe(36);
    expect(isoWeek('2026-11-02')).toBe(45);
  });
  it('découpe en mois, lundi à jeudi par défaut', () => {
    const m = monthBlocks('2026-09-01', '2026-10-31', parseWeekdays(undefined));
    expect(m.map((x) => x.key)).toEqual(['2026-09', '2026-10']);
    expect(m[0].days[0]).toBe('2026-09-01');
    expect(m.flatMap((x) => x.days).every((d) => isoDow(parseISO(d)) <= 4)).toBe(true);
    expect(parseWeekdays('1,2,9,x')).toEqual([1, 2]);
    expect(parseWeekdays('')).toEqual([1, 2, 3, 4]);
  });
  it('un jour férié l’emporte sur les vacances', () => {
    const p = [
      { id: 'a', kind: 'vacances' as const, label: 'Toussaint', start_date: '2026-10-17', end_date: '2026-11-01' },
      { id: 'b', kind: 'ferie' as const, label: 'Toussaint (férié)', start_date: '2026-11-01', end_date: '2026-11-01' },
    ];
    expect(periodOn('2026-11-01', p)?.label).toBe('Toussaint (férié)');
    expect(periodOn('2026-10-20', p)?.label).toBe('Toussaint');
    expect(periodOn('2026-11-02', p)).toBeUndefined();
  });
});

describe('images Drive', () => {
  const id = '1AbCdEfGhIjKlMnOpQrSt';
  it.each([
    `https://drive.google.com/file/d/${id}/view?usp=sharing`,
    `https://drive.google.com/open?id=${id}`,
    `https://drive.google.com/uc?export=view&id=${id}`,
    `https://lh3.googleusercontent.com/d/${id}`,
  ])('convertit %s', (u) => {
    expect(driveId(u)).toBe(id);
    expect(imageSrc(u, 300)).toBe(`https://drive.google.com/thumbnail?id=${id}&sz=w300`);
  });
  it('laisse une autre adresse web, refuse le reste', () => {
    expect(imageSrc('https://exemple.fr/logo.png')).toBe('https://exemple.fr/logo.png');
    expect(imageSrc('javascript:alert(1)')).toBeNull();
    expect(imageSrc('data:text/html,x')).toBeNull();
    expect(imageSrc('')).toBeNull();
    expect(isDriveFolder('https://drive.google.com/drive/folders/abc')).toBe(true);
  });
});

describe('semainier', () => {
  const me = { id: 'u1', email: 'alex.verwaerde@lamache.org', full_name: null } as never;
  it('retrouve mes cours par compte ou par nom', () => {
    expect(isMine({ teacher_id: 'u1', teacher_label: null }, me)).toBe(true);
    expect(isMine({ teacher_id: 'u2', teacher_label: 'Verwaerde' }, me)).toBe(false);
    expect(isMine({ teacher_id: null, teacher_label: 'Verwaerde' }, me)).toBe(true);
    expect(isMine({ teacher_id: null, teacher_label: 'Sadky' }, me)).toBe(false);
    expect(isMine({ teacher_id: null, teacher_label: 'ab' }, me)).toBe(false);
    expect(isMine(undefined, me)).toBe(false);
  });
  it('encode et décode la valeur d’une case', () => {
    expect(cellPatch('tp:abc')).toEqual({ tp_id: 'abc', label: null });
    expect(cellPatch('lab:PFMP')).toEqual({ tp_id: null, label: 'PFMP' });
    expect(cellPatch('')).toEqual({ tp_id: null, label: null });
    expect(cellValue(undefined)).toBe('');
  });
});

import { cleanDocs, docKind, embedUrl, safeFileName, newStoragePath, checkFile, orphanPaths, hasPreview, MAX_FILE_BYTES } from '@/lib/docs';

describe('documents joints', () => {
  const id = '1AbCdEfGhIjKlMnOpQrSt';
  it('reconnaît Word, PDF, Excel', () => {
    expect(docKind({ title: 'Sujet.docx', url: `https://drive.google.com/file/d/${id}/view` })).toBe('word');
    expect(docKind({ title: 'Cours.PDF', url: 'https://x.fr/a' })).toBe('pdf');
    expect(docKind({ title: 'Suivi', url: 'https://x.fr/f.xlsx?dl=1' })).toBe('excel');
    expect(docKind({ title: 'Doc', url: `https://docs.google.com/spreadsheets/d/${id}/edit` })).toBe('excel');
    expect(docKind({ title: 'Doc', url: `https://docs.google.com/document/d/${id}/edit` })).toBe('word');
    expect(docKind({ title: 'Autre', url: 'https://x.fr/a' })).toBe('other');
  });
  it('n’intègre en aperçu que Google Drive / Docs', () => {
    expect(embedUrl(`https://drive.google.com/file/d/${id}/view?usp=sharing`)).toBe(`https://drive.google.com/file/d/${id}/preview`);
    expect(embedUrl(`https://docs.google.com/document/d/${id}/edit`)).toBe(`https://docs.google.com/document/d/${id}/preview`);
    expect(embedUrl(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`)).toBe(`https://docs.google.com/spreadsheets/d/${id}/preview`);
    expect(embedUrl('https://site-inconnu.example/doc.pdf')).toBeNull();
    expect(embedUrl('javascript:alert(1)')).toBeNull();
  });
  it('nettoie la saisie', () => {
    expect(cleanDocs([{ title: ' ', url: 'https://a.fr/x.pdf' }, { title: 'x', url: 'ftp://a' }, { title: 'y', url: '' }])).toEqual([{ title: 'Document', url: 'https://a.fr/x.pdf' }]);
  });
  it('gère les fichiers déposés', () => {
    expect(safeFileName('Sujet TP é#1.docx')).toMatch(/^[A-Za-z0-9._ ()-]+\.docx$/);
    expect(newStoragePath('Cours.pdf')).toMatch(/^docs\/[A-Za-z0-9_-]{8,64}\/Cours\.pdf$/);
    expect(checkFile({ name: 'a.pdf', size: 10 })).toBeNull();
    expect(checkFile({ name: 'a.exe', size: 10 })).toMatch(/.+/);
    expect(checkFile({ name: 'a.pdf', size: MAX_FILE_BYTES + 1 })).toMatch(/.+/);
    expect(cleanDocs([{ title: 'T', path: 'docs/abcdefgh12/T.pdf' }])).toHaveLength(1);
    expect(orphanPaths([{ title: 'a', path: 'docs/x/a.pdf' }, { title: 'b', path: 'docs/y/b.pdf' }, { title: 'l', url: 'https://a.fr' }], [{ title: 'b', path: 'docs/y/b.pdf' }])).toEqual(['docs/x/a.pdf']);
    expect(hasPreview({ title: 'a', path: 'docs/abcdefgh12/a.pdf' })).toBe(true);
    expect(hasPreview({ title: 'a', path: 'docs/abcdefgh12/a.doc' })).toBe(false);
  });
});

import { weekdaysFor } from '@/lib/calendar';
describe('jours par niveau', () => {
  it('utilise le réglage du niveau, sinon le réglage commun', () => {
    const st = { shown_days: '1,2,3,4', shown_days_terminale: '1,2,3,4,5' };
    expect(weekdaysFor(st, 'Terminale')).toEqual([1, 2, 3, 4, 5]);
    expect(weekdaysFor(st, 'Seconde')).toEqual([1, 2, 3, 4]);
    expect(weekdaysFor({}, 'Première')).toEqual([1, 2, 3, 4]);
  });
});

describe('import de TP collés', () => {
  const prof = (id: string, email: string, full_name: string | null) => ({ id, email, full_name, role: 'admin', active: true, created_at: '', last_seen: null }) as never;
  const text = 'Domaine\tEnseignant\tNom du TP\tObjectif\tCompétences\tDurée\nSécurité - Habilitation (1)\tVerwaerde\tFormation à l’habilitation électrique : préparation B1V \tÊtre capable d’évaluer un risque\tC1 - C2 - C10 - C11\t3';
  it('retrouve les colonnes par leur en-tête, dans n’importe quel ordre', async () => {
    const { parseTpPaste, buildTps } = await import('@/lib/importTp');
    const rows = parseTpPaste(text);
    expect(rows).toHaveLength(1);
    const { ok, problems } = buildTps(rows, [prof('p1', 'alexandre.verwaerde@lamache.org', 'Alexandre V.'), prof('p2', 'marc.m@lamache.org', 'Marc M.')], []);
    expect(problems).toEqual([]);
    expect(ok[0]).toMatchObject({ title: 'Formation à l’habilitation électrique : préparation B1V', domain: 'hab', hours: 3, teacher_id: 'p1', competences: ['C1', 'C2', 'C10', 'C11'], level: 'Seconde' });
  });
  it('accepte une durée « 7 h », un niveau « 2nd » et un titre absent', async () => {
    const { parseTpPaste, buildTps } = await import('@/lib/importTp');
    const t = 'Domaine\tEnseignant\tNiveau\tNom du TP\tObjectif\tCompétences\tDurée\nBatiment (1)\tSadky\t2nd\t\t\t\t11\nIndustrie (4)\tVerwaerde\t2nd\tInverseur\tObj\tC1 - C3 - C12\t7 h';
    const { ok, problems } = buildTps(parseTpPaste(t), [], []);
    expect(problems).toEqual([]);
    expect(ok.map((x) => [x.title, x.domain, x.level, x.hours, x.teacher_label])).toEqual([['Batiment (1)', 'bat', 'Seconde', 11, 'Sadky'], ['Inverseur', 'ind', 'Seconde', 7, 'Verwaerde']]);
    expect(ok[1].competences).toEqual(['C1', 'C3', 'C12']);
  });
  it('garde un nom partiel comme texte libre s’il est ambigu', async () => {
    const { buildTps } = await import('@/lib/importTp');
    const { ok } = buildTps([['', 'T', '', '', '', 'Martin', '', '', '', '']], [prof('a', 'a.martin@lamache.org', null), prof('b', 'b.martin@lamache.org', null)], []);
    expect(ok[0].teacher_id).toBeNull();
    expect(ok[0].teacher_label).toBe('Martin');
  });
});
