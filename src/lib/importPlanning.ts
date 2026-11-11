import { COMPETENCES, DOMAINS, parseGroup } from './domain';
import { SPECIAL_LABELS } from './semainier';
import type { Part, PlanningCell, Profile, Room, Tp } from './types';

/** Un cours lu dans le fichier : un groupe, un jour (et une partie de journée), un TP ou une activité, des enseignants, une salle */
export interface PlanRow {
  line: string;
  day: string;
  group: string;
  part: Part;
  /** Code du TP, ou texte de l'activité */
  ref: string;
  title: string;
  domainRef: string;
  teachers: string[];
  room: string;
  objective: string;
  competences: string[];
}

export interface ParsedPlanning { layout: 'edt' | 'semainier' | 'tableau' | null; rows: PlanRow[]; problems: string[] }

export const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim();
/** Sans parenthèses ni ponctuation : « Prod Ener (1) » = « prod ener » */
export const loose = (x: string) => norm(x).replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

const MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
const DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const pad = (n: number) => String(n).padStart(2, '0');

/** Année scolaire qui contient ce jour et ce mois (le fichier n'écrit pas toujours l'année) */
function inferDate(day: number, month: number, year: number | null, bounds: { from: string; to: string }): string | null {
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  if (year) return `${year}-${pad(month)}-${pad(day)}`;
  const y0 = Number(bounds.from.slice(0, 4));
  for (const y of [y0, y0 + 1]) {
    const d = `${y}-${pad(month)}-${pad(day)}`;
    if (d >= bounds.from && d <= bounds.to) return d;
  }
  return null;
}

/** « 2 novembre », « mardi 3 novembre 2026 », « 2026-11-03 », « 03/11/2026 », « 3/11 » */
export function parseDate(raw: string, bounds: { from: string; to: string }): string | null {
  const t = norm(raw);
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(t);
  if (m) return inferDate(Number(m[1]), Number(m[2]), m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null, bounds);
  m = /(\d{1,2})\s*(?:er)?\s+([a-z]+)(?:\s+(\d{4}))?/.exec(t);
  if (m) {
    const mi = MONTHS.indexOf(m[2]) + 1;
    return mi ? inferDate(Number(m[1]), mi, m[3] ? Number(m[3]) : null, bounds) : null;
  }
  return null;
}

const splitTeachers = (v: string) => v.split(/\s*(?:[/,;&+]| et )\s*/i).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
const parseComps = (v: string) => [...new Set((v.toUpperCase().match(/C\d{1,2}/g) ?? []).filter((c) => c in COMPETENCES))];
/** Cellule d'un bloc : « 0 » (résultat de formule vide) et la répétition du titre d'une cellule fusionnée comptent pour du vide */
const part = (v: string | undefined, ref: string) => { const t = (v ?? '').trim(); return t === '0' || t === ref ? '' : t; };
const IGNORED = /^(vacances?|ferie|jour ferie|ferme|-+|x)$/;
const partOf = (v: string): Part => { const n = norm(v); return /^(m|matin)/.test(n) ? 'M' : /^(a|am|apres)/.test(n) ? 'A' : 'J'; };

