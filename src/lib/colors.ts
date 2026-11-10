/** Outils de couleur : lisibilité (WCAG AA, 4,5 minimum) du texte sur un fond choisi librement */
export const HEX = /^#[0-9a-f]{6}$/i;

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c: number[]) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

export const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
const mix = (hex: string, other: string, t: number) => toHex(rgb(hex).map((v, i) => v * (1 - t) + rgb(other)[i] * t));

/** Texte lisible sur un fond : encre foncée, blanc ou noir (le noir garantit toujours 4,5) */
export const readableOn = (bg: string) => ['#14202b', '#ffffff', '#000000'].find((fg) => contrast(fg, bg) >= 4.5)!;

export interface DomainColor { bg: string; fg: string; dbg: string; dfg: string }

/** À partir d'une couleur choisie : fond et texte en thème clair, et variante assombrie pour le thème sombre */
export function deriveColors(color: string): DomainColor {
  const bg = color.toLowerCase();
  let dbg = bg;
  for (const t of [0.6, 0.68, 0.76, 0.84, 0.92]) {
    dbg = mix(bg, '#000000', t);
    if (contrast('#f2f2f2', dbg) >= 4.5) break;
  }
  return { bg, fg: readableOn(bg), dbg, dfg: contrast('#f2f2f2', dbg) >= 4.5 ? '#f2f2f2' : '#ffffff' };
}
