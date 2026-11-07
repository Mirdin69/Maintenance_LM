import type { DataSet } from './types';

export interface Bilan {
  from: string;
  to: string;
  groups: Array<{ group: string; days: number; hours: number; byTp: Array<{ tp: string; days: number }> }>;
  systems: Array<{ name: string; days: number; faults: number; open: number; downtimeDays: number | null }>;
  purchases: Array<{ kind: string; status: string; count: number; total: number }>;
  rooms: Array<{ name: string; hoursPerWeek: number }>;
  totals: { cells: number; faults: number; faultsClosed: number; spent: number };
}

const hoursBetween = (a: string, b: string) => (Number(b.slice(0, 2)) * 60 + Number(b.slice(3, 5)) - (Number(a.slice(0, 2)) * 60 + Number(a.slice(3, 5)))) / 60;

/** Synthèse de l'année : tout est calculé à partir des données déjà saisies, rien n'est ajouté à la base */
export function buildBilan(data: Pick<DataSet, 'planning_cells' | 'tps' | 'systems' | 'maintenance' | 'purchases' | 'rooms' | 'timetable_slots'>, from: string, to: string): Bilan {
  const tpById = new Map(data.tps.map((t) => [t.id, t]));
  const cells = data.planning_cells.filter((c) => c.day >= from && c.day <= to && c.tp_id && tpById.has(c.tp_id));

  const byGroup = new Map<string, Map<string, number>>();
  const sysDays = new Map<string, number>();
  for (const c of cells) {
    const tp = tpById.get(c.tp_id!)!;
    const g = byGroup.get(c.group_code) ?? new Map<string, number>();
    g.set(tp.id, (g.get(tp.id) ?? 0) + 1);
    byGroup.set(c.group_code, g);
    for (const id of tp.system_ids) sysDays.set(id, (sysDays.get(id) ?? 0) + 1);
  }
  const groups = [...byGroup.entries()].map(([group, m]) => ({
    group,
    days: [...m.values()].reduce((a, b) => a + b, 0),
    hours: [...m.entries()].reduce((a, [id, n]) => a + n * (tpById.get(id)!.hours ?? 0), 0),
    byTp: [...m.entries()].map(([id, n]) => ({ tp: tpById.get(id)!.code ?? tpById.get(id)!.title, days: n })).sort((a, b) => b.days - a.days),
  })).sort((a, b) => a.group.localeCompare(b.group, 'fr', { numeric: true }));

  const inYear = (iso: string) => iso.slice(0, 10) >= from && iso.slice(0, 10) <= to;
  const faults = data.maintenance.filter((m) => m.kind === 'corr' && inYear(m.created_at));
  const systems = data.systems.map((s) => {
    const mine = faults.filter((m) => m.system_id === s.id);
    const closed = mine.filter((m) => m.closed_at);
    const downtime = closed.length ? Math.round(closed.reduce((a, m) => a + (Date.parse(m.closed_at!) - Date.parse(m.created_at)) / 86400000, 0) / closed.length) : null;
    return { name: s.name, days: sysDays.get(s.id) ?? 0, faults: mine.length, open: mine.filter((m) => m.status !== 'done').length, downtimeDays: downtime };
  }).sort((a, b) => b.days - a.days || b.faults - a.faults);

  const buys = new Map<string, { kind: string; status: string; count: number; total: number }>();
  for (const p of data.purchases.filter((x) => inYear(x.created_at))) {
    const k = `${p.kind}|${p.status}`;
    const cur = buys.get(k) ?? { kind: p.kind, status: p.status, count: 0, total: 0 };
    cur.count++;
    cur.total += p.qty * Number(p.unit_price);
    buys.set(k, cur);
  }

  const roomHours = new Map<string, number>();
  for (const s of data.timetable_slots) roomHours.set(s.room_id, (roomHours.get(s.room_id) ?? 0) + hoursBetween(s.start_time, s.end_time));
  const rooms = data.rooms.map((r) => ({ name: r.name, hoursPerWeek: Math.round((roomHours.get(r.id) ?? 0) * 10) / 10 })).filter((r) => r.hoursPerWeek > 0).sort((a, b) => b.hoursPerWeek - a.hoursPerWeek);

  const purchases = [...buys.values()];
  return {
    from, to, groups, systems, purchases, rooms,
    totals: {
      cells: cells.length, faults: faults.length, faultsClosed: faults.filter((m) => m.status === 'done').length,
      spent: purchases.filter((p) => ['ok', 'ord', 'recv'].includes(p.status)).reduce((a, p) => a + p.total, 0),
    },
  };
}
