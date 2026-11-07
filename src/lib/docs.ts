import { api } from '@/lib/api';
import { driveId } from './images';

/** Un document : lien web (url) ou fichier déposé sur le site (path, dans l'espace privé « documents ») */
export interface Doc {
  title: string;
  url?: string;
  path?: string;
}

export type DocKind = 'pdf' | 'word' | 'excel' | 'slides' | 'other';

export const DOC_LABEL: Record<DocKind, string> = { pdf: 'PDF', word: 'Word', excel: 'Excel', slides: 'Diaporama', other: 'Document' };

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp';

const ext = (s: string) => s.split(/[?#]/)[0].match(/\.(\w{2,5})$/)?.[1]?.toLowerCase() ?? '';

/** Type probable d'un document d'après son titre, son adresse ou son hébergeur Google */
export function docKind(d: Doc): DocKind {
  const u = (d.url ?? '').toLowerCase();
  const e = ext(d.title) || ext(d.path ?? '') || ext(u);
  if (u.includes('docs.google.com/document')) return 'word';
  if (u.includes('docs.google.com/spreadsheets')) return 'excel';
  if (u.includes('docs.google.com/presentation')) return 'slides';
  if (e === 'pdf') return 'pdf';
  if (['doc', 'docx', 'docm', 'odt', 'rtf'].includes(e)) return 'word';
  if (['xls', 'xlsx', 'xlsm', 'ods', 'csv'].includes(e)) return 'excel';
  if (['ppt', 'pptx', 'odp'].includes(e)) return 'slides';
  return 'other';
}

/** Aperçu intégré d'un lien : uniquement Google Drive / Docs. Un fichier déposé a son propre aperçu. */
export function embedUrl(url: string | undefined): string | null {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const doc = url.match(/docs\.google\.com\/(document|spreadsheets)\/d\/([\w-]{10,})/);
  if (doc) return `https://docs.google.com/${doc[1]}/d/${doc[2]}/preview`;
  const pres = url.match(/docs\.google\.com\/presentation\/d\/([\w-]{10,})/);
  if (pres) return `https://docs.google.com/presentation/d/${pres[1]}/embed`;
  const id = driveId(url);
  return id ? `https://drive.google.com/file/d/${id}/preview` : null;
}

/** Le fichier déposé peut-il être affiché dans la page ? (PDF, .docx, .xlsx) */
export const canPreviewStored = (d: Doc) => {
  const e = ext(d.path ?? '');
  return e === 'pdf' || e === 'docx' || e === 'xlsx';
};

export const hasPreview = (d: Doc) => (d.path ? canPreviewStored(d) : !!embedUrl(d.url));

/** Nom de fichier sûr pour le stockage (lettres, chiffres, point, tiret, espace, parenthèses) */
export function safeFileName(name: string): string {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._ ()-]/g, '_').replace(/\.{2,}/g, '.').replace(/^[. ]+/, '').trim();
  const e = ext(base);
  const stem = (e ? base.slice(0, -(e.length + 1)) : base).slice(0, 120) || 'document';
  return e ? `${stem}.${e}` : stem;
}

export const newStoragePath = (fileName: string) => `docs/${crypto.randomUUID()}/${safeFileName(fileName)}`;

/** Fichier accepté ? Retourne un message d'erreur, sinon null. */
export function checkFile(f: { name: string; size: number }): string | null {
  if (f.size > MAX_FILE_BYTES) return `« ${f.name} » dépasse 10 Mo.`;
  if (!['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp'].includes(ext(f.name)))
    return `« ${f.name} » : format non accepté (PDF, Word, Excel, PowerPoint, OpenDocument).`;
  return null;
}

/** Nettoie la liste saisie : liens web ou fichiers déposés, titre par défaut */
export function cleanDocs(list: Doc[]): Doc[] {
  const out: Doc[] = [];
  for (const d of list) {
    const title = d.title.trim().slice(0, 120);
    if (d.path) out.push({ title: title || 'Document', path: d.path });
    else if (/^https?:\/\//i.test((d.url ?? '').trim())) out.push({ title: title || 'Document', url: (d.url ?? '').trim() });
  }
  return out.slice(0, 20);
}

export const asDocs = (v: unknown): Doc[] =>
  Array.isArray(v)
    ? v
        .filter((x): x is Doc => !!x && typeof x === 'object' && (typeof (x as Doc).url === 'string' || typeof (x as Doc).path === 'string'))
        .map((x) => ({ title: String(x.title ?? ''), ...(x.path ? { path: x.path } : { url: x.url }) }))
    : [];

/** Fichiers déposés qui figuraient dans `before` et ne figurent plus dans `after` */
export const orphanPaths = (before: Doc[], after: Doc[]) => {
  const keep = new Set(after.map((d) => d.path).filter(Boolean));
  return before.map((d) => d.path).filter((p): p is string => !!p && !keep.has(p));
};

/** Supprime des fichiers du stockage ; échec silencieux (seuls l'admin ou le déposant peuvent supprimer) */
export const dropFiles = async (paths: string[]) => {
  if (!paths.length) return;
  try { await api.storage.remove(paths); } catch { /* ignoré */ }
};
