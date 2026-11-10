import { LEVELS } from './domain';
import type { Tp } from './types';

export type SortKey = 'code' | 'title' | 'level' | 'teacher' | 'hours' | 'competences';
export type Duration = '' | 'none' | 'short' | 'half' | 'long' | 'xl';

/** Tranches de durée proposées dans le filtre */
export const DURATIONS: Array<[Duration, string]> = [
  ['', 'Toutes les durées'], ['short', '2 h ou moins'], ['half', 'de 2 h à 4 h'], ['long', 'de 4 h à 7 h'], ['xl', 'plus de 7 h'], ['none', 'Non précisée'],
];

export const inDuration = (hours: number | null, d: Duration) => {
  if (!d) return true;
  if (d === 'none') return !hours;
  if (!hours) return false;
  return d === 'short' ? hours <= 2 : d === 'half' ? hours > 2 && hours <= 4 : d === 'long' ? hours > 4 && hours <= 7 : hours > 7;
};

export interface TpFilters {
  q: string;
  level: string;
  /** identifiant de compte, ou « label:Nom » pour un enseignant sans compte */
  teacher: string;
  domain: string;
  duration: Duration;
  /** le TP doit travailler toutes ces compétences */
  comps: string[];
}
export const NO_FILTER: TpFilters = { q: '', level: '', teacher: '', domain: '', duration: '', comps: [] };
export const isFiltered = (f: TpFilters) => !!(f.q.trim() || f.level || f.teacher || f.domain || f.duration || f.comps.length);

/** Minuscules, sans accents */
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const teacherKey = (t: Tp) => (t.teacher_id ? t.teacher_id : t.teacher_label ? `label:${t.teacher_label}` : '');

/** Recherche (tous les mots, dans le code, le titre, l'objectif, l'enseignant, la séquence, les compétences) et sélection par critères */
export function filterTps(tps: Tp[], f: TpFilters, teacherName: (t: Tp) => string): Tp[] {
  const words = fold(f.q).split(/\s+/).filter(Boolean);
  return tps.filter((t) => {
    if (f.level && t.level !== f.level) return false;
    if (f.domain && t.domain !== f.domain) return false;
    if (f.teacher && teacherKey(t) !== f.teacher) return false;
    if (!inDuration(t.hours, f.duration)) return false;
    if (f.comps.some((c) => !t.competences.includes(c))) return false;
    if (!words.length) return true;
    const hay = fold([t.code, t.title, t.objective, teacherName(t), t.sequence_name, t.competences.join(' ')].filter(Boolean).join(' '));
    return words.every((w) => hay.includes(w));
  });
}

const num = (a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' });

export function sortTps(tps: Tp[], key: SortKey, dir: 1 | -1, teacherName: (t: Tp) => string): Tp[] {
  const cmp = (a: Tp, b: Tp): number => {
    switch (key) {
      case 'code': return num(a.code ?? '', b.code ?? '');
      case 'title': return num(a.title, b.title);
      case 'level': return LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level);
      case 'teacher': return num(teacherName(a), teacherName(b));
      case 'hours': return (a.hours ?? -1) - (b.hours ?? -1);
      case 'competences': return a.competences.length - b.competences.length || num(a.competences.join(), b.competences.join());
    }
  };
  // les valeurs vides restent en bas quel que soit le sens ; égalité : niveau puis code, pour un ordre stable
  const empty = (t: Tp) => (key === 'teacher' ? !teacherName(t) : key === 'hours' ? !t.hours : key === 'code' ? !t.code : false);
  return [...tps].sort((a, b) => (empty(a) !== empty(b) ? (empty(a) ? 1 : -1) : dir * cmp(a, b) || LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || num(a.code ?? '', b.code ?? '')));
}
