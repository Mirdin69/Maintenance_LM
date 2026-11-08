import { normalize, parseGroup } from './domain';
import type { Level } from './types';

/** Une ligne lue dans le fichier, avant toute interprétation */
export interface RawRow {
  nom: string;
  prenom: string;
  groupe: string;
}

export interface PlannedStudent {
  name: string;
  groupCode: string;
  level: Level;
  /** Élève déjà présent dans la base (déplacement ou ligne inchangée) */
  existingId?: string;
  fromGroup?: string;
  /** Ancien nom abrégé (« Emma L. ») remplacé par la nouvelle forme */
  renamedFrom?: string;
}

export interface ImportPlan {
  add: PlannedStudent[];
  move: PlannedStudent[];
  same: PlannedStudent[];
  /** Élèves présents dans la base pour les groupes du fichier, mais absents du fichier */
  gone: Array<{ id: string; name: string; group_code: string }>;
  /** Lignes ignorées : groupe non reconnu */
  bad: RawRow[];
  /** Lignes ignorées : même élève présent deux fois */
  dup: RawRow[];
}

// --- Lecture des fichiers ---------------------------------------------------

/** Texte d'une cellule Excel, quel que soit son type */
export function cellText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) return o.richText.map((r) => String((r as { text?: string }).text ?? '')).join('').trim();
    if ('result' in o) return cellText(o.result);
    if ('text' in o) return cellText(o.text);
  }
  return '';
}

/** Lecture d'un CSV (séparateur « ; », « , » ou tabulation, guillemets gérés) */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = [';', '\t', ','].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

/**
 * Transforme une grille (lignes x colonnes) en lignes d'élèves.
 * En-têtes reconnus : Nom, Prénom, Groupe (ou Classe), ou une colonne unique « Élève » (Nom Prénom).
 * Sans en-tête : colonnes dans l'ordre Nom, Prénom, Groupe. Sans colonne groupe, le nom de l'onglet sert de groupe.
 */
export function rowsFromGrid(grid: string[][], sheetName: string): RawRow[] {
  const isHeader = (c: string) => /^(nom|prenom|eleve|nom prenom|nom et prenom|prenom nom|groupe|classe)$/.test(normalize(c));
  let headerAt = -1;
  for (let i = 0; i < Math.min(grid.length, 15); i++) {
    if (grid[i].some(isHeader)) {
      headerAt = i;
      break;
    }
  }
  let nom = 0;
  let pre = 1;
  let ele = -1;
  let grp = 2;
  let reversed = false;
  if (headerAt >= 0) {
    nom = pre = ele = grp = -1;
    grid[headerAt].forEach((c, j) => {
      const k = normalize(c);
      if (k === 'nom') nom = j;
      else if (k === 'prenom') pre = j;
      else if (k === 'eleve' || k === 'nom prenom' || k === 'nom et prenom') ele = j;
      else if (k === 'prenom nom') {
        ele = j;
        reversed = true;
      } else if (k === 'groupe' || k === 'classe') grp = j;
    });
  }
  const out: RawRow[] = [];
  for (let r = headerAt + 1; r < grid.length; r++) {
    const row = grid[r];
    let n = '';
    let p = '';
    if (ele >= 0) {
      const parts = (row[ele] ?? '').trim().split(/\s+/).filter(Boolean);
      const first = parts.shift() ?? '';
      const rest = parts.join(' ');
      if (reversed) {
        p = first;
        n = rest;
      } else {
        n = first;
        p = rest;
      }
    } else {
      n = nom >= 0 ? (row[nom] ?? '').trim() : '';
      p = pre >= 0 ? (row[pre] ?? '').trim() : '';
    }
    if (!n && !p) continue;
    const g = grp >= 0 ? (row[grp] ?? '').trim() : '';
    out.push({ nom: n, prenom: p, groupe: g || sheetName });
  }
  return out;
}

/** Lit un fichier .xlsx ou .csv choisi par l'utilisateur */
export async function readStudentFile(file: File): Promise<RawRow[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    return rowsFromGrid(parseCsv(await file.text()), file.name.replace(/\.[^.]+$/, ''));
  }
  if (name.endsWith('.xls')) {
    throw new Error('Le format .xls n’est pas pris en charge. Enregistrez le fichier au format .xlsx ou .csv.');
  }
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const out: RawRow[] = [];
  wb.eachSheet((ws) => {
    const grid: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      for (let c = 1; c <= row.cellCount; c++) cells.push(cellText(row.getCell(c).value));
      grid.push(cells);
    });
    out.push(...rowsFromGrid(grid, ws.name));
  });
  return out;
}

