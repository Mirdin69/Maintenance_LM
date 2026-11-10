import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/state/auth';
import { useAct, useStore } from '@/state/store';
import { LEVELS, byText, domainClass, domainLabel, levelOfGroup } from '@/lib/domain';
import { GROUP_CODES } from '@/lib/domain';
import { DAY_LONG, DAY_SHORT, addDays, fmtDate, fmtShort, iso, isoDow, mondayOf, parseISO, schoolYearBounds, schoolYearOf } from '@/lib/dates';
import { isoWeek, monthBlocks, partsFor, periodOn, weekdaysFor } from '@/lib/calendar';
import { CONFLICT_COLS, MAX_SEQ, PARTS, PART_LABEL, SPECIAL_LABELS, buildWarnings, cellKey, cellPatch, carouselOps, cellValue, copyWeekOps, courseTeachers, hoursOf, indexCells, isMyCell, rowOfOp, weekNeeds, type CellOp } from '@/lib/semainier';
import { usePersisted } from '@/hooks/usePersisted';
import { useMedia } from '@/hooks/useMedia';
import type { Level, Part, PlanningCell, Tp } from '@/lib/types';
import { Lundi } from './Lundi';
import { PlanningImport } from '@/components/PlanningImport';
import { Chip, Empty, PageHead, Seg, downloadBlob, toCsv } from '@/components/ui';

type View = 'annee' | 'semaine' | 'lundi' | 'besoins' | 'mes';
const VIEWS: readonly View[] = ['annee', 'semaine', 'lundi', 'besoins', 'mes'];

export default function Semainier() {
  const { data, settings, who } = useStore();
  const { canWrite } = useAuth();
  const [view, setView] = usePersisted<View>('sem-view', 'annee', VIEWS);
  const [level, setLevel] = usePersisted<Level>('sem-level', 'Seconde', LEVELS);

  const groups = GROUP_CODES.filter((g) => levelOfGroup(g) === level);
  const tps = useMemo(() => data.tps.filter((t) => t.level === level).sort(byText((t) => t.code ?? t.title)), [data.tps, level]);
  const tpById = useMemo(() => new Map(data.tps.map((t) => [t.id, t])), [data.tps]);
  const cells = useMemo(() => indexCells(data.planning_cells), [data.planning_cells]);
  const weekdays = weekdaysFor(settings, level);
  const dayParts = partsFor(settings, level);
  const bounds = schoolYearBounds(schoolYearOf(new Date()));
  const from = settings.year_start || bounds.from;
  const to = settings.year_end || bounds.to;

  const teacherOf = (tp: Tp | undefined) => (tp ? (tp.teacher_id ? who(tp.teacher_id) : tp.teacher_label ?? '') : '');

  return (
    <>
      <PageHead tab="semainier" title="Semainier" />
      <div className="tools">
        <Seg<View> label="Vue" value={view} onChange={setView} items={[['annee', 'Année'], ['semaine', 'Semaine'], ['lundi', 'Lundi'], ['besoins', 'Besoins matériel'], ['mes', 'Mes cours']]} />
        {view !== 'mes' && view !== 'besoins' && <Seg<Level> label="Niveau" value={level} onChange={setLevel} items={LEVELS.map((l) => [l, l])} />}
      </div>
      {view === 'annee' && <Year groups={groups} tps={tps} cells={cells} weekdays={weekdays} dayParts={dayParts} from={from} to={to} level={level} canWrite={canWrite} teacherOf={teacherOf} />}
      {view === 'semaine' && <Week groups={groups} cells={cells} weekdays={weekdays} dayParts={dayParts} tpById={tpById} teacherOf={teacherOf} />}
      {view === 'lundi' && <Lundi groups={groups} tps={tps} level={level} canWrite={canWrite} />}
      {view === 'besoins' && <Needs />}
      {view === 'mes' && <Mine cells={data.planning_cells} tpById={tpById} />}
    </>
  );
}

interface CommonProps {
  groups: string[];
  cells: Map<string, PlanningCell>;
  weekdays: number[];
  dayParts: Record<number, Part[]>;
  teacherOf: (tp: Tp | undefined) => string;
}