/** Planning au format « emploi du temps » : en-têtes de jours, puis par groupe les lignes Domaine / Enseignant / TP-Activité / Objectif / Compétences */
function parseEdt(grid: string[][], bounds: { from: string; to: string }): PlanRow[] {
  const rows: PlanRow[] = [];
  let dates: Array<string | null> = [];
  let monday: Date | null = null;
  for (let i = 0; i < grid.length; i++) {
    // Titre de semaine : « EMPLOI DU TEMPS - SEMAINE 36 - du 01/09/2026 au 06/09/2026 » (sert aux jours dont l'en-tête n'a pas de date)
    const wk = /du\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(grid[i][0] ?? '');
    if (wk) {
      const d = new Date(Date.UTC(Number(wk[3]), Number(wk[2]) - 1, Number(wk[1])));
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      monday = d;
    }
    const first = norm(grid[i][0] ?? '');
    if (first.startsWith('groupe') || (grid[i].slice(1).some((c) => DAYS.some((d) => norm(c).startsWith(d))) && !first.includes('domaine'))) {
      dates = grid[i].map((c, j) => {
        if (j === 0) return null;
        const own = parseDate(c, bounds);
        if (own) return own;
        const dn = DAYS.findIndex((d) => norm(c).startsWith(d));
        if (dn < 0 || !monday) return null;
        const d = new Date(monday);
        d.setUTCDate(d.getUTCDate() + dn);
        return d.toISOString().slice(0, 10);
      });
      continue;
    }
    const m = /^(.*?)\s*\n\s*domaine\s*$/i.exec(grid[i][0] ?? '') ?? (/domaine\s*$/i.test(grid[i][0] ?? '') ? /^(.*?)\s*domaine\s*$/i.exec(grid[i][0]) : null);
    if (!m) continue;
    const g = parseGroup(m[1]);
    if (!g) continue;
    const block: Record<string, string[]> = { domaine: grid[i] };
    for (let k = 1; k <= 4 && i + k < grid.length; k++) {
      const label = norm(grid[i + k][0] ?? '');
      const key = label.startsWith('enseignant') ? 'enseignant' : label.startsWith('tp') || label.startsWith('activ') ? 'tp' : label.startsWith('objectif') ? 'objectif' : label.startsWith('competence') ? 'competences' : '';
      if (key) block[key] = grid[i + k];
    }
    grid[i].forEach((ref, j) => {
      const day = dates[j];
      const code = (ref ?? '').trim();
      if (j === 0 || !day || !code || IGNORED.test(loose(code))) return;
      rows.push({
        line: `Ligne ${i + 1}, colonne ${j + 1}`, day, group: g.code, part: 'J', ref: code,
        title: part(block.tp?.[j], code), domainRef: code, teachers: splitTeachers(part(block.enseignant?.[j], code)), room: '',
        objective: part(block.objectif?.[j], code), competences: parseComps(part(block.competences?.[j], code)),
      });
    });
  }
  return rows;
}

/**
 * Feuille « SEMAINIER » : mois côte à côte et empilés (ligne « SEPTEMBRE 2026 », puis « semaine | jour | date | groupes… »),
 * cinq lignes par jour : domaine (ou TP), enseignant, TP / activité, objectif, compétences.
 */
function parseSemainierSheet(grid: string[][]): PlanRow[] {
  const rows: PlanRow[] = [];
  const cell = (r: number, c: number) => (grid[r]?.[c] ?? '').trim();
  for (let h = 1; h < grid.length; h++) {
    for (let c = 0; c < (grid[h]?.length ?? 0); c++) {
      if (norm(cell(h, c)) !== 'semaine' || norm(cell(h, c + 1)) !== 'jour' || norm(cell(h, c + 2)) !== 'date') continue;
      const mm = /([a-zéû]+)\s+(\d{4})/i.exec(cell(h - 1, c));
      const month = mm ? MONTHS.indexOf(norm(mm[1])) + 1 : 0;
      if (!month) continue;
      const groups: Array<{ col: number; code: string }> = [];
      for (let k = c + 3; k < grid[h].length && cell(h, k); k++) {
        if (norm(cell(h, k)) === 'semaine') break;
        const g = parseGroup(cell(h, k));
        if (g) groups.push({ col: k, code: g.code });
      }
      // Lignes de données : jusqu'à la prochaine ligne de mois ou la fin du bloc
      let r = h + 1;
      while (r < grid.length && /^\d+$/.test(cell(r, c + 2))) {
        const dayNum = Number(cell(r, c + 2));
        const start = r;
        while (r < grid.length && cell(r, c + 2) === String(dayNum) && cell(r, c) === cell(start, c) && cell(r, c + 1) === cell(start, c + 1)) r++;
        const date = `${mm![2]}-${pad(month)}-${pad(dayNum)}`;
        for (const g of groups) {
          const line = (k: number) => (start + k < r ? cell(start + k, g.col) : '');
          const ref = line(0);
          if (!ref || IGNORED.test(loose(ref))) continue;
          rows.push({
            line: `Ligne ${start + 1}`, day: date, group: g.code, part: 'J', ref, title: part(line(2), ref), domainRef: ref, teachers: splitTeachers(part(line(1), ref)), room: '',
            objective: part(line(3), ref), competences: parseComps(part(line(4), ref)),
          });
        }
      }
    }
  }
  return rows;
}

