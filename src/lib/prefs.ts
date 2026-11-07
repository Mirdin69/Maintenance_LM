export type Theme = 'auto' | 'light' | 'dark';
export type TextSize = 'normal' | 'large';

const get = (k: string) => { try { return window.localStorage.getItem(`parc:${k}`); } catch { return null; } };
const put = (k: string, v: string) => { try { window.localStorage.setItem(`parc:${k}`, v); } catch { /* ignoré */ } };

export const getTheme = (): Theme => { const v = get('theme'); return v === 'light' || v === 'dark' ? v : 'auto'; };
export const getSize = (): TextSize => (get('size') === 'large' ? 'large' : 'normal');

/** Applique le thème et la taille de texte sur la page */
export function applyPrefs(theme = getTheme(), size = getSize()) {
  const r = document.documentElement;
  if (theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', theme);
  if (size === 'large') r.setAttribute('data-size', 'large'); else r.removeAttribute('data-size');
}
export const setTheme = (t: Theme) => { put('theme', t); applyPrefs(); };
export const setSize = (s: TextSize) => { put('size', s); applyPrefs(); };
