import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useAuth } from './auth';
import type { Setting } from '@/lib/types';

interface Branding {
  title: string;
  siteLogo: string;
  schoolLogo: string;
  refresh: () => Promise<void>;
}

const Ctx = createContext<Branding>({ title: 'Parc MELEC', siteLogo: '', schoolLogo: '', refresh: async () => {} });

/** Titre et logos : lisibles dès la page de connexion (règle publique limitée à ces trois réglages) */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [vals, setVals] = useState<Record<string, string>>({});
  const refresh = useCallback(async () => {
    try {
      const rows = await api.select<Setting>('settings');
      setVals(Object.fromEntries(rows.map((r) => [r.key, r.value])));
    } catch {
      /* les réglages sont facultatifs : le site fonctionne sans */
    }
  }, []);
  useEffect(() => {
    if (status !== 'loading' && status !== 'misconfigured') void refresh();
  }, [status, refresh]);
  const value = useMemo(
    () => ({ title: vals.site_title || 'Parc MELEC', siteLogo: vals.site_logo_url ?? '', schoolLogo: vals.school_logo_url ?? '', refresh }),
    [vals, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useBranding = () => useContext(Ctx);