/** Modèle Excel à remplir */
export async function buildTemplate(): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Élèves');
  ws.columns = [
    { header: 'Nom', key: 'nom', width: 24 },
    { header: 'Prénom', key: 'prenom', width: 24 },
    { header: 'Groupe', key: 'groupe', width: 12 },
  ];
  ws.addRows([
    { nom: 'Exemple', prenom: 'Alice', groupe: '2PB1.1' },
    { nom: 'Exemple', prenom: 'Bastien', groupe: '1PB1.2' },
    { nom: 'Exemple', prenom: 'Camille', groupe: 'TPB2' },
  ]);
  ws.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// --- Noms et plan de mise à jour --------------------------------------------

/**
 * Nom enregistré pour chaque ligne. Avec `reduce` (pseudonymisation, RGPD), seul le prénom et les deux premières
 * lettres du nom sont gardés (« Emma LA »), et les lettres s'ajoutent si deux élèves différents se ressemblent.
 */
export const pseudonym = (prenom: string, nom: string, letters = 2) => {
  const w = (nom.trim().split(/\s+/)[0] ?? '').replace(/[^\p{L}]/gu, '');
  return `${prenom.trim()} ${w.slice(0, letters).toUpperCase()}`.trim();
};

export function displayNames(rows: RawRow[], reduce: boolean): string[] {
  const len = rows.map(() => 2);
  const nameOf = (r: RawRow, k: number) => {
    if (!reduce) return `${r.prenom} ${r.nom}`.trim();
    return pseudonym(r.prenom, r.nom, k);
  };
  for (let pass = 0; pass < 12; pass++) {
    const groups = new Map<string, number[]>();
    rows.forEach((r, i) => {
      const key = normalize(nameOf(r, len[i]));
      groups.set(key, [...(groups.get(key) ?? []), i]);
    });
    let changed = false;
    for (const idx of groups.values()) {
      if (idx.length < 2) continue;
      if (new Set(idx.map((i) => normalize(rows[i].nom))).size < 2) continue;
      for (const i of idx) {
        const w = (rows[i].nom.trim().split(/\s+/)[0] ?? '').replace(/[^\p{L}]/gu, '');
        if (len[i] < w.length) {
          len[i]++;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return rows.map((r, i) => nameOf(r, len[i]));
}

export function planImport(
  rows: RawRow[],
  existing: Array<{ id: string; name: string; group_code: string }>,
  reduce: boolean,
): ImportPlan {
  const names = displayNames(rows, reduce);
  const byKey = new Map(existing.map((s) => [normalize(s.name), s]));
  const plan: ImportPlan = { add: [], move: [], same: [], gone: [], bad: [], dup: [] };
  const seen = new Set<string>();
  const groupsInFile = new Set<string>();
  rows.forEach((r, i) => {
    const g = parseGroup(r.groupe);
    if (!g) {
      plan.bad.push(r);
      return;
    }
    const key = normalize(names[i]);
    if (seen.has(key)) {
      plan.dup.push(r);
      return;
    }
    seen.add(key);
    groupsInFile.add(g.code);
    const ex = byKey.get(key);
    const item: PlannedStudent = { name: names[i].slice(0, 60), groupCode: g.code, level: g.level };
    if (!ex) plan.add.push(item);
    else if (ex.group_code !== g.code) plan.move.push({ ...item, existingId: ex.id, fromGroup: ex.group_code });
    else plan.same.push({ ...item, existingId: ex.id });
  });
  // Anciens noms « Emma L. » : repris tels quels sous leur nouvelle forme « Emma LA » (même élève, progression conservée)
  const legacy = existing.filter((s) => /\.$/.test(s.name.trim()) && !seen.has(normalize(s.name)));
  const claimed = new Set<string>();
  for (const item of [...plan.add]) {
    const k = normalize(item.name);
    const hits = legacy.filter((s) => !claimed.has(s.id) && k.startsWith(normalize(s.name.replace(/\.$/, ''))));
    const rivals = plan.add.filter((o) => normalize(o.name).startsWith(normalize(hits[0]?.name.replace(/\.$/, '') ?? '\u0000')));
    if (hits.length === 1 && rivals.length === 1) {
      claimed.add(hits[0].id);
      plan.add.splice(plan.add.indexOf(item), 1);
      plan.move.push({ ...item, existingId: hits[0].id, fromGroup: hits[0].group_code, renamedFrom: hits[0].name });
    }
  }
  for (const s of existing) {
    if (groupsInFile.has(s.group_code) && !seen.has(normalize(s.name)) && !claimed.has(s.id)) plan.gone.push(s);
  }
  return plan;
}
