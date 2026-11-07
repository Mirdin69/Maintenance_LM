import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

const vars = (block: string) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

const light = vars(css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme: dark)')));
const dark = { ...light, ...vars(css.slice(css.indexOf("@media (prefers-color-scheme: dark)"), css.indexOf('* { box-sizing'))) };

// Paires texte / fond réellement utilisées par l'interface
const PAIRS: Array<[string, string]> = [
  ['ink', 'bg'], ['ink', 'surface'], ['ink', 'sunken'], ['muted', 'surface'], ['muted', 'bg'], ['link', 'surface'], ['link', 'bg'],
  ['on-navy', 'navy'], ['ok', 'ok-bg'], ['warn', 'warn-bg'], ['bad', 'bad-bg'], ['info', 'info-bg'], ['idle', 'idle-bg'], ['pa', 'pa-bg'], ['h4ink', 'h4'],
];

describe.each([['clair', light], ['sombre', dark]] as const)('contraste, thème %s (WCAG AA, 4,5 minimum)', (_n, theme) => {
  it.each(PAIRS)('%s sur %s', (fg, bg) => {
    expect(theme[fg], `variable --${fg} absente`).toBeTruthy();
    expect(theme[bg], `variable --${bg} absente`).toBeTruthy();
    expect(ratio(theme[fg], theme[bg])).toBeGreaterThanOrEqual(4.5);
  });
});
