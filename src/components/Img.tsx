import { useState } from 'react';
import { imageSrc, isDriveFolder } from '@/lib/images';

/** Image d'une adresse web (lien Drive converti). N'affiche rien si l'adresse est absente ou en erreur. */
export function Img({ url, alt, className, width = 800, eager = false }: { url: string | null | undefined; alt: string; className?: string; width?: number; eager?: boolean }) {
  const src = imageSrc(url, width);
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return null;
  return <img className={className} src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} referrerPolicy="no-referrer" onError={() => setFailed(src)} />;
}

/** Aperçu et aide dans un formulaire */
export function ImageHint({ value }: { value: string }) {
  const v = value.trim();
  if (!v) return null;
  if (isDriveFolder(v)) return <span className="muted small">Ceci est un dossier : ouvrez l’image, puis « Partager, puis Copier le lien ».</span>;
  if (!/^https?:\/\//i.test(v)) return <span className="muted small">L’adresse doit commencer par https://</span>;
  return <Img url={v} alt="Aperçu" className="thumb" width={200} />;
}
