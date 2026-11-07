/** Lignes collées depuis Excel ou un tableur : colonnes séparées par des tabulations (ou « ; »), première ligne ignorée si c'est un en-tête */
export function parsePaste(text: string, header: string[]): string[][] {
  const rows = text.split(/\r?\n/).map((l) => l.split(l.includes('\t') ? '\t' : ';').map((c) => c.trim())).filter((r) => r.some(Boolean));
  const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (rows.length && header.some((h, i) => rows[0][i] && norm(rows[0][i]) === norm(h))) rows.shift();
  return rows;
}

export const num = (v: string | undefined, fallback: number) => {
  const n = Number((v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && v !== undefined && v !== '' ? n : fallback;
};
