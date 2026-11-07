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

function domain(v: string): Domain | null {
  const n = norm(v);
  if (!n) return 'ind';
  const hit = (Object.entries(DOMAINS) as Array<[Domain, string]>).find(([k, label]) => k === n || norm(label) === n || norm(label).startsWith(n));
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
    const prof = who ? profiles.find((p) => p.active && (norm(displayName(p)) === norm(who) || p.email.toLowerCase() === who.toLowerCase())) : undefined;
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
