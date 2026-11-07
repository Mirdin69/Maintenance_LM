/**
 * Adresses d'images. Les liens de partage Google Drive ne s'affichent pas tels quels dans une page :
 * on les convertit en adresse de miniature, qui fonctionne si le fichier est partagé
 * « Tous les utilisateurs disposant du lien ».
 */
const DRIVE_ID = [
  /drive\.google\.com\/file\/d\/([\w-]{10,})/,
  /drive\.google\.com\/(?:open|uc|thumbnail)\?(?:[^#]*&)?id=([\w-]{10,})/,
  /lh3\.googleusercontent\.com\/d\/([\w-]{10,})/,
  /docs\.google\.com\/(?:uc|document\/d|presentation\/d)\/?[^#]*?[?&/]id=([\w-]{10,})/,
];

export function driveId(url: string): string | null {
  for (const re of DRIVE_ID) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

/** Adresse utilisable dans <img>, ou null si la valeur n'est pas une adresse web (http/https) */
export function imageSrc(raw: string | null | undefined, width = 800): string | null {
  const url = (raw ?? '').trim();
  if (!/^https?:\/\//i.test(url)) return null;
  const id = driveId(url);
  if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w${width}`;
  return url;
}

/** Un dossier Drive n'est pas une image : on le signale pour aider à corriger */
export const isDriveFolder = (raw: string) => /drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\//.test(raw);
