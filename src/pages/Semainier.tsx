import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/state/auth';
import { useAct, useStore } from '@/state/store';
import { DOMAINS, LEVELS, byText, levelOfGroup } from '@/lib/domain';
import { GROUP_CODES } from '@/lib/domain';
import { DAY_LONG, DAY_SHORT, addDays, fmtDate, fmtShort, iso, isoDow, mondayOf, parseISO, schoolYearBounds, schoolYearOf } from '@/lib/dates';
import { isoWeek, monthBlocks, periodOn, weekdaysFor } from '@/lib/calendar';
import { SPECIAL_LABELS, cellKey, cellPatch, cellValue, hoursOf, indexCells, isMine } from '@/lib/semainier';
import type { Level, PlanningCell, Tp } from '@/lib/types';
import { Chip, Empty, PageHead, Seg, downloadBlob, toCsv } from '@/components/ui';

type View = 'annee' | 'semaine' | 'mes';

export default function Semainier() {
  const { data, settings, who } = useStore();
  const { canWrite } = useAuth();
  const [view, setView] = useState<View>('annee');
  const [level, setLevel] = useState<Level>('Seconde');

  const groups = GROUP_CODES.filter((g) => levelOfGroup(g) === level);
  const tps = useMemo(() => data.tps.filter((t) => t.level === level).sort(byText((t) => t.code ?? t.title)), [data.tps, level]);
  const tpById = useMemo(() => new Map(data.tps.map((t) => [t.id, t])), [data.tps]);
  const cells = useMemo(() => indexCells(data.planning_cells), [data.planning_cells]);
  const weekdays = weekdaysFor(settings, level);
  const bounds = schoolYearBounds(schoolYearOf(new Date()));
  const from = settings.year_start || bounds.from;
  const to = settings.year_end || bounds.to;

  const teacherOf = (tp: Tp | undefined) => (tp ? (tp.teacher_id ? who(tp.teacher_id) : tp.teacher_label ?? '') : '');

  return (
    <>
      <PageHead tab="semainier" title="Semainier" />
      <div className="tools">
        <Seg<View> label="Vue" value={view} onChange={setView} items={[['annee', 'Année'], ['semaine', 'Semaine'], ['mes', 'Mes cours']]} />
        {view !== 'mes' && <Seg<Level> label="Niveau" value={level} onChange={setLevel} items={LEVELS.map((l) => [l, l])} />}
      </div>
      {view === 'annee' && <Year groups={groups} tps={tps} cells={cells} weekdays={weekdays} from={from} to={to} level={level} canWrite={canWrite} teacherOf={teacherOf} />}
      {view === 'semaine' && <Week groups={groups} cells={cells} weekdays={weekdays} tpById={tpById} teacherOf={teacherOf} />}
      {view === 'mes' && <Mine cells={data.planning_cells} tpById={tpById} />}
    </>
  );
}

interface CommonProps {
  groups: string[];
  cells: Map<string, PlanningCell>;
  weekdays: number[];
  teacherOf: (tp: Tp | undefined) => string;
}

