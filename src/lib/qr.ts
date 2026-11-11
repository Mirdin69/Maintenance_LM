/** Adresse de la fiche d'un système (ou d'un de ses postes), lue par le QR code collé dessus */
export function systemUrl(id: string, poste?: number, base = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : ''): string {
  return `${base}#systeme/${id}${poste ? `/${poste}` : ''}`;
}

/** « systeme/<id>/<poste> » → identifiant du système et numéro de poste ; null si le hash n'est pas une fiche système */
export function parseSystemHash(hash: string): { id: string; poste: number | null } | null {
  const m = /^#?systeme\/([0-9a-f-]{8,40})(?:\/(\d{1,2}))?$/i.exec(hash);
  return m ? { id: m[1], poste: m[2] ? Number(m[2]) : null } : null;
}

/** Image (adresse de données) du QR code */
export async function qrDataUrl(text: string): Promise<string> {
  const QR = (await import('qrcode')).default;
  return QR.toDataURL(text, { margin: 1, width: 220, errorCorrectionLevel: 'M' });
}
