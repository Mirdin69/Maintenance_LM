import { driveId } from './images';

export interface Doc {
  title: string;
  url: string;
}

export type DocKind = 'pdf' | 'word' | 'excel' | 'slides' | 'other';

export const DOC_LABEL: Record<DocKind, string> = { pdf: 'PDF', word: 'Word', excel: 'Excel', slides: 'Diaporama', other: 'Document' };

/** Type probable d'un document d'après son titre, son adresse ou son hébergeur Google */
export function docKind(d: Doc): DocKind {
  const u = d.url.toLowerCase();
  const t = d.title.toLowerCase();
  const ext = (s: string) => s.split(/[?#]/)[0].match(/\.(\w{2,5})$/)?.[1] ?? '';
  const e = ext(t) || ext(u);
  if (u.includes('docs.google.com/document')) return 'word';
  if (u.includes('docs.google.com/spreadsheets')) return 'excel';
  if (u.includes('docs.google.com/presentation')) return 'slides';
  if (e === 'pdf') return 'pdf';
  if (['doc', 'docx', 'docm', 'odt', 'rtf'].includes(e)) return 'word';
  if (['xls', 'xlsx', 'xlsm', 'ods', 'csv'].includes(e)) return 'excel';
  if (['ppt', 'pptx', 'odp'].includes(e)) return 'slides';
  return 'other';
}

/**
 * Adresse d'aperçu intégrable : uniquement Google Drive / Docs, qui affichent PDF, Word et Excel.
 * Pour toute autre adresse on ne propose que le lien (pas d'intégration d'un site tiers).
 */
export function embedUrl(url: string): string | null {
  if (!/^https?:\/\//i.test(url)) return null;
  const doc = url.match(/docs\.google\.com\/(document|spreadsheets)\/d\/([\w-]{10,})/);
  if (doc) return `https://docs.google.com/${doc[1]}/d/${doc[2]}/preview`;
  const pres = url.match(/docs\.google\.com\/presentation\/d\/([\w-]{10,})/);
  if (pres) return `https://docs.google.com/presentation/d/${pres[1]}/embed`;
  const id = driveId(url);
  return id ? `https://drive.google.com/file/d/${id}/preview` : null;
}

/** Nettoie la liste saisie : adresses web seulement, titre par défaut */
export function cleanDocs(list: Doc[]): Doc[] {
  return list
    .map((d) => ({ title: d.title.trim().slice(0, 120), url: d.url.trim() }))
    .filter((d) => /^https?:\/\//i.test(d.url))
    .map((d) => ({ ...d, title: d.title || 'Document' }))
    .slice(0, 20);
}

export const asDocs = (v: unknown): Doc[] =>
  Array.isArray(v) ? v.filter((x): x is Doc => !!x && typeof (x as Doc).url === 'string').map((x) => ({ title: String((x as Doc).title ?? ''), url: (x as Doc).url })) : [];