function Year({ groups, tps, cells, weekdays, from, to, level, canWrite, teacherOf }: CommonProps & { tps: Tp[]; from: string; to: string; level: Level; canWrite: boolean }) {
  const { data } = useStore();
  const { profile } = useAuth();
  const act = useAct();
  const tpById = useMemo(() => new Map(data.tps.map((t) => [t.id, t])), [data.tps]);
  const months = useMemo(() => monthBlocks(from, to, weekdays), [from, to, weekdays]);
  const [onlyMine, setOnlyMine] = useState(false);
  const thisMonth = iso(new Date()).slice(0, 7);
  const [month, setMonth] = useState(() => (months.some((m) => m.key === thisMonth) ? thisMonth : ''));
  const shownMonths = month ? months.filter((m) => m.key === month) : months;

  const change = (day: string, group: string, value: string) => {
    const patch = cellPatch(value);
    if (!patch.tp_id && !patch.label) {
      const ex = cells.get(cellKey(day, group));
      if (ex?.note) return void act(() => api.update('planning_cells', { day, group_code: group }, patch), { tables: ['planning_cells'] });
      return void act(() => api.remove('planning_cells', { day, group_code: group }), { tables: ['planning_cells'] });
    }
    void act(() => api.upsert('planning_cells', [{ day, group_code: group, ...patch }], 'day,group_code'), { tables: ['planning_cells'] });
  };

  const exportCsv = () => {
    const rows: Array<Array<string>> = [['Semaine', 'Jour', 'Date', ...groups]];
    for (const m of months) for (const d of m.days) {
      const p = periodOn(d, data.calendar_periods);
      rows.push([String(isoWeek(d)), DAY_LONG[isoDow(parseISO(d)) - 1], fmtDate(d), ...groups.map((g) => {
        if (p) return p.label;
        const c = cells.get(cellKey(d, g));
        const tp = c?.tp_id ? tpById.get(c.tp_id) : undefined;
        return tp ? `${tp.code ?? tp.title} (${teacherOf(tp)})` : c?.label ?? '';
      })]);
    }
    downloadBlob(`semainier-${level}.csv`, toCsv(rows));
  };

  if (!tps.length && !data.planning_cells.length)
    return <section className="panel"><Empty>Aucun TP pour ce niveau. Créez-les dans Planning des TP, Catalogue, en choisissant le domaine et l’enseignant : ils apparaîtront ici dans les listes.</Empty></section>;

  return (
    <section className="panel">
      <div className="row between no-print">
        <div className="row">
          <label className="row">Mois
            <select className="in" value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="">Toute l’année</option>
              {months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </label>
          <label className="row"><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> Repérer mes cours</label>
        </div>
        <div className="row">
          <button className="btn ghost sm" onClick={exportCsv}>Exporter en CSV</button>
          <button className="btn ghost sm" onClick={() => window.print()}>Imprimer</button>
        </div>
      </div>
      <div className="scroll">
        {shownMonths.map((m) => (
          <table key={m.key} className="sem">
            <caption>{m.label}</caption>
            <thead><tr><th>Sem.</th><th>Jour</th><th>Date</th>{groups.map((g) => <th key={g}>{g}</th>)}</tr></thead>
            <tbody>
              {m.days.map((d, i) => {
                const dow = isoDow(parseISO(d));
                const p = periodOn(d, data.calendar_periods);
                const newWeek = i > 0 && dow === weekdays[0];
                return (
                  <tr key={d} className={(p ? 'off ' : '') + (newWeek ? 'wk-start' : '')}>
                    <td className="k">{isoWeek(d)}</td>
                    <td className="k">{DAY_SHORT[dow - 1]}</td>
                    <td className="k">{parseISO(d).getDate()}</td>
                    {p ? <td colSpan={groups.length}>{p.label}</td> : groups.map((g) => {
                      const c = cells.get(cellKey(d, g));
                      const tp = c?.tp_id ? tpById.get(c.tp_id) : undefined;
                      const value = cellValue(c);
                      const known = !!c?.label && SPECIAL_LABELS.includes(c.label);
                      return (
                        <td key={g} className={onlyMine && isMine(tp, profile) ? 'mine' : ''}>
                          <select className={`pc ${tp ? `dom-${tp.domain}` : value ? 'lab' : 'empty'}`} value={value} disabled={!canWrite}
                            aria-label={`${g}, ${DAY_LONG[dow - 1]} ${fmtShort(d)}`} onChange={(e) => change(d, g, e.target.value)}>
                            <option value="">—</option>
                            {c?.tp_id && !tp && <option value={`tp:${c.tp_id}`}>(TP d’un autre niveau)</option>}
                            <optgroup label="TP">{tps.map((t) => <option key={t.id} value={`tp:${t.id}`}>{t.code ?? t.title}</option>)}</optgroup>
                            <optgroup label="Autres">
                              {SPECIAL_LABELS.map((l) => <option key={l} value={`lab:${l}`}>{l}</option>)}
                              {c?.label && !known && <option value={`lab:${c.label}`}>{c.label}</option>}
                            </optgroup>
                          </select>
                          {tp && <span className="who">{teacherOf(tp)}</span>}
                          {c?.note && <span className="who">{c.note}</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ))}
      </div>
    </section>
  );
}

function Week({ groups, cells, weekdays, tpById, teacherOf }: CommonProps & { tpById: Map<string, Tp> }) {
  const { data } = useStore();
  const { profile } = useAuth();
  const [start, setStart] = useState(() => iso(mondayOf(new Date())));
  const [onlyMine, setOnlyMine] = useState(false);
  const days = weekdays.map((n) => iso(addDays(parseISO(start), n - 1)));
  const end = days[days.length - 1];

  return (
    <section className="panel">
      <div className="row between no-print">
        <h2>Semaine {isoWeek(start)}, du {fmtShort(days[0])} au {fmtShort(end)}</h2>
        <div className="row">
          <button className="btn ghost sm" onClick={() => setStart(iso(addDays(parseISO(start), -7)))}>← Précédente</button>
          <button className="btn ghost sm" onClick={() => setStart(iso(mondayOf(new Date())))}>Aujourd’hui</button>
          <button className="btn ghost sm" onClick={() => setStart(iso(addDays(parseISO(start), 7)))}>Suivante →</button>
          <button className="btn ghost sm" onClick={() => window.print()}>Imprimer</button>
        </div>
      </div>
      <label className="row no-print"><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> Mes cours seulement</label>
      <h2 className="only-print">Emploi du temps, semaine {isoWeek(start)} du {fmtDate(days[0])} au {fmtDate(end)}</h2>
      <div className="stack">
        {groups.map((g) => (
          <div key={g} className="scroll">
            <table className="wk">
              <thead><tr><th>{g}</th>{days.map((d) => <th key={d}>{DAY_LONG[isoDow(parseISO(d)) - 1]}<br /><span className="small">{fmtShort(d)}</span></th>)}</tr></thead>
              <tbody>
                {(['Domaine', 'Enseignant', 'TP / activité', 'Objectif', 'Compétences'] as const).map((row, ri) => (
                  <tr key={row}>
                    <th className="row-h">{row}</th>
                    {days.map((d) => {
                      const p = periodOn(d, data.calendar_periods);
                      if (p) return ri === 0 ? <td key={d} className="dim" rowSpan={5}>{p.label}</td> : null;
                      const c = cells.get(cellKey(d, g));
                      const tp = c?.tp_id ? tpById.get(c.tp_id) : undefined;
                      if (onlyMine && !isMine(tp, profile)) return <td key={d} className="dim">{ri === 0 ? '·' : ''}</td>;
                      if (!tp) return <td key={d} className={c?.label ? 'dim' : ''}>{ri === 0 ? c?.label ?? '' : ri === 3 ? c?.note ?? '' : ''}</td>;
                      if (ri === 0) return <td key={d} className={`dom dom-${tp.domain}`} title={DOMAINS[tp.domain]}>{tp.code ?? DOMAINS[tp.domain]}</td>;
                      if (ri === 1) return <td key={d}>{teacherOf(tp)}</td>;
                      if (ri === 2) return <td key={d}>{tp.title}</td>;
                      if (ri === 3) return <td key={d}>{tp.objective}</td>;
                      return <td key={d}>{tp.competences.join(' · ')}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}

function Mine({ cells, tpById }: { cells: PlanningCell[]; tpById: Map<string, Tp> }) {
  const { profile } = useAuth();
  const { data } = useStore();
  const today = iso(new Date());
  const mine = useMemo(
    () => cells.filter((c) => isMine(c.tp_id ? tpById.get(c.tp_id) : undefined, profile)).sort((a, b) => a.day.localeCompare(b.day) || a.group_code.localeCompare(b.group_code)),
    [cells, tpById, profile],
  );
  const upcoming = mine.filter((c) => c.day >= today && !periodOn(c.day, data.calendar_periods));
  const summary = [...hoursOf([...tpById.values()], mine).values()].sort(byText((x) => x.tp.code ?? x.tp.title));
  const [showAll, setShowAll] = useState(false);
  const list = showAll ? upcoming : upcoming.slice(0, 15);

  return (
    <>
      <section className="panel">
        <h2>Mes prochains cours ({upcoming.length})</h2>
        <p className="muted small">Cours dont le TP vous est attribué (compte lié au TP, ou votre nom retrouvé dans le champ enseignant du TP).</p>
        {upcoming.length === 0 ? <Empty>Aucun cours à venir. Si c’est inattendu, vérifiez l’enseignant indiqué sur vos TP dans Planning des TP, Catalogue.</Empty> : (
          <div className="scroll"><table className="tbl">
            <thead><tr><th>Date</th><th>Groupe</th><th>TP</th><th>Objectif</th></tr></thead>
            <tbody>{list.map((c) => {
              const tp = tpById.get(c.tp_id!)!;
              return <tr key={cellKey(c.day, c.group_code)}>
                <td>{DAY_LONG[isoDow(parseISO(c.day)) - 1]} {fmtDate(c.day)}</td><td>{c.group_code}</td>
                <td><Chip tone="info">{tp.code ?? '—'}</Chip> {tp.title}</td><td className="small">{tp.objective}</td>
              </tr>;
            })}</tbody>
          </table></div>
        )}
        {upcoming.length > 15 && <button className="btn ghost sm" onClick={() => setShowAll(!showAll)}>{showAll ? 'Réduire' : `Afficher les ${upcoming.length} cours`}</button>}
      </section>
      {summary.length > 0 && (
        <section className="panel">
          <h2>Répartition sur l’année</h2>
          <div className="scroll"><table className="tbl">
            <thead><tr><th>TP</th><th className="num">Jours planifiés</th></tr></thead>
            <tbody>{summary.map(({ tp, days }) => <tr key={tp.id}><td><b>{tp.code}</b> {tp.title}</td><td className="num">{days}</td></tr>)}</tbody>
          </table></div>
        </section>
      )}
    </>
  );
}
