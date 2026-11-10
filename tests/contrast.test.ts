import { DOMAIN_PALETTE, DOMAIN_COLORS } from '@/lib/domain';
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

describe('couleurs des domaines du semainier', () => {
  it.each([...Object.entries(DOMAIN_PALETTE), ...Object.entries(DOMAIN_COLORS)])('%s : texte lisible en clair et en sombre', (_k, c) => {
    expect(ratio(c.fg, c.bg)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(c.dfg, c.dbg)).toBeGreaterThanOrEqual(4.5);
  });
  it('chaque couleur proposée a ses règles CSS', () => {
    for (const k of Object.keys(DOMAIN_PALETTE)) expect(css).toContain(`.dom-${k} {`);
  });
});

describe('couleurs de domaine choisies librement', () => {
  it('le texte reste lisible (4,5) en clair et en sombre quelle que soit la couleur choisie', async () => {
    const { deriveColors } = await import('@/lib/colors');
    for (let r = 0; r < 256; r += 51) for (let g = 0; g < 256; g += 51) for (let b = 0; b < 256; b += 51) {
      const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
      const c = deriveColors(hex);
      expect(ratio(c.fg, c.bg), hex).toBeGreaterThanOrEqual(4.5);
      expect(ratio(c.dfg, c.dbg), hex).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('lit les couleurs enregistrées en ignorant les valeurs invalides et génère les règles CSS', async () => {
    const { parseDomainColors, domainColorsCss } = await import('@/lib/domain');
    const m = parseDomainColors('{"ind":"#FF0000","bat":"rouge","c-x":"#00ff00","BAD!":"#000000"}');
    expect(m).toEqual({ ind: '#ff0000', 'c-x': '#00ff00' });
    const css2 = domainColorsCss(m);
    expect(css2).toContain('.dom-ind{--cbg:#ff0000;');
    expect(css2).toContain("[data-theme='dark'] .dom-c-x");
  });
});

describe('impression des couleurs de domaine', () => {
  it('force l’impression des fonds et des couleurs claires', async () => {
    expect(css).toMatch(/@media print \{\s*\.sem, \.sem \*, \.wk, \.wk \*, \.swatch \{ -webkit-print-color-adjust: exact; print-color-adjust: exact; \}/);
    for (const k of Object.keys(DOMAIN_COLORS)) expect(css).toContain(`:root:root:root .dom-${k} {`);
    const { domainColorsCss } = await import('@/lib/domain');
    expect(domainColorsCss({ ind: '#ff0000' })).toContain('@media print{\n:root:root:root .dom-ind{--cbg:#ff0000;');
  });
});
