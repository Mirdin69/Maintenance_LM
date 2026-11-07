import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import type { AuthUser } from '@/lib/apiTypes';
import type { Profile } from '@/lib/types';

export type AuthStatus = 'loading' | 'misconfigured' | 'signedOut' | 'noProfile' | 'pending' | 'ready';

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  profile: Profile | null;
  isAdmin: boolean;
  /** Peut créer et modifier des données (gestionnaire ou enseignant) */
  canWrite: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(api.configured ? 'loading' : 'misconfigured');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const touched = useRef<string | null>(null);

  const loadProfile = useCallback(async (u: AuthUser | null, attempt = 0) => {
    if (!u) {
      setProfile(null);
      setStatus('signedOut');
      return;
    }
    const rows = await api.select<Profile>('profiles', { eq: { id: u.id } });
    const p = rows[0] ?? null;
    if (!p) {
      // Le profil est créé par la base juste après le premier accès : on réessaie une fois
      if (attempt < 2) {
        window.setTimeout(() => void loadProfile(u, attempt + 1), 1200);
        return;
      }
      setProfile(null);
      setStatus('noProfile');
      return;
    }
    setProfile(p);
    setStatus(p.active ? 'ready' : 'pending');
    if (p.active && touched.current !== p.id) {
      touched.current = p.id;
      void api.rpc('touch_me').catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!api.configured) return;
    let alive = true;
    api.auth
      .user()
      .then((u) => {
        if (!alive) return;
        setUser(u);
        return loadProfile(u);
      })
      .catch(() => alive && setStatus('signedOut'));
    const off = api.auth.onChange((u) => {
      setUser((prev) => (prev?.id === u?.id ? prev : u));
      void loadProfile(u);
    });
    return () => {
      alive = false;
      off();
    };
  }, [loadProfile]);

  // Un compte en attente se met à jour tout seul dès que le gestionnaire le valide
  useEffect(() => {
    if (status !== 'pending' || !user) return;
    const off = api.subscribe(['profiles'], () => void loadProfile(user));
    const poll = window.setInterval(() => void loadProfile(user), 15000);
    return () => {
      off();
      window.clearInterval(poll);
    };
  }, [status, user, loadProfile]);

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      profile,
      isAdmin: status === 'ready' && profile?.role === 'admin',
      canWrite: status === 'ready' && (profile?.role === 'admin' || profile?.role === 'prof'),
      signOut: async () => {
        await api.auth.signOut();
        setProfile(null);
        setUser(null);
        setStatus('signedOut');
      },
      refreshProfile: () => loadProfile(user),
    }),
    [status, user, profile, loadProfile],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return v;
}
