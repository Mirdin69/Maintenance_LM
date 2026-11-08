import type { AuditEntry } from './types';
import type { Match, Row } from './apiTypes';

const PK: Record<string, string[]> = { planning_cells: ['day', 'group_code'] };
const keysOf = (table: string) => PK[table] ?? ['id'];

export const TABLE_LABEL: Record<string, string> = {
  systems: 'Systèmes', tps: 'TP', fiches: 'Fiches', maintenance: 'Maintenance', maintenance_plans: 'Contrôles récurrents', purchases: 'Achats', rooms: 'Salles',
  tools: 'Outils', students: 'Élèves', planning_cells: 'Semainier', companies: 'Entreprises', ideas: 'Idées', pfmp_periods: 'PFMP', sessions: 'Séances', timetable_slots: 'Emploi du temps',
};

/** Intitulé lisible de la ligne concernée */
export function entryLabel(e: AuditEntry): string {
  const d = (e.new_data ?? e.old_data ?? {}) as Record<string, unknown>;
  if (e.table_name === 'planning_cells') return `${d.group_code} · ${d.day}`;
  return String(d.name ?? d.title ?? d.item ?? d.label ?? e.row_key ?? '');
}

/** Opération qui défait la modification : supprimer l'ajout, recréer la suppression, remettre l'ancienne valeur */
export function undoPlan(e: AuditEntry): { kind: 'remove'; match: Match } | { kind: 'insert'; row: Row } | { kind: 'update'; match: Match; patch: Row } {
  const keys = keysOf(e.table_name);
  const src = (e.op === 'DELETE' ? e.old_data : e.new_data ?? e.old_data) ?? {};
  const match: Match = Object.fromEntries(keys.map((k) => [k, src[k]]));
  if (e.op === 'INSERT') return { kind: 'remove', match };
  if (e.op === 'DELETE') return { kind: 'insert', row: e.old_data ?? {} };
  const patch = { ...(e.old_data ?? {}) };
  for (const k of keys) delete patch[k];
  return { kind: 'update', match, patch };
}
