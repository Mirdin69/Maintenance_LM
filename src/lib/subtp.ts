import type { Tp } from './types';

/** Sous-TP rattachés à chaque TP principal */
export function childrenOf(tps: Tp[]): Map<string, Tp[]> {
  const out = new Map<string, Tp[]>();
  for (const t of tps) if (t.parent_id) out.set(t.parent_id, [...(out.get(t.parent_id) ?? []), t]);
  return out;
}

const union = (...lists: Array<string[] | undefined>) => [...new Set(lists.flatMap((l) => l ?? []))];

/**
 * TP tels que le semainier les utilise : un TP principal réunit les systèmes, les outils et les compétences
 * de ses sous-TP (la rotation se fait entre eux, mais la case du semainier est celle du principal).
 */
export function effectiveTps(tps: Tp[]): Map<string, Tp> {
  const kids = childrenOf(tps);
  return new Map(tps.map((t) => {
    const sub = kids.get(t.id);
    if (!sub?.length) return [t.id, t] as const;
    return [t.id, {
      ...t,
      system_ids: union(t.system_ids, ...sub.map((s) => s.system_ids)),
      tool_ids: union(t.tool_ids, ...sub.map((s) => s.tool_ids)),
      competences: union(t.competences, ...sub.map((s) => s.competences)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))),
    }] as const;
  }));
}
