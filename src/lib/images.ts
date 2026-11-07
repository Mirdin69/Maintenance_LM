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

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp,.gif';
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export function checkImage(f: { name: string; size: number; type?: string }): string | null {
  if (!/\.(png|jpe?g|webp|gif)$/i.test(f.name) || (f.type && !IMAGE_TYPES.includes(f.type))) return `« ${f.name} » n’est pas une image PNG, JPEG, WebP ou GIF.`;
  if (f.size > IMAGE_MAX_BYTES) return `« ${f.name} » dépasse 5 Mo.`;
  if (f.size === 0) return `« ${f.name} » est vide.`;
  return null;
}

/** Chemin de dépôt : img/<identifiant>/<nom nettoyé> */
export function newImagePath(name: string): string {
  const clean = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._ ()-]/g, '_').replace(/\.{2,}/g, '.').slice(-120) || 'image';
  return `img/${crypto.randomUUID()}/${clean}`;
}