function Year({ groups, tps, cells, weekdays, dayParts, from, to, level, canWrite }: CommonProps & { tps: Tp[]; from: string; to: string; level: Level; canWrite: boolean }) {
  const { data, who } = useStore();
  const { profile } = useAuth();
  const act = useAct();
  const tpById = useMemo(() => new Map(data.tps.map((t) => [t.id, t])), [data.tps]);
  /** En Première on gère des séquences (les TP tournent à part, par élève) : elles sont proposées en tête de liste */
  const sequences = useMemo(() => (level === 'Première' ? data.fiches.filter((f) => f.kind === 'sequence' && (!f.level || f.level === level)).sort(byText((f) => f.title)) : []), [data.fiches, level]);
  const months = useMemo(() => monthBlocks(from, to, weekdays), [from, to, weekdays]);
  const [onlyMine, setOnlyMine] = useState(false);
  const thisMonth = iso(new Date()).slice(0, 7);
  const [month, setMonth] = useState(() => (months.some((m) => m.key === thisMonth) ? thisMonth : ''));
  const shownMonths = month ? months.filter((m) => m.key === month) : months;

  const warnings = useMemo(() => buildWarnings(data.planning_cells, tpById, new Map(data.systems.map((x) => [x.id, x]))), [data.planning_cells, tpById, data.systems]);

  /** Écrit des cases et permet d'annuler l'ensemble d'un geste */
  const apply = (ops: CellOp[], ok?: string) => {
    if (!ops.length) return;
    const before = ops.map((o) => ({ o, prev: cells.get(cellKey(o.day, o.group, o.part ?? 'J', o.seq ?? 1)) }));
    const run = async () => {
      for (const { o } of before) {
        const patch = cellPatch(o.value);
        const ex = cells.get(cellKey(o.day, o.group, o.part ?? 'J', o.seq ?? 1));
        const key = { day: o.day, group_code: o.group, part: o.part ?? 'J', seq: o.seq ?? 1 };
        if (!patch.tp_id && !patch.label) {
          if (ex?.note) await api.update('planning_cells', key, { ...patch, room_id: null });
          else if (ex) await api.remove('planning_cells', key);
        } else {
          await api.upsert('planning_cells', [rowOfOp(o)], CONFLICT_COLS);
        }
      }
    };
    const undo = async () => {
      for (const { o, prev } of before) {
        if (prev) await api.upsert('planning_cells', [{ day: prev.day, group_code: prev.group_code, part: prev.part ?? 'J', seq: prev.seq ?? 1, room_id: prev.room_id ?? null, tp_id: prev.tp_id, label: prev.label, note: prev.note }], CONFLICT_COLS);
        else await api.remove('planning_cells', { day: o.day, group_code: o.group, part: o.part ?? 'J', seq: o.seq ?? 1 });
      }
    };
    void act(run, { ok, tables: ['planning_cells'], undo });
  };
  const change = (day: string, group: string, part: Part, seq: number, value: string) => apply([{ day, group, part, seq, value }], 'Case modifiée.');

  /** Enseignants d'une case (comptes et noms libres), annulable */
  const setTeachers = (c: PlanningCell, ids: string[], labels: string[]) => {
    const key = { day: c.day, group_code: c.group_code, part: c.part ?? 'J', seq: c.seq ?? 1 };
    if (ids.join() === (c.teacher_ids ?? []).join() && labels.join() === (c.teacher_labels ?? []).join()) return;
    void act(() => api.update('planning_cells', key, { teacher_ids: ids.slice(0, 6), teacher_labels: labels }), {
      ok: 'Enseignants modifiés.', tables: ['planning_cells'],
      undo: () => api.update('planning_cells', key, { teacher_ids: c.teacher_ids ?? [], teacher_labels: c.teacher_labels ?? [] }),
    });
  };

  /** Salles supplémentaires d'un cours (annulable) */
  const setExtraRooms = (c: PlanningCell, ids: string[]) => {
    const key = { day: c.day, group_code: c.group_code, part: c.part ?? 'J', seq: c.seq ?? 1 };
    void act(() => api.update('planning_cells', key, { extra_room_ids: ids.slice(0, 3) }), {
      ok: 'Salles modifiées.', tables: ['planning_cells'], undo: () => api.update('planning_cells', key, { extra_room_ids: c.extra_room_ids ?? [] }),
    });
  };

  /** Change la salle d'une case (annulable) */
  const setRoom = (c: PlanningCell, room: string) =>
    void act(() => api.update('planning_cells', { day: c.day, group_code: c.group_code, part: c.part ?? 'J', seq: c.seq ?? 1 }, { room_id: room || null }), {
      ok: room ? 'Salle modifiée.' : 'Salle retirée.', tables: ['planning_cells'],
      undo: () => api.update('planning_cells', { day: c.day, group_code: c.group_code, part: c.part ?? 'J', seq: c.seq ?? 1 }, { room_id: c.room_id ?? null }),
    });

  const drop = (e: React.DragEvent, day: string, group: string, part: Part) => {
    e.preventDefault();
    const [sd, sg, sp = 'J', sq = '1'] = e.dataTransfer.getData('text/plain').split('|');
    const src = cells.get(cellKey(sd, sg, sp as Part, Number(sq)));
    const value = cellValue(src);
    if (!sd || !sg || !value || (sd === day && sg === group && sp === part && sq === '1')) return;
    const copy: CellOp = { day, group, part, seq: 1, value, room: src?.room_id ?? null };
    apply(e.shiftKey ? [copy, { day: sd, group: sg, part: sp as Part, seq: Number(sq), value: '' }] : [copy], e.shiftKey ? 'Case déplacée.' : 'Case copiée.');
  };

  const rooms = data.rooms.filter((r) => r.active);
  const roomName = (id: string | null | undefined) => (id ? data.rooms.find((r) => r.id === id)?.name ?? '' : '');
  /** Toutes les salles d'un cours : la principale puis les supplémentaires */
  const roomsLabel = (c: PlanningCell | undefined) => [c?.room_id, ...(c?.extra_room_ids ?? [])].map(roomName).filter(Boolean).join(' + ');
  /** Parties de journée affichées un jour donné : celles du réglage, plus celles qui contiennent déjà des cases */
  const partsOf = (d: string): Part[] => {
    const conf = dayParts[isoDow(parseISO(d))] ?? ['J'];
    return PARTS.filter((p) => conf.includes(p) || groups.some((g) => cells.has(cellKey(d, g, p))));
  };
  /** Cours visibles dans une demi-journée : ceux qui existent, plus ceux que l'on vient d'ajouter avec « + cours » */
  const [more, setMore] = useState<Record<string, number>>({});
  const seqsOf = (d: string, g: string, part: Part) => {
    let max = 1;
    for (let s = 2; s <= MAX_SEQ; s++) if (cells.has(cellKey(d, g, part, s))) max = s;
    return Math.max(max, more[`${d}|${g}|${part}`] ?? 1);
  };

  const [copyFrom, setCopyFrom] = useState(() => iso(mondayOf(new Date())));
  const [copyTo, setCopyTo] = useState(() => iso(addDays(mondayOf(new Date()), 7)));
  const [overwrite, setOverwrite] = useState(false);
  const [carousel, setCarousel] = useState(false);
  const [rounds, setRounds] = useState(() => groups.length);
  const copyWeek = () => {
    const blocked = (d: string) => !!periodOn(d, data.calendar_periods);
    const from = iso(mondayOf(parseISO(copyFrom)));
    const to = iso(mondayOf(parseISO(copyTo)));
    const ops = carousel
      ? carouselOps(cells, groups, from, to, Math.min(Math.max(1, rounds), 40), { overwrite, blocked })
      : copyWeekOps(cells, groups, from, to, { overwrite, blocked });
    if (!ops.length) return void act(() => Promise.reject(new Error('Rien à copier : la semaine source est vide, ou la cible est déjà remplie.')));
    apply(ops, `${ops.length} case${ops.length > 1 ? 's' : ''} copiée${ops.length > 1 ? 's' : ''}.`);
  };

  const exportCsv = () => {
    const rows: Array<Array<string>> = [['Semaine', 'Jour', 'Date', ...groups]];
    for (const m of months) for (const d of m.days) {
      const p = periodOn(d, data.calendar_periods);
      for (const part of p ? partsOf(d).slice(0, 1) : partsOf(d)) {
        rows.push([String(isoWeek(d)), DAY_LONG[isoDow(parseISO(d)) - 1] + (part === 'J' ? '' : ` (${PART_LABEL[part].toLowerCase()})`), fmtDate(d), ...groups.map((g) => {
          if (p) return p.label;
          const c = cells.get(cellKey(d, g, part));
          const tp = c?.tp_id ? tpById.get(c.tp_id) : undefined;
          const room = roomsLabel(c);
          return (tp ? `${domainLabel(tp.domain)} (${courseTeachers(c, tp, who).join(' / ')})` : c?.label ?? '') + (room && (tp || c?.label) ? ` – ${room}` : '');
        })]);
      }
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
      {canWrite && <PlanningImport />}
      {canWrite && (
        <details className="add no-print">
          <summary>Copier une semaine vers une autre</summary>
          <div className="add-body tools">
            <label className="row">De la semaine du <input className="in" type="date" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} /></label>
            <label className="row">vers la semaine du <input className="in" type="date" value={copyTo} onChange={(e) => setCopyTo(e.target.value)} /></label>
            <label className="row"><input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} /> Remplacer les cases déjà remplies</label>
            <label className="row"><input type="checkbox" checked={carousel} onChange={(e) => setCarousel(e.target.checked)} /> En carrousel : les groupes tournent d’une semaine à l’autre</label>
            {carousel && <label className="row">sur <input className="in" type="number" min={1} max={40} style={{ width: 70 }} aria-label="Nombre de semaines du carrousel" value={rounds} onChange={(e) => setRounds(Number(e.target.value) || 1)} /> semaine{rounds > 1 ? 's' : ''}</label>}
            <button type="button" className="btn sm" onClick={copyWeek}>{carousel ? `Copier en carrousel (${level})` : `Copier (${level})`}</button>
          </div>
          {carousel && (
            <p className="muted small add-body">
              Exemple avec cette semaine source : la 1re semaine cible donne à <b>{groups[1 % groups.length]}</b> ce que fait <b>{groups[0]}</b>
              {groups.length > 2 && <>, à <b>{groups[2 % groups.length]}</b> ce que fait <b>{groups[1]}</b></>}…, la 2e semaine décale d’un cran de plus, et ainsi de suite en revenant au début après {groups.length} semaines. Les jours de vacances et les jours fériés sont ignorés.
            </p>
          )}
          <p className="muted small add-body">Copie lundi à vendredi des groupes de {level} ; les vacances et jours fériés de la cible sont ignorés. Astuce : glissez la poignée ⠿ d’une case sur une autre pour la copier (avec Maj : la déplacer).</p>
        </details>
      )}
      <div className="scroll">
        {shownMonths.map((m) => (
          <table key={m.key} className="sem">
            <caption>{m.label}</caption>
            <thead><tr><th>Sem.</th><th>Jour</th><th>Date</th>{groups.map((g) => <th key={g}>{g}</th>)}</tr></thead>
            <tbody>
              {m.days.flatMap((d, i) => {
                const dow = isoDow(parseISO(d));
                const p = periodOn(d, data.calendar_periods);
                const newWeek = i > 0 && dow === weekdays[0];
                return (p ? partsOf(d).slice(0, 1) : partsOf(d)).map((part, pi) => (
                  <tr key={`${d}-${part}`} className={(p ? 'off ' : '') + (newWeek && pi === 0 ? 'wk-start' : '')}>
                    <td className="k">{pi === 0 ? isoWeek(d) : ''}</td>
                    <td className="k">{DAY_SHORT[dow - 1]}{part !== 'J' && !p && <span className="part-tag"> {part === 'M' ? 'matin' : 'ap.-midi'}</span>}</td>
                    <td className="k">{pi === 0 ? parseISO(d).getDate() : ''}</td>
                    {p ? <td colSpan={groups.length}>{p.label}</td> : groups.map((g) => {
                      const n = seqsOf(d, g, part);
                      const mkey = `${d}|${g}|${part}`;
                      const mine = onlyMine && Array.from({ length: n }, (_, i) => cells.get(cellKey(d, g, part, i + 1))).some((c) => c?.tp_id && isMyCell(c, tpById.get(c.tp_id), profile));
                      return (
                        <td key={g} className={mine ? 'mine' : ''}
                          onDragOver={canWrite ? (e) => e.preventDefault() : undefined} onDrop={canWrite ? (e) => drop(e, d, g, part) : undefined}>
                          {Array.from({ length: n }, (_, i) => i + 1).map((seq) => {
                            const c = cells.get(cellKey(d, g, part, seq));
                            const tp = c?.tp_id ? tpById.get(c.tp_id) : undefined;
                            const value = cellValue(c);
                            const known = !!c?.label && SPECIAL_LABELS.includes(c.label);
                            const where = `${g}, ${DAY_LONG[dow - 1]} ${fmtShort(d)}${part === 'J' ? '' : ` ${PART_LABEL[part].toLowerCase()}`}${n > 1 ? `, cours ${seq}` : ''}`;
                            const warn = warnings.get(cellKey(d, g, part, seq));
                            return (
                              <div key={seq} className={`course ${tp ? `cc ${domainClass(tp.domain)}` : ''}`}>
                                {canWrite && value && <span className="grip no-print" draggable aria-hidden="true" title="Glisser pour copier (Maj : déplacer)"
                                  onDragStart={(e) => { e.dataTransfer.setData('text/plain', `${d}|${g}|${part}|${seq}`); e.dataTransfer.effectAllowed = 'copyMove'; }}>⠿</span>}
                                {warn && <span className="cell-warn" role="img" aria-label={`Attention : ${warn.join(' ; ')}`} title={warn.join('\n')}>⚠</span>}
                                <select className={`pc ${tp ? '' : value ? 'lab' : 'empty'}`} value={value} disabled={!canWrite}
                                  aria-label={where} onChange={(e) => change(d, g, part, seq, e.target.value)}>
                                  <option value="">—</option>
                                  {c?.tp_id && !tp && <option value={`tp:${c.tp_id}`}>(TP d’un autre niveau)</option>}
                                  {sequences.length > 0 && <optgroup label="Séquences">{sequences.map((f) => <option key={f.id} value={`lab:${f.title.slice(0, 60)}`}>{f.title}</option>)}</optgroup>}
                                  <optgroup label="TP">{tps.map((t) => <option key={t.id} value={`tp:${t.id}`}>{t.code ?? t.title}</option>)}</optgroup>
                                  <optgroup label="Autres">
                                    {SPECIAL_LABELS.map((l) => <option key={l} value={`lab:${l}`}>{l}</option>)}
                                    {c?.label && !known && !sequences.some((f) => f.title.slice(0, 60) === c.label) && <option value={`lab:${c.label}`}>{c.label}</option>}
                                  </optgroup>
                                </select>
                                {c && value && (canWrite ? (
                                  <select className="pc-room" value={c.room_id ?? ''} aria-label={`Salle, ${where}`} onChange={(e) => setRoom(c, e.target.value)}>
                                    <option value="">Salle…</option>
                                    {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                                    {c.room_id && !rooms.some((r) => r.id === c.room_id) && <option value={c.room_id}>{roomName(c.room_id)}</option>}
                                  </select>
                                ) : c.room_id ? <span className="who">{roomName(c.room_id)}</span> : null)}
                                {c && value && canWrite && c.room_id && (
                                  <details className="pc-teachers no-print">
                                    <summary aria-label={`Autres salles, ${where}`}>Autres salles{c.extra_room_ids?.length ? ` (${c.extra_room_ids.length})` : ''}</summary>
                                    <div className="stack">
                                      {rooms.filter((r) => r.id !== c.room_id).map((r) => (
                                        <label key={r.id} className="row small"><input type="checkbox" checked={(c.extra_room_ids ?? []).includes(r.id)} disabled={!(c.extra_room_ids ?? []).includes(r.id) && (c.extra_room_ids ?? []).length >= 3}
                                          onChange={(e) => setExtraRooms(c, e.target.checked ? [...(c.extra_room_ids ?? []), r.id] : (c.extra_room_ids ?? []).filter((x) => x !== r.id))} /> {r.name}</label>
                                      ))}
                                    </div>
                                  </details>
                                )}
                                {!canWrite && c?.extra_room_ids?.length ? <span className="who">+ {c.extra_room_ids.map(roomName).filter(Boolean).join(' + ')}</span> : null}
                                {(tp || c?.teacher_ids?.length || c?.teacher_labels?.length) ? <span className="who">{courseTeachers(c, tp, who).join(' / ')}</span> : null}
                                {c && value && canWrite && (
                                  <details className="pc-teachers no-print">
                                    <summary aria-label={`Enseignants, ${where}`}>Enseignants{(c.teacher_ids?.length || c.teacher_labels?.length) ? ` (${(c.teacher_ids?.length ?? 0) + (c.teacher_labels?.length ?? 0)})` : ''}</summary>
                                    <div className="stack">
                                      {data.profiles.filter((p) => p.active).map((p) => (
                                        <label key={p.id} className="row small"><input type="checkbox" checked={(c.teacher_ids ?? []).includes(p.id)} onChange={(e) => setTeachers(c, e.target.checked ? [...(c.teacher_ids ?? []), p.id] : (c.teacher_ids ?? []).filter((x) => x !== p.id), c.teacher_labels ?? [])} /> {who(p.id)}</label>
                                      ))}
                                      <input className="in" aria-label={`Autres enseignants, ${where}`} placeholder="Autres (séparés par /)" defaultValue={(c.teacher_labels ?? []).join(' / ')} onBlur={(e) => setTeachers(c, c.teacher_ids ?? [], e.target.value.split('/').map((x) => x.trim()).filter(Boolean).slice(0, 6))} />
                                    </div>
                                  </details>
                                )}
                                {c?.note && <span className="who">{c.note}</span>}
                                {canWrite && seq > 1 && (
                                  <button type="button" className="btn ghost sm no-print course-del" aria-label={`Retirer le cours ${seq}, ${g}, ${fmtShort(d)}`}
                                    onClick={() => { if (value || c?.note) change(d, g, part, seq, ''); if (seq === n) setMore((m) => ({ ...m, [mkey]: Math.max(1, n - 1) })); }}>✕</button>
                                )}
                              </div>
                            );
                          })}
                          {canWrite && n < MAX_SEQ && cellValue(cells.get(cellKey(d, g, part, n))) && (
                            <button type="button" className="btn ghost sm no-print course-add" aria-label={`Ajouter un cours, ${g}, ${fmtShort(d)}${part === 'J' ? '' : ` ${PART_LABEL[part].toLowerCase()}`}`}
                              onClick={() => setMore((m) => ({ ...m, [mkey]: n + 1 }))}>+ cours</button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ));
              })}
            </tbody>
          </table>
        ))}
      </div>
    </section>
  );
}

function Week({ groups, cells, weekdays, dayParts, tpById }: CommonProps & { tpById: Map<string, Tp> }) {
  const { data, who } = useStore();
  const { profile } = useAuth();
  const [start, setStart] = useState(() => iso(mondayOf(new Date())));
  const [onlyMine, setOnlyMine] = useState(false);
  const narrow = useMedia('(max-width: 720px)');
  const [focus, setFocus] = useState(() => Math.max(0, weekdays.indexOf(Math.min(Math.max(new Date().getDay(), 1), 5))));
  const allDays = weekdays.map((n) => iso(addDays(parseISO(start), n - 1)));
  const f = Math.min(focus, allDays.length - 1);
  // Sur téléphone : un jour à la fois
  const days = narrow ? [allDays[f]] : allDays;
  const roomName = (id: string | null | undefined) => (id ? data.rooms.find((r) => r.id === id)?.name ?? '' : '');
  const roomsLabel = (c: PlanningCell | undefined) => [c?.room_id, ...(c?.extra_room_ids ?? [])].map(roomName).filter(Boolean).join(' + ');
  // Colonnes : chaque jour, découpé en matin / après-midi selon le réglage ou les cases existantes
  const cols = days.flatMap((d) => {
    const conf = dayParts[isoDow(parseISO(d))] ?? ['J'];
    const parts = PARTS.filter((p) => conf.includes(p) || groups.some((g) => cells.has(cellKey(d, g, p))));
    // Une colonne par cours : une demi-journée avec plusieurs cours en compte plusieurs
    const cs = parts.flatMap((part) => {
      let max = 1;
      for (const g of groups) for (let s = 2; s <= MAX_SEQ; s++) if (cells.has(cellKey(d, g, part, s))) max = Math.max(max, s);
      return Array.from({ length: max }, (_, i) => ({ d, part, seq: i + 1, multi: max > 1 }));
    });
    return cs.map((c, i) => ({ ...c, first: i === 0, span: cs.length }));
  });
  const end = allDays[allDays.length - 1];

  return (
    <section className="panel">
      {narrow && (
        <div className="row between day-pager no-print">
          <button className="btn sm" disabled={f === 0} aria-label="Jour précédent" onClick={() => setFocus(f - 1)}>‹</button>
          <b>{DAY_LONG[isoDow(parseISO(allDays[f])) - 1]} {fmtShort(allDays[f])}</b>
          <button className="btn sm" disabled={f >= allDays.length - 1} aria-label="Jour suivant" onClick={() => setFocus(f + 1)}>›</button>
        </div>
      )}
      <div className="row between no-print">
        <h2>Semaine {isoWeek(start)}, du {fmtShort(allDays[0])} au {fmtShort(end)}</h2>
        <div className="row">
          <button className="btn ghost sm" onClick={() => setStart(iso(addDays(parseISO(start), -7)))}>← Précédente</button>
          <button className="btn ghost sm" onClick={() => setStart(iso(mondayOf(new Date())))}>Aujourd’hui</button>
          <button className="btn ghost sm" onClick={() => setStart(iso(addDays(parseISO(start), 7)))}>Suivante →</button>
          <button className="btn ghost sm" onClick={() => window.print()}>Imprimer</button>
        </div>
      </div>
      <label className="row no-print"><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> Mes cours seulement</label>
      <h2 className="only-print">Emploi du temps, semaine {isoWeek(start)} du {fmtDate(allDays[0])} au {fmtDate(end)}</h2>
      <div className="stack">
        {groups.map((g) => (
          <div key={g} className="scroll">
            <table className="wk">
              <thead><tr><th>{g}</th>{cols.map(({ d, part, seq, multi }) => <th key={d + part + seq}>{DAY_LONG[isoDow(parseISO(d)) - 1]}<br /><span className="small">{fmtShort(d)}{part !== 'J' && ` · ${PART_LABEL[part].toLowerCase()}`}{multi && ` · cours ${seq}`}</span></th>)}</tr></thead>
              <tbody>
                {(['Domaine', 'Enseignant', 'Salle', 'TP / activité', 'Objectif', 'Compétences'] as const).map((row, ri) => (
                  <tr key={row}>
                    <th className="row-h">{row}</th>
                    {cols.map(({ d, part, seq, first, span }) => {
                      const k = d + part + seq;
                      const p = periodOn(d, data.calendar_periods);
                      if (p) return ri === 0 && first ? <td key={k} className="dim" rowSpan={6} colSpan={span}>{p.label}</td> : null;
                      const c = cells.get(cellKey(d, g, part, seq));
                      const tp = c?.tp_id ? tpById.get(c.tp_id) : undefined;
                      if (onlyMine && !isMyCell(c, tp, profile)) return <td key={k} className="dim">{ri === 0 ? '·' : ''}</td>;
                      if (ri === 2) return <td key={k} className={tp ? `dom sub ${domainClass(tp.domain)}` : ''}>{c && (tp || c.label) ? roomsLabel(c) : ''}</td>;
                      if (!tp) return <td key={k} className={c?.label ? 'dim' : ''}>{ri === 0 ? c?.label ?? '' : ri === 1 ? courseTeachers(c, undefined, who).join(' / ') : ri === 4 ? c?.note ?? '' : ''}</td>;
                      if (ri === 0) return <td key={k} className={`dom ${domainClass(tp.domain)}`} title={tp.code ?? undefined}>{domainLabel(tp.domain)}</td>;
                      if (ri === 1) return <td key={k} className={`dom sub ${domainClass(tp.domain)}`}>{courseTeachers(c, tp, who).join(' / ')}</td>;
                      if (ri === 3) return <td key={k} className={`dom sub ${domainClass(tp.domain)}`}>{tp.title}</td>;
                      if (ri === 4) return <td key={k} className={`dom sub ${domainClass(tp.domain)}`}>{tp.objective}</td>;
                      return <td key={k} className={`dom sub ${domainClass(tp.domain)}`}>{tp.competences.join(' · ')}</td>;
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
    () => cells.filter((c) => isMyCell(c, c.tp_id ? tpById.get(c.tp_id) : undefined, profile)).sort((a, b) => a.day.localeCompare(b.day) || (a.part ?? 'J').localeCompare(b.part ?? 'J') || (a.seq ?? 1) - (b.seq ?? 1) || a.group_code.localeCompare(b.group_code)),
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
            <thead><tr><th>Date</th><th>Groupe</th><th>Salle</th><th>TP</th><th>Objectif</th></tr></thead>
            <tbody>{list.map((c) => {
              const tp = tpById.get(c.tp_id!)!;
              return <tr key={cellKey(c.day, c.group_code, c.part ?? 'J', c.seq ?? 1)}>
                <td>{DAY_LONG[isoDow(parseISO(c.day)) - 1]} {fmtDate(c.day)}{c.part && c.part !== 'J' ? ` (${PART_LABEL[c.part].toLowerCase()})` : ''}</td><td>{c.group_code}</td>
                <td>{data.rooms.find((r) => r.id === c.room_id)?.name ?? ''}</td>
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

function Needs() {
  const { data, systemById, tpById } = useStore();
  const [start, setStart] = useState(() => iso(mondayOf(new Date())));
  const days = [0, 1, 2, 3, 4].map((n) => iso(addDays(parseISO(start), n)));
  const { systems, tools } = useMemo(() => weekNeeds(data.planning_cells, days, tpById), [data.planning_cells, tpById, start]);
  const toolById = new Map(data.tools.map((t) => [t.id, t]));
  const rows = (m: Map<string, Array<{ day: string; group: string; tp: string }>>, name: (id: string) => { label: string; qty: number; bad: boolean } | undefined, kind: string) =>
    [...m.entries()].map(([id, uses]) => ({ id, kind, info: name(id), uses, groups: [...new Set(uses.map((u) => u.group))] })).filter((r) => r.info);
  const all = [
    ...rows(systems, (id) => { const x = systemById.get(id); return x && { label: x.name, qty: x.qty, bad: x.state !== 'service' }; }, 'Système'),
    ...rows(tools, (id) => { const x = toolById.get(id); return x && { label: x.name, qty: x.qty, bad: x.state === 'hs' }; }, 'Outil'),
  ].sort((a, b) => b.groups.length - a.groups.length || a.info!.label.localeCompare(b.info!.label, 'fr'));
  const exportCsv = () => downloadBlob(`besoins-${start}.csv`, toCsv([['Type', 'Élément', 'Quantité disponible', 'Groupes', 'TP'], ...all.map((r) => [r.kind, r.info!.label, r.info!.qty, r.groups.join(' '), [...new Set(r.uses.map((u) => u.tp))].join(' ')])]));
  return (
    <section className="panel">
      <div className="row between no-print">
        <h2>Besoins en matériel, semaine du {fmtShort(days[0])}</h2>
        <div className="row">
          <button className="btn ghost sm" onClick={() => setStart(iso(addDays(parseISO(start), -7)))}>← Précédente</button>
          <button className="btn ghost sm" onClick={() => setStart(iso(mondayOf(new Date())))}>Aujourd’hui</button>
          <button className="btn ghost sm" onClick={() => setStart(iso(addDays(parseISO(start), 7)))}>Suivante →</button>
          <button className="btn ghost sm" onClick={exportCsv}>Exporter en CSV</button>
          <button className="btn ghost sm" onClick={() => window.print()}>Imprimer</button>
        </div>
      </div>
      {all.length === 0 ? <Empty>Aucun TP de cette semaine n’a de système ou d’outil associé. Associez-les dans Planning des TP, Catalogue.</Empty> : (
        <div className="scroll"><table className="tbl">
          <thead><tr><th>Élément</th><th>Type</th><th className="num">Disponible</th><th>Groupes</th><th>TP</th></tr></thead>
          <tbody>{all.map((r) => (
            <tr key={r.kind + r.id}>
              <td><b>{r.info!.label}</b>{r.info!.bad && <span className="chip bad" style={{ marginLeft: 6 }}>indisponible</span>}</td>
              <td>{r.kind}</td><td className="num">{r.info!.qty}</td>
              <td>{r.groups.join(', ')}{r.groups.length > 1 && <span className="chip warn" style={{ marginLeft: 6 }}>{r.groups.length} groupes</span>}</td>
              <td>{[...new Set(r.uses.map((u) => u.tp))].join(', ')}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </section>
  );
}