const HEAD: Record<string, string[]> = {
  date: ['date', 'jour'], group: ['groupe', 'classe'], part: ['partie', 'periode', 'moment'], ref: ['tp', 'code', 'code tp', 'tp activite', 'tp / activite', 'cours'],
  title: ['titre', 'nom du tp', 'activite', 'intitule'], domain: ['domaine'], teachers: ['enseignant', 'enseignants', 'professeur', 'professeurs', 'prof'],
  room: ['salle', 'lieu'], objective: ['objectif'], competences: ['competences', 'competence'],
};

/** Planning en tableau : une ligne par cours, colonnes reconnues par leur nom */
function parseTable(grid: string[][], bounds: { from: string; to: string }, problems: string[]): PlanRow[] {
  const h = grid.findIndex((r) => r.some((c) => HEAD.date.includes(norm(c))) && r.some((c) => HEAD.group.includes(norm(c))));
  if (h < 0) return [];
  const col = (k: string) => grid[h].findIndex((c) => HEAD[k].includes(norm(c)));
  const idx = Object.fromEntries(Object.keys(HEAD).map((k) => [k, col(k)]));
  if (idx.ref < 0 && idx.title < 0) { problems.push('Colonne « TP » ou « Activité » introuvable.'); return []; }
  const get = (r: string[], k: string) => (idx[k] >= 0 ? (r[idx[k]] ?? '').trim() : '');
  const rows: PlanRow[] = [];
  grid.slice(h + 1).forEach((r, i) => {
    if (!r.some(Boolean)) return;
    const line = `Ligne ${h + 2 + i}`;
    const day = parseDate(get(r, 'date'), bounds);
    const g = parseGroup(get(r, 'group'));
    if (!day) return void problems.push(`${line} : date « ${get(r, 'date')} » non reconnue.`);
    if (!g) return void problems.push(`${line} : groupe « ${get(r, 'group')} » non reconnu.`);
    const ref = get(r, 'ref') || get(r, 'title');
    if (!ref || IGNORED.test(loose(ref))) return;
    rows.push({ line, day, group: g.code, part: partOf(get(r, 'part')), ref, title: get(r, 'title'), domainRef: get(r, 'domain') || ref, teachers: splitTeachers(get(r, 'teachers')), room: get(r, 'room'), objective: get(r, 'objective'), competences: parseComps(get(r, 'competences')) });
  });
  return rows;
}

/** Lit une feuille (lignes de texte) : format emploi du temps ou tableau, détecté automatiquement */
export function parsePlanning(grid: string[][], bounds: { from: string; to: string }): ParsedPlanning {
  const problems: string[] = [];
  const isSemainier = grid.some((r) => r.some((c, j) => norm(c) === 'semaine' && norm(r[j + 1] ?? '') === 'jour' && norm(r[j + 2] ?? '') === 'date'));
  if (isSemainier) {
    const rows = parseSemainierSheet(grid);
    if (!rows.length) problems.push('Aucun cours reconnu dans cette feuille (colonnes semaine / jour / date).');
    return { layout: 'semainier', rows, problems };
  }
  const isEdt = grid.some((r) => /domaine\s*$/i.test(r[0] ?? '') && /\S/.test(r[0] ?? '') && parseGroupFromBlock(r[0]));
  if (isEdt) {
    const rows = parseEdt(grid, bounds);
    if (!rows.length) problems.push('Aucun cours reconnu : vérifiez que les jours portent leur date (« Mardi 3 novembre »).');
    return { layout: 'edt', rows, problems };
  }
  const rows = parseTable(grid, bounds, problems);
  if (!rows.length && !problems.length) problems.push('Format non reconnu : utilisez le modèle (colonnes Date, Groupe, TP…) ou un emploi du temps par groupe.');
  return { layout: rows.length || problems.length ? 'tableau' : null, rows, problems };
}
function parseGroupFromBlock(cell: string) {
  const m = /^(.*?)\s*\n?\s*domaine\s*$/i.exec(cell ?? '');
  return m ? parseGroup(m[1]) : null;
}

/* ───────────── Correspondances avec l'existant ───────────── */

