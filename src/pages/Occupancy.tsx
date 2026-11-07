import { useMemo, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/state/auth';
import { useAct, useStore } from '@/state/store';
import { GROUP_CODES, ROOM_KINDS, levelOfGroup } from '@/lib/domain';
import { addDays, fmtDayLong, fmtShort, iso, mondayOf, minToHM, parseISO, toMin } from '@/lib/dates';
import { buildOccurrences, freeRooms, roomLoads } from '@/lib/occupancy';
import { sessionConflicts } from '@/lib/conflicts';
import { Empty, Field, Options, PageHead } from '@/components/ui';
import { WeekGrid, type GridBlock } from '@/components/WeekGrid';

export default function Occupancy() {
  const { data, roomById, tpById, who } = useStore();
  const { profile, canWrite } = useAuth();
  const act = useAct();
  const [weekStart, setWeekStart] = useState(() => iso(mondayOf(new Date())));
  const [sel, setSel] = useState('');
  const [find, setFind] = useState({ date: iso(new Date()), start: '08:00', end: '10:00', seats: '' });
  const [group, setGroup] = useState('');

  const days = Array.from({ length: 5 }, (_, i) => iso(addDays(parseISO(weekStart), i)));
  const { occs } = useMemo(
    () => buildOccurrences(data.timetable_slots, data.sessions, days[0], days[4]),
    [data.timetable_slots, data.sessions, days[0], days[4]], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const rooms = data.rooms.filter((r) => r.active);
  const loads = roomLoads(rooms, occs, days);
  const selected = roomById.get(sel) ?? rooms[0];

  const blocks: GridBlock[] = selected
    ? occs.filter((o) => o.roomId === selected.id).map((o) => ({
        id: o.key,
        day: days.indexOf(o.date),
        start: o.start,
        end: o.end,
        title: o.groupCode ?? o.label ?? 'Réservé',
        sub: who(o.teacherId, o.teacherLabel),
        tone: o.groupCode ? `l-${levelOfGroup(o.groupCode) ?? 'Seconde'}` : 'res',
        tag: o.tpId ? tpById.get(o.tpId)?.code ?? undefined : undefined,
      }))
    : [];

  const startM = toMin(find.start);
  const endM = toMin(find.end);
  const findDay = buildOccurrences(data.timetable_slots, data.sessions, find.date, find.date).occs;
  const free = endM > startM ? freeRooms(data.rooms, findDay, find.date, startM, endM, Number(find.seats) || 0) : [];

  const reserve = async (roomId: string, e: FormEvent) => {
    e.preventDefault();
    const issues = sessionConflicts(
      { date: find.date, start: startM, end: endM, roomId, groupCode: group || null, teacherId: profile?.id ?? null },
      data.timetable_slots, data.sessions, data.rooms,
    );
    if (issues.length) {
      await act(() => Promise.reject(new Error(issues[0])));
      return;
    }
    await act(
      () => api.insert('sessions', {
        slot_id: null, session_date: find.date, start_time: find.start, end_time: find.end, room_id: roomId,
        group_code: group || null, label: group ? null : 'Réservation', status: 'planned',
      }),
      { ok: `Salle réservée le ${fmtDayLong(find.date)}.`, tables: ['sessions'] },
    );
  };

  const shift = (n: number) => setWeekStart(iso(addDays(parseISO(weekStart), n)));

  return (
    <>
      <PageHead tab="occupation" title="Occupation des salles" />
      <section className="panel">
        <div className="row between">
          <h2>Semaine du {fmtShort(days[0])} au {fmtShort(days[4])}</h2>
          <div className="row">
            <button className="btn ghost sm" onClick={() => shift(-7)}>← Précédente</button>
            <button className="btn ghost sm" onClick={() => setWeekStart(iso(mondayOf(new Date())))}>Aujourd’hui</button>
            <button className="btn ghost sm" onClick={() => shift(7)}>Suivante →</button>
          </div>
        </div>
        {rooms.length === 0 ? <Empty>Aucune salle active.</Empty> : (
          <div className="scroll">
            <table className="tbl">
              <thead>
                <tr><th>Salle</th>{days.map((d) => <th key={d} className="num">{fmtShort(d)}</th>)}<th>Taux de la semaine</th></tr>
              </thead>
              <tbody>
                {rooms.map((r) => {
                  const l = loads.find((x) => x.roomId === r.id)!;
                  const pct = Math.round(l.rate * 100);
                  return (
                    <tr key={r.id} className={selected?.id === r.id ? 'sel' : ''}>
                      <td><button className="rowbtn" onClick={() => setSel(r.id)} aria-pressed={selected?.id === r.id}><b>{r.name}</b></button><span className="sub">{ROOM_KINDS[r.kind]}{r.shared ? ' · partagée' : ''}</span></td>
                      {days.map((d) => <td key={d} className="num">{l.byDay[d] ? `${Math.round(l.byDay[d] / 6) / 10} h` : '—'}</td>)}
                      <td>
                        <div className="rate"><div className="bar"><i className={pct >= 80 ? 'hi' : pct >= 50 ? 'mid' : ''} style={{ width: `${pct}%` }} /></div><span>{pct} %</span></div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {selected && (
        <section className="panel">
          <h2>{selected.name}, détail de la semaine</h2>
          {blocks.length ? <WeekGrid days={days} blocks={blocks} label={`Occupation de ${selected.name}`} /> : <Empty>Salle libre toute la semaine.</Empty>}
        </section>
      )}
      <section className="panel">
        <h2>Trouver une salle libre</h2>
        <div className="tools">
          <Field label="Jour"><input className="in" type="date" value={find.date} onChange={(e) => setFind({ ...find, date: e.target.value })} /></Field>
          <Field label="De"><input className="in" type="time" step={300} value={find.start} onChange={(e) => setFind({ ...find, start: e.target.value })} /></Field>
          <Field label="À"><input className="in" type="time" step={300} value={find.end} onChange={(e) => setFind({ ...find, end: e.target.value })} /></Field>
          <Field label="Places minimum"><input className="in" type="number" min={0} value={find.seats} onChange={(e) => setFind({ ...find, seats: e.target.value })} /></Field>
          {canWrite && (
            <Field label="Réserver pour le groupe">
              <select className="in" value={group} onChange={(e) => setGroup(e.target.value)}>
                <Options placeholder="Sans groupe" items={GROUP_CODES.map((g) => [g, g])} />
              </select>
            </Field>
          )}
        </div>
        {endM <= startM ? <div className="alert soft">L’heure de fin doit être après le début.</div> : free.length === 0 ? <Empty>Aucune salle libre sur ce créneau.</Empty> : (
          <div className="stack">
            {free.map((r) => (
              <form key={r.id} className="row between" onSubmit={(e) => void reserve(r.id, e)}>
                <div><b>{r.name}</b> <span className="muted small">{ROOM_KINDS[r.kind]}{r.seats ? ` · ${r.seats} places` : ''}{r.shared ? ' · partagée' : ''}</span></div>
                {canWrite && <button className="btn sm" type="submit">Réserver {minToHM(startM)}–{minToHM(endM)}</button>}
              </form>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
