import { useMemo } from 'react';
import { api } from '@/lib/api';
import { useAct, useStore } from '@/state/store';
import { usePersisted } from '@/hooks/usePersisted';
import { addDays, fmtDate, iso, mondayOf, minToHM, parseISO, toMin } from '@/lib/dates';
import { periodOn } from '@/lib/calendar';
import { periodsOf } from '@/lib/schedule';
import { SPECIAL_LABELS, cellPatch } from '@/lib/semainier';
import { carouselGrid, emptyStation, gridConflicts, type Grid, type Station } from '@/lib/lundi';
import type { Level, Part, Session, Tp } from '@/lib/types';
import { Seg } from '@/components/ui';

type Mode = 'carrousel' | 'construire';
const MODES: readonly Mode[] = ['carrousel', 'construire'];
const SIDE: readonly Exclude<Part, 'J'>[] = ['M', 'A'];

const valueOf = (s: Session): string => (s.tp_id ? `tp:${s.tp_id}` : s.label ? `lab:${s.label}` : '');

/** Planning du lundi, heure par heure : un enseignant et une salle par groupe et par séance, en carrousel ou à construire à la main */
export function Lundi({ groups, tps, level, canWrite }: { groups: string[]; tps: Tp[]; level: Level; canWrite: boolean }) {
  const { data, who } = useStore();
  const act = useAct();
  const [mode, setMode] = usePersisted<Mode>('lundi-mode', 'carrousel', MODES);
  const [part, setPart] = usePersisted<Exclude<Part, 'J'>>('lundi-part', 'M', SIDE);
  const [date, setDate] = usePersisted<string>('lundi-date', iso(mondayOf(new Date())));
  const monday = iso(mondayOf(parseISO(date)));
  const periods = useMemo(() => periodsOf(1, part), [part]);
  const rooms = data.rooms.filter((r) => r.active);
  const teachers = data.profiles.filter((p) => p.active);
  const off = periodOn(monday, data.calendar_periods);

  // Séances déjà enregistrées pour ce lundi, ce niveau et cette demi-journée (hors créneaux récurrents)
  const existing = useMemo(
    () => data.sessions.filter((s) => s.session_date === monday && !s.slot_id && s.status !== 'cancelled' && s.group_code && groups.includes(s.group_code)
      && periods.some((p) => toMin(s.start_time) === p.start)),
    [data.sessions, monday, groups, periods],
  );
  const grid: Grid = periods.map((p) => groups.map((g) => {
    const s = existing.find((x) => x.group_code === g && toMin(x.start_time) === p.start);
    return s ? { teacherId: s.teacher_id, roomId: s.room_id, value: valueOf(s) } : null;
  }));

  const commit = (next: Grid, ok: string) => {
    const replaced = new Set(existing.map((s) => s.id));
    const conflicts = gridConflicts({ date: monday, groups, periods, grid: next }, data.timetable_slots, data.sessions, data.rooms, replaced);
    const before = existing;
    let created: string[] = [];
    const rows = next.flatMap((row, b) => row.map((st, g) => (emptyStation(st) ? null : {
      session_date: monday, start_time: minToHM(periods[b].start), end_time: minToHM(periods[b].end), group_code: groups[g],
      room_id: st!.roomId, teacher_id: st!.teacherId, teacher_label: null, ...cellPatch(st!.value), note: null, status: 'planned',
    }))).filter((r): r is NonNullable<typeof r> => !!r);
    return act(async () => {
      if (conflicts.length) throw new Error(conflicts.slice(0, 3).join(' '));
      if (replaced.size) await api.remove('sessions', { id: [...replaced] });
      if (rows.length) created = (await api.insert<Session>('sessions', rows)).map((s) => s.id);
    }, {
      ok, tables: ['sessions'],
      undo: async () => {
        if (created.length) await api.remove('sessions', { id: created });
        if (before.length) await api.insert('sessions', before.map(({ id: _i, created_at: _c, created_by: _b, ...r }) => r));
      },
    });
  };

  const setCell = (b: number, g: number, patch: Partial<Station>) => {
    const next: Grid = grid.map((r) => [...r]);
    const cur = next[b][g] ?? { teacherId: null, roomId: null, value: '' };
    next[b][g] = { ...cur, ...patch };
    if (mode === 'carrousel' && b === 0) return commit(carouselGrid(next[0], periods.length), 'Première séance enregistrée, rotation appliquée aux suivantes.');
    return commit(next, 'Séance enregistrée.');
  };
  const reapply = () => commit(carouselGrid(grid[0], periods.length), 'Rotation appliquée aux séances suivantes.');
  const clear = () => commit(grid.map((r) => r.map(() => null)), 'Planning du lundi effacé.');

  const label = (st: Station | null) => !st ? '' : [st.teacherId ? who(st.teacherId) : '', st.roomId ? data.rooms.find((r) => r.id === st.roomId)?.name ?? '' : ''].filter(Boolean).join(' · ');
  const editable = (b: number) => canWrite && (mode === 'construire' || b === 0);

  return (
    <section className="panel stack lundi" aria-label="Planning du lundi">
      <div className="tools no-print">
        <button type="button" className="btn ghost sm" aria-label="Lundi précédent" onClick={() => setDate(iso(addDays(parseISO(monday), -7)))}>‹</button>
        <label className="row">Lundi <input className="in" type="date" value={monday} onChange={(e) => e.target.value && setDate(iso(mondayOf(parseISO(e.target.value))))} /></label>
        <button type="button" className="btn ghost sm" aria-label="Lundi suivant" onClick={() => setDate(iso(addDays(parseISO(monday), 7)))}>›</button>
        <Seg<Exclude<Part, 'J'>> label="Partie de la journée" value={part} onChange={setPart} items={[['M', 'Matin'], ['A', 'Après-midi']]} />
        <Seg<Mode> label="Mode" value={mode} onChange={setMode} items={[['carrousel', 'Carrousel'], ['construire', 'À construire']]} />
      </div>
      <p className="muted small no-print">
        {mode === 'carrousel'
          ? 'Carrousel : renseignez la première séance (quel enseignant, quelle salle, avec quel groupe). Les séances suivantes tournent automatiquement entre les groupes.'
          : 'À construire : chaque séance se règle indépendamment, heure par heure. Les cases vides ne créent rien.'}
      </p>
      <h2 className="print-only-title">{level} · lundi {fmtDate(monday)}</h2>
      {off && <div className="notice" role="status"><span>Ce lundi est en période « {off.label} » : pas de cours prévu.</span></div>}
      <div className="scroll">
        <table className="tbl lundi-grid" aria-label={`Planning du lundi ${fmtDate(monday)}`}>
          <thead><tr><th>Horaire</th>{groups.map((g) => <th key={g}>{g}</th>)}</tr></thead>
          <tbody>
            {periods.map((p, b) => (
              <tr key={p.start}>
                <th scope="row">{minToHM(p.start)} – {minToHM(p.end)}</th>
                {groups.map((g, gi) => {
                  const st = grid[b][gi];
                  const where = `${g}, ${minToHM(p.start)}`;
                  const tp = st?.value.startsWith('tp:') ? tps.find((t) => t.id === st.value.slice(3)) : undefined;
                  if (!editable(b)) return <td key={g} className={b > 0 && mode === 'carrousel' ? 'derived' : ''}>{label(st)}{st?.value && <span className="who">{tp ? tp.code ?? tp.title : st.value.slice(4)}</span>}</td>;
                  return (
                    <td key={g}>
                      <select className="in" aria-label={`Enseignant, ${where}`} value={st?.teacherId ?? ''} onChange={(e) => void setCell(b, gi, { teacherId: e.target.value || null })}>
                        <option value="">Enseignant…</option>
                        {teachers.map((t) => <option key={t.id} value={t.id}>{who(t.id)}</option>)}
                      </select>
                      <select className="in" aria-label={`Salle, ${where}`} value={st?.roomId ?? ''} onChange={(e) => void setCell(b, gi, { roomId: e.target.value || null })}>
                        <option value="">Salle…</option>
                        {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                      <select className="in" aria-label={`Activité, ${where}`} value={st?.value ?? ''} onChange={(e) => void setCell(b, gi, { value: e.target.value })}>
                        <option value="">Activité…</option>
                        <optgroup label="TP">{tps.map((t) => <option key={t.id} value={`tp:${t.id}`}>{t.code ?? t.title}</option>)}</optgroup>
                        <optgroup label="Autres">{[...SPECIAL_LABELS, 'À construire'].filter((l, i, a) => a.indexOf(l) === i).map((l) => <option key={l} value={`lab:${l}`}>{l}</option>)}</optgroup>
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canWrite && (
        <div className="actions no-print">
          {mode === 'carrousel' && <button type="button" className="btn" onClick={() => void reapply()}>Réappliquer la rotation</button>}
          <button type="button" className="btn ghost" disabled={!existing.length} onClick={() => void clear()}>Effacer ce planning</button>
        </div>
      )}
    </section>
  );
}
