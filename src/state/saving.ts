import { useSyncExternalStore } from 'react';

export type SaveState = 'idle' | 'saving' | 'saved' | 'failed';
let state: SaveState = 'idle';
let pending = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const subs = new Set<() => void>();
const set = (s: SaveState) => { state = s; subs.forEach((f) => f()); };

/** Suit les enregistrements en cours pour l'indicateur de l'en-tête */
export const saving = {
  start() { pending++; clearTimeout(timer); set('saving'); },
  end(ok: boolean) {
    pending = Math.max(0, pending - 1);
    if (pending > 0) return;
    set(ok ? 'saved' : 'failed');
    clearTimeout(timer);
    if (ok) timer = setTimeout(() => set('idle'), 4000);
  },
};
export const useSaveState = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => state);
