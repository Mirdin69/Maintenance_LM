import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Api, AuthUser, Match, Query, Row } from './apiTypes';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const client: SupabaseClient | null =
  url && key
    ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
    : null;

const PAGE = 1000;
const PK: Record<string, string[]> = {
  progress: ['student_id', 'tp_id'],
  teacher_groups: ['profile_id', 'group_code'],
  groups: ['code'],
  planning_cells: ['day', 'group_code'],
  settings: ['key'],
};

function db(): SupabaseClient {
  if (!client) throw new Error('Supabase n’est pas configuré (VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY).');
  return client;
}

function fail(error: { message: string }): never {
  throw new Error(error.message);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function filter(q: any, match: Match) {
  for (const [col, val] of Object.entries(match)) q = Array.isArray(val) ? q.in(col, val) : q.eq(col, val);
  return q;
}

const toUser = (u: { id: string; email?: string | null } | null | undefined): AuthUser | null =>
  u ? { id: u.id, email: (u.email ?? '').toLowerCase() } : null;

export const api: Api = {
  configured: Boolean(client),

  auth: {
    async user() {
      if (!client) return null;
      const { data } = await client.auth.getSession();
      return toUser(data.session?.user);
    },
    onChange(cb) {
      if (!client) return () => {};
      const { data } = client.auth.onAuthStateChange((_e, session) => cb(toUser(session?.user)));
      return () => data.subscription.unsubscribe();
    },
    async sendLink(email) {
      const { error } = await db().auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin, shouldCreateUser: true },
      });
      if (error) fail(error);
    },
    async verifyCode(email, code) {
      const { error } = await db().auth.verifyOtp({ email, token: code, type: 'email' });
      if (error) fail(error);
    },
    async signOut() {
      if (client) await client.auth.signOut();
    },
  },

  async select<T>(table: string, q: Query = {}) {
    const rows: T[] = [];
    const order = q.order ?? (PK[table] ?? ['id']).map((c) => [c, 'asc'] as [string, 'asc' | 'desc']);
    for (let from = 0; ; from += PAGE) {
      let query = db().from(table).select('*');
      if (q.eq) query = filter(query, q.eq);
      for (const [col, dir] of order) query = query.order(col, { ascending: dir === 'asc' });
      const { data, error } = await query.range(from, from + PAGE - 1);
      if (error) fail(error);
      rows.push(...((data ?? []) as T[]));
      if (!data || data.length < PAGE || (q.limit && rows.length >= q.limit)) break;
    }
    return q.limit ? rows.slice(0, q.limit) : rows;
  },

  async insert<T>(table: string, rows: Row | Row[]) {
    const list = Array.isArray(rows) ? rows : [rows];
    if (!list.length) return [];
    const { data, error } = await db().from(table).insert(list).select();
    if (error) fail(error);
    return (data ?? []) as T[];
  },

  async update(table, match, patch) {
    const { error } = await filter(db().from(table).update(patch), match);
    if (error) fail(error);
  },

  async upsert(table, rows, onConflict) {
    if (!rows.length) return;
    const { error } = await db().from(table).upsert(rows, onConflict ? { onConflict } : undefined);
    if (error) fail(error);
  },

  async remove(table, match) {
    const { error } = await filter(db().from(table).delete(), match);
    if (error) fail(error);
  },

  async rpc(fn, args) {
    const { data, error } = await db().rpc(fn, args ?? {});
    if (error) fail(error);
    return data;
  },

  subscribe(tables, cb) {
    if (!client) return () => {};
    const channel = client.channel('parc-' + Math.random().toString(36).slice(2));
    for (const t of tables) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => cb(t));
    }
    channel.subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  },
};

export const configured = api.configured;