export interface Catalog { tps: Tp[]; profiles: Profile[]; rooms: Room[]; domains: Record<string, string> }

const FILLER = new Set(['tp', 'td', 'cours', 'activite', 'activites']);
/** Domaine correspondant à un texte (« Prod Ener (1) » → Production d'énergie), ou null */
export function domainGuess(v: string, domains: Record<string, string> = DOMAINS): string | null {
  const n = loose(v);
  if (!n) return null;
  const words = n.split(' ').filter((w) => !FILLER.has(w));
  if (!words.length) return null;
  const entries = Object.entries(domains);
  const exact = entries.find(([k, label]) => k === n || loose(label) === n || loose(label).startsWith(n));
  if (exact) return exact[0];
  const hit = entries.find(([, label]) => {
    const lw = loose(label).split(' ');
    return words.every((w) => lw.some((x) => x.startsWith(w) || w.startsWith(x)));
  });
  return hit ? hit[0] : null;
}

/** TP existant : même code ou même titre (sans accents, parenthèses ni ponctuation) */
export function tpMatch(ref: string, title: string, tps: Tp[]): Tp | undefined {
  const r = loose(ref);
  const t = loose(title);
  // Avec un titre (emploi du temps : « Prod Ener (1) » est le domaine, le titre est le vrai TP), c'est le titre qui compte
  return tps.find((x) => (x.code && loose(x.code) === r) || (t ? loose(x.title) === t : loose(x.title) === r));
}

/** Identifiant d'un TP inconnu : son titre s'il y en a un, sinon le texte de la cellule */
export const tpKey = (r: Pick<PlanRow, 'ref' | 'title'>) => loose(r.title || r.ref);

export const isLabel = (ref: string) => SPECIAL_LABELS.some((l) => loose(l) === loose(ref));

/** Compte correspondant à « G. MOREL », « Verwaerde » : le nom de famille doit se retrouver dans le nom ou l'adresse */
export function teacherMatch(name: string, profiles: Profile[]): Profile | undefined {
  const parts = norm(name).replace(/\./g, ' ').split(' ').filter(Boolean);
  const surname = [...parts].sort((a, b) => b.length - a.length)[0];
  if (!surname || surname.length < 3) return undefined;
  const initial = parts.find((p) => p !== surname && p.length === 1);
  const hay = (p: Profile) => norm(`${p.full_name ?? ''} ${p.email.split('@')[0].replace(/[._-]/g, ' ')}`);
  const hits = profiles.filter((p) => hay(p).split(' ').some((w) => w === surname || (surname.length >= 4 && w.startsWith(surname))));
  if (hits.length <= 1) return hits[0];
  return (initial && hits.find((p) => hay(p).startsWith(initial))) || undefined;
}

export const roomMatch = (name: string, rooms: Room[]): Room | undefined => rooms.find((r) => loose(r.name) === loose(name));

export interface UnknownTp { key: string; ref: string; title: string; domainRef: string; level: string; rows: PlanRow[] }
export interface Unknowns { tps: UnknownTp[]; domains: string[]; teachers: string[]; rooms: string[] }

/** Ce que le fichier cite et que l'application ne connaît pas encore */
export function findUnknowns(rows: PlanRow[], cat: Catalog): Unknowns {
  const tps = new Map<string, UnknownTp>();
  const teachers = new Set<string>();
  const rooms = new Set<string>();
  for (const r of rows) {
    if (!isLabel(r.ref) && !tpMatch(r.ref, r.title, cat.tps)) {
      const key = tpKey(r);
      const cur = tps.get(key) ?? { key, ref: r.ref, title: r.title || r.ref, domainRef: r.domainRef, level: parseGroup(r.group)?.level ?? 'Seconde', rows: [] };
      cur.rows.push(r);
      tps.set(key, cur);
    }
    for (const t of r.teachers) if (!teacherMatch(t, cat.profiles)) teachers.add(t);
    if (r.room && !roomMatch(r.room, cat.rooms)) rooms.add(r.room);
  }
  const domains = new Map<string, string>();
  for (const t of tps.values()) {
    const base = t.domainRef.replace(/\(.*?\)/g, '').replace(/\b(tp|td|cours)\b/gi, '').replace(/\s+/g, ' ').trim();
    if (base && !domainGuess(t.domainRef, cat.domains)) domains.set(loose(base), base);
  }
  return { tps: [...tps.values()], domains: [...domains.values()], teachers: [...teachers], rooms: [...rooms] };
}

