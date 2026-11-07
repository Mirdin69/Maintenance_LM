import { useCallback, useState } from 'react';

/** État mémorisé dans ce navigateur (filtre, vue…). Sans stockage disponible, il se comporte comme un état normal. */
export function usePersisted<T extends string>(key: string, initial: T, allowed?: readonly T[]) {
  const [value, setValue] = useState<T>(() => {
    try {
      const v = window.localStorage.getItem(`parc:${key}`);
      if (v !== null && (!allowed || (allowed as readonly string[]).includes(v))) return v as T;
    } catch { /* stockage indisponible */ }
    return initial;
  });
  const set = useCallback((v: T) => {
    setValue(v);
    try { window.localStorage.setItem(`parc:${key}`, v); } catch { /* ignoré */ }
  }, [key]);
  return [value, set] as const;
}
