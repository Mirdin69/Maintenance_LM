export type Row = Record<string, unknown>;
/** Critère d'égalité par colonne ; un tableau signifie « l'une de ces valeurs » */
export type Match = Record<string, unknown>;

export interface Query {
  eq?: Match;
  order?: Array<[string, 'asc' | 'desc']>;
  limit?: number;
}

export interface AuthUser {
  id: string;
  email: string;
}

/** Accès aux données : Supabase en production, base en mémoire pour la démo et les tests */
export interface Api {
  configured: boolean;
  auth: {
    user(): Promise<AuthUser | null>;
    onChange(cb: (u: AuthUser | null) => void): () => void;
    sendLink(email: string): Promise<void>;
    verifyCode(email: string, code: string): Promise<void>;
    signOut(): Promise<void>;
  };
  select<T>(table: string, q?: Query): Promise<T[]>;
  insert<T>(table: string, rows: Row | Row[]): Promise<T[]>;
  update(table: string, match: Match, patch: Row): Promise<void>;
  upsert(table: string, rows: Row[], onConflict?: string): Promise<void>;
  remove(table: string, match: Match): Promise<void>;
  rpc(fn: string, args?: Row): Promise<unknown>;
  /** Prévient quand une table change (mises à jour en direct) */
  subscribe(tables: string[], cb: (table: string) => void): () => void;
}
