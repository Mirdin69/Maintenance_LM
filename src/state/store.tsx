import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { displayName } from '@/lib/domain';
import { useToast, friendlyError } from './toast';
import type { DataSet, Profile, Room, System, TableName, Tp } from '@/lib/types';

const ALL: TableName[] = [
  'profiles', 'teacher_groups', 'rooms', 'systems', 'tps', 'timetable_slots', 'sessions',
  'maintenance', 'maintenance_notes', 'purchases', 'students', 'progress',
  'tools', 'settings', 'calendar_periods', 'planning_cells', 'fiches',
  'maintenance_plans', 'companies', 'pfmp_periods',
];

const emptyData = (): DataSet => ({
  profiles: [], teacher_groups: [], rooms: [], systems: [], tps: [], timetable_slots: [], sessions: [],
  maintenance: [], maintenance_notes: [], purchases: [], students: [], progress: [],
  tools: [], settings: [], calendar_periods: [], planning_cells: [], fiches: [],
  maintenance_plans: [], companies: [], pfmp_periods: [],
});

interface Store {
  data: DataSet;
  loading: boolean;
  error: string | null;
  reload: (tables?: TableName | TableName[]) => Promise<void>;
  roomById: Map<string, Room>;
  systemById: Map<string, System>;
  tpById: Map<string, Tp>;
  profileById: Map<string, Profile>;
  /** Réglages (année scolaire, jours affichés, titre, logos) */
  settings: Record<string, string>;
  /** Nom lisible d'un utilisateur à partir de son identifiant */
  who: (id: string | null | undefined, fallbackLabel?: string | null) => string;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DataSet>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (tables?: TableName | TableName[]) => {
    const list = tables ? (Array.isArray(tables) ? tables : [tables]) : ALL;
    // Tables ajoutées par la migration 0005 : tant qu'elle n'est pas appliquée, le reste du site doit fonctionner
    const optional: TableName[] = ['maintenance_plans', 'companies', 'pfmp_periods'];
    const results = await Promise.all(list.map((t) => (optional.includes(t) ? api.select(t).catch(() => []) : api.select(t))));
    setData((d) => {
      const next: Record<string, unknown> = { ...d };
      list.forEach((t, i) => (next[t] = results[i]));
      return next as unknown as DataSet;
    });
  }, []);

  useEffect(() => {
    let alive = true;
    reload()
      .then(() => alive && setLoading(false))
      .catch((e) => {
        if (!alive) return;
        setError(friendlyError(e));
        setLoading(false);
      });
    const pending = new Set<TableName>();
    let timer: number | undefined;
    const off = api.subscribe(ALL, (t) => {
      pending.add(t as TableName);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const list = [...pending];
        pending.clear();
        reload(list).catch(() => {});
      }, 150);
    });
    // Repli si les mises à jour en direct ne sont pas activées : on recharge au retour sur l'onglet
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      off();
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload]);

  const value = useMemo<Store>(() => {
    const profileById = new Map(data.profiles.map((p) => [p.id, p]));
    return {
      data, loading, error, reload,
      roomById: new Map(data.rooms.map((r) => [r.id, r])),
      systemById: new Map(data.systems.map((s) => [s.id, s])),
      tpById: new Map(data.tps.map((t) => [t.id, t])),
      profileById,
      settings: Object.fromEntries(data.settings.map((x) => [x.key, x.value])),
      who: (id, label) => (id && profileById.has(id) ? displayName(profileById.get(id)) : label || '—'),
    };
  }, [data, loading, error, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore doit être utilisé dans StoreProvider');
  return v;
}

/**
 * Exécute une écriture : affiche l'erreur si elle échoue, recharge les tables touchées si elle réussit.
 * Retourne true en cas de succès.
 */
export function useAct() {
  const toast = useToast();
  const { reload } = useStore();
  return useCallback(
    async (fn: () => Promise<unknown>, opts: { ok?: string; tables?: TableName[]; undo?: () => Promise<unknown> } = {}) => {
      try {
        await fn();
        if (opts.tables?.length) await reload(opts.tables);
        const undo = opts.undo;
        if (opts.ok || undo) {
          toast(opts.ok ?? 'Modifié.', 'ok', undo ? {
            label: 'Annuler',
            run: async () => {
              try {
                await undo();
                if (opts.tables?.length) await reload(opts.tables);
                toast('Action annulée.');
              } catch (e) {
                toast(friendlyError(e), 'bad');
              }
            },
          } : undefined);
        }
        return true;
      } catch (e) {
        toast(friendlyError(e), 'bad');
        return false;
      }
    },
    [reload, toast],
  );
}