/* ───────────── Décisions et cases à écrire ───────────── */

export type TpDecision = { mode: 'create' } | { mode: 'existing'; id: string } | { mode: 'label' } | { mode: 'skip' };
export type TeacherDecision = { mode: 'account'; id: string } | { mode: 'label' } | { mode: 'skip' };
export type RoomDecision = { mode: 'create' } | { mode: 'existing'; id: string } | { mode: 'skip' };

export interface Decisions {
  tps: Record<string, TpDecision>;
  teachers: Record<string, TeacherDecision>;
  rooms: Record<string, RoomDecision>;
  /** TP créés pendant l'import : clé du TP inconnu → identifiant */
  created: Record<string, string>;
  /** Salles créées : nom → identifiant */
  createdRooms: Record<string, string>;
}

export interface CellRow {
  day: string; group_code: string; part: Part; seq: number; tp_id: string | null; label: string | null; room_id: string | null; teacher_ids: string[]; teacher_labels: string[];
}

/**
 * Cases du semainier à écrire. Plusieurs cours le même jour, pour le même groupe et la même partie, prennent les rangs 1, 2, 3…
 * Les cases déjà remplies sont conservées, sauf si `overwrite`.
 */
export function buildCells(rows: PlanRow[], cat: Catalog, dec: Decisions, existing: PlanningCell[], overwrite: boolean): { cells: CellRow[]; skipped: number } {
  const taken = new Set(existing.filter((c) => c.tp_id || c.label).map((c) => `${c.day}|${c.group_code}|${c.part}|${c.seq ?? 1}`));
  const next = new Map<string, number>();
  const cells: CellRow[] = [];
  let skipped = 0;
  for (const r of rows) {
    let tp_id: string | null = null;
    let label: string | null = null;
    if (isLabel(r.ref)) label = SPECIAL_LABELS.find((l) => loose(l) === loose(r.ref))!;
    else {
      const known = tpMatch(r.ref, r.title, cat.tps);
      if (known) tp_id = known.id;
      else {
        const d = dec.tps[tpKey(r)] ?? { mode: 'create' as const };
        if (d.mode === 'skip') { skipped++; continue; }
        if (d.mode === 'label') label = (r.title || r.ref).slice(0, 60);
        else if (d.mode === 'existing') tp_id = d.id;
        else tp_id = dec.created[tpKey(r)] ?? null;
        if (!tp_id && !label) { skipped++; continue; }
      }
    }
    const teacher_ids: string[] = [];
    const teacher_labels: string[] = [];
    for (const name of r.teachers) {
      const acc = teacherMatch(name, cat.profiles);
      const d = acc ? ({ mode: 'account', id: acc.id } as TeacherDecision) : dec.teachers[name] ?? { mode: 'label' };
      if (d.mode === 'account' && !teacher_ids.includes(d.id)) teacher_ids.push(d.id);
      else if (d.mode === 'label' && !teacher_labels.includes(name)) teacher_labels.push(name);
    }
    let room_id: string | null = null;
    if (r.room) {
      const known = roomMatch(r.room, cat.rooms);
      const d = known ? ({ mode: 'existing', id: known.id } as RoomDecision) : dec.rooms[r.room] ?? { mode: 'skip' };
      room_id = d.mode === 'existing' ? d.id : d.mode === 'create' ? dec.createdRooms[r.room] ?? null : null;
    }
    const k = `${r.day}|${r.group}|${r.part}`;
    const seq = (next.get(k) ?? 0) + 1;
    next.set(k, seq);
    if (seq > 4) { skipped++; continue; }
    if (!overwrite && taken.has(`${k}|${seq}`)) { skipped++; continue; }
    cells.push({ day: r.day, group_code: r.group, part: r.part, seq, tp_id, label, room_id, teacher_ids: teacher_ids.slice(0, 6), teacher_labels: teacher_labels.slice(0, 6) });
  }
  return { cells, skipped };
}
