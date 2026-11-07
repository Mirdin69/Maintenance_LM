import { COMPETENCES, DOMAINS, LEVELS, displayName } from '@/lib/domain';
import { num } from '@/lib/paste';
import type { Domain, Level, Profile, System } from '@/lib/types';

export const TP_COLUMNS = ['Code', 'Titre', 'Niveau', 'Domaine', 'Durée (h)', 'Enseignant', 'Séquence', 'Objectif', 'Compétences', 'Systèmes'];

const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim();

function level(v: string): Level | null {
  const n = norm(v);
  if (!n) return 'Seconde';
  if (/^(2|seconde|2nde|2de|2p)/.test(n)) return 'Seconde';
  if (/^(1|premiere|1ere|1re|1p)/.test(n)) return 'Première';
  if (/^(t|term|3)/.test(n)) return 'Terminale';
  return LEVELS.find((l) => norm(l) === n) ?? null;
}

/** Sans parenthèses ni ponctuation : « Sécurité - Habilitation (1) » = « Sécurité, habilitation » */
const loose = (x: string) => norm(x).replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

function domain(v: string): Domain | null {
  const n = loose(v);
  if (!n) return 'ind';
  const hit = (Object.entries(DOMAINS) as Array<[Domain, string]>).find(([k, label]) => k === n || loose(label) === n || loose(label).startsWith(n) || n.startsWith(loose(label)));
  return hit ? hit[0] : null;
}

export type TpRow = {
  code: string | null; title: string; level: Level; domain: Domain; hours: number | null;
  teacher_id: string | null; teacher_label: string | null; sequence_name: string | null; objective: string | null;
  competences: string[]; system_ids: string[]; tool_ids: string[]; documents: never[]; reusable: boolean;
};

/** Transforme des lignes collées depuis Excel en TP. Les lignes invalides sont écartées avec un message ; les valeurs inconnues (compétence, système) sont signalées. */
export function buildTps(rows: string[][], profiles: Profile[], systems: System[]): { ok: TpRow[]; problems: string[] } {
  const ok: TpRow[] = [];
  const problems: string[] = [];
  rows.forEach((r, i) => {
    const line = `Ligne ${i + 1}`;
    const title = (r[1] ?? '').trim();
    if (!title) return void problems.push(`${line} : titre manquant, ligne ignorée.`);
    const lv = level(r[2] ?? '');
    if (!lv) return void problems.push(`${line} : niveau « ${r[2]} » inconnu (Seconde, Première, Terminale), ligne ignorée.`);
    const dm = domain(r[3] ?? '');
    if (!dm) return void problems.push(`${line} : domaine « ${r[3]} » inconnu, ligne ignorée.`);
    const h = num(r[4], 0);
    const who = (r[5] ?? '').trim();
    const active = profiles.filter((p) => p.active);
    const exact = who ? active.find((p) => norm(displayName(p)) === norm(who) || p.email.toLowerCase() === who.toLowerCase()) : undefined;
    // Un nom partiel (« Verwaerde ») suffit s'il ne désigne qu'un seul compte
    const partial = who && !exact ? active.filter((p) => norm(displayName(p) + ' ' + p.email.split('@')[0].replace(/[._-]+/g, ' ')).includes(norm(who))) : [];
    const prof = exact ?? (partial.length === 1 ? partial[0] : undefined);
    const comps: string[] = [];
    for (const c of (r[8] ?? '').split(/[\s,;/+\-–—]+/).filter(Boolean)) {
      const k = c.toUpperCase();
      if (k in COMPETENCES) { if (!comps.includes(k)) comps.push(k); } else problems.push(`${line} : compétence « ${c} » inconnue, ignorée.`);
    }
    const sys: string[] = [];
    for (const name of (r[9] ?? '').split(/[;,|]/).map((s) => s.trim()).filter(Boolean)) {
      const s = systems.find((x) => norm(x.name) === norm(name));
      if (!s) problems.push(`${line} : système « ${name} » introuvable, ignoré.`);
      else if (!sys.includes(s.id)) sys.push(s.id);
    }
    ok.push({
      code: (r[0] ?? '').trim().slice(0, 20) || null, title: title.slice(0, 160), level: lv, domain: dm, hours: h > 0 ? Math.min(99, h) : null,
      teacher_id: prof?.id ?? null, teacher_label: prof ? null : who.slice(0, 60) || null,
      sequence_name: (r[6] ?? '').trim().slice(0, 120) || null, objective: (r[7] ?? '').trim().slice(0, 500) || null,
      competences: comps, system_ids: sys, tool_ids: [], documents: [], reusable: false,
    });
  });
  return { ok, problems };
}

/** Noms d'en-tête reconnus (sans accents ni majuscules), pour chaque colonne de TP_COLUMNS */
const ALIASES: string[][] = [
  ['code', 'n', 'numero'], ['titre', 'nom', 'nom du tp', 'tp', 'intitule', 'libelle'], ['niveau', 'classe', 'annee'], ['domaine', 'famille'],
  ['duree (h)', 'duree', 'heures', 'h', 'volume'], ['enseignant', 'enseignante', 'prof', 'professeur', 'auteur'], ['sequence', 'sequence pedagogique'],
  ['objectif', 'objectifs'], ['competences', 'competence'], ['systemes', 'systeme'],
];

/** Lit le texte collé : si la première ligne est un en-tête, les colonnes sont retrouvées par leur nom, dans n'importe quel ordre ; sinon l'ordre de TP_COLUMNS est supposé. */
export function parseTpPaste(text: string): string[][] {
  const rows = text.split(/\r?\n/).map((l) => l.split(l.includes('\t') ? '\t' : ';').map((c) => c.trim())).filter((r) => r.some(Boolean));
  if (!rows.length) return [];
  const map = rows[0].map((c) => ALIASES.findIndex((a) => a.includes(norm(c))));
  if (map.filter((i) => i >= 0).length < 2) return rows;
  const at = (r: string[], col: number) => { const src = map.indexOf(col); return src >= 0 ? r[src] ?? '' : ''; };
  return rows.slice(1).map((r) => TP_COLUMNS.map((_, col) => at(r, col)));
}
