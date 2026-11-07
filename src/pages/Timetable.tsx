import { useMemo, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/state/auth';
import { useAct, useStore } from '@/state/store';
import { GROUP_CODES, levelOfGroup } from '@/lib/domain';
import { DAY_LONG, addDays, fmtDate, hm, iso, mondayOf, schoolYearBounds, schoolYearOf, toMin } from '@/lib/dates';
import { slotConflicts } from '@/lib/conflicts';
import type { Slot } from '@/lib/types';
import { AddPanel, ConfirmButton, Empty, Field, Options, PageHead, Seg } from '@/components/ui';
import { WeekGrid, type GridBlock } from '@/components/WeekGrid';

type View = 'room' | 'group' | 'teacher';

export default function Timetable() {
  const { data, roomById, tpById, who } = useStore();
  const { profile, isAdmin, canWrite } = useAuth();
  const act = useAct();
  const [view, setView] = useState<View>('room');
  const [target, setTarget] = useState('');
  const [editing, setEditing] = useState<Slot | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [days, setDays] = useState<number[]>([1]);
  const [draft, setDraft] = useState({ room: '', group: '', start: '08:00', end: '10:00', teacher: profile?.id ?? '', label: '' });
  const [period, setPeriod] = useState(schoolYearBounds(schoolYearOf(new Date())));

  const rooms = data.rooms.filter((r) => r.active || r.id === editing?.room_id);
  const teachers = data.profiles.filter((p) => p.active);

  const options: Array<[string, string]> =
    view === 'room' ? data.rooms.map((r) => [r.id, r.name])
    : view === 'group' ? GROUP_CODES.map((g) => [g, g])
    : teachers.map((p) => [p.id, who(p.id)]);
  const current = options.some(([k]) => k === target) ? target : options[0]?.[0] ?? '';

  const mine = useMemo(
    () =>
      data.timetable_slots.filter((s) =>
        view === 'room' ? s.room_id === current : view === 'group' ? s.group_code === current : s.teacher_id === current,
      ),
    [data.timetable_slots, view, current],
  );

  const monday = mondayOf(new Date());
  const weekDays = Array.from({ length: 5 }, (_, i) => iso(addDays(monday, i)));
  const blocks: GridBlock[] = mine.map((s) => ({
    id: s.id,
    day: s.weekday - 1,
    start: toMin(s.start_time),
    end: toMin(s.end_time),
    title: view === 'group' ? roomById.get(s.room_id)?.name ?? '?' : s.group_code,
    sub: view === 'room' ? who(s.teacher_id, s.teacher_label) : view === 'group' ? who(s.teacher_id, s.teacher_label) : roomById.get(s.room_id)?.name,
    tone: `l-${levelOfGroup(s.group_code) ?? 'Seconde'}`,
    tag: s.tp_id ? tpById.get(s.tp_id)?.code ?? undefined : undefined,
    onClick: canWrite ? () => startEdit(s) : undefined,
  }));

  function startEdit(s: Slot) {
    setEditing(s);
    setDays([s.weekday]);
    setDraft({ room: s.room_id, group: s.group_code, start: hm(s.start_time), end: hm(s.end_time), teacher: s.teacher_id ?? '', label: s.label ?? '' });
    setPeriod({ from: s.valid_from, to: s.valid_to });
    window.scrollTo(0, 0);
  }
  const reset = () => {
    setEditing(null);
    setDays([1]);
    setFormKey((k) => k + 1);
  };

  const conflicts = useMemo(() => {
    if (!draft.room || !draft.group || draft.end <= draft.start) return draft.end <= draft.start ? ['L’heure de fin doit être après l’heure de début.'] : [];
    return days.flatMap((d) =>
      slotConflicts(
        { id: editing?.id, roomId: draft.room, groupCode: draft.group, teacherId: draft.teacher || null, weekday: d, start: toMin(draft.start), end: toMin(draft.end), from: period.from, to: period.to },
        data.timetable_slots, data.sessions, data.rooms,
      ),
    );
  }, [draft, days, period, editing, data.timetable_slots, data.sessions, data.rooms]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const base = {
      room_id: draft.room,
      group_code: draft.group,
      teacher_id: draft.teacher || null,
      teacher_label: draft.teacher ? null : String(f.get('teacher_label')).trim() || null,
      start_time: draft.start,
      end_time: draft.end,
      label: draft.label.trim() || null,
      tp_id: String(f.get('tp_id')) || null,
      system_id: String(f.get('system_id')) || null,
      valid_from: period.from,
      valid_to: period.to,
    };
    const ok = await act(
      () => (editing ? api.update('timetable_slots', { id: editing.id }, { ...base, weekday: days[0] }) : api.insert('timetable_slots', days.map((weekday) => ({ ...base, weekday })))),
      { ok: editing ? 'Créneau modifié.' : days.length > 1 ? `${days.length} créneaux ajoutés.` : 'Créneau ajouté.', tables: ['timetable_slots'] },
    );
    if (ok) reset();
  };

  const canEdit = (s: Slot) => isAdmin || (canWrite && s.teacher_id === profile?.id);
  const list = [...mine].sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time));

  return (
    <>
      <PageHead tab="edt" title="Emploi du temps" />
      {canWrite && (
        <AddPanel summary={editing ? 'Modifier le créneau' : 'Ajouter un créneau'} open={!!editing} onClose={() => setEditing(null)}>
          <form className="form" key={`${editing?.id ?? 'new'}-${formKey}`} onSubmit={submit}>
            <Field label="Salle *">
              <select className="in" required value={draft.room} onChange={(e) => setDraft({ ...draft, room: e.target.value })}>
                <Options placeholder="Choisir…" items={rooms.map((r) => [r.id, r.name])} />
              </select>
            </Field>
            <Field label="Groupe *">
              <select className="in" required value={draft.group} onChange={(e) => setDraft({ ...draft, group: e.target.value })}>
                <Options placeholder="Choisir…" items={GROUP_CODES.map((g) => [g, g])} />
              </select>
            </Field>
            <div className="f wide">
              <span className="lab">Jour{editing ? '' : 's (plusieurs possibles)'}</span>
              <div className="picks">
                {DAY_LONG.slice(0, 5).map((d, i) => (
                  <label key={d} className="pick">
                    <input type="checkbox" checked={days.includes(i + 1)}
                      onChange={(e) => setDays((cur) => editing ? [i + 1] : e.target.checked ? [...cur, i + 1].sort() : cur.filter((x) => x !== i + 1))} />
                    {d}
                  </label>
                ))}
              </div>
            </div>
            <Field label="Début"><input className="in" type="time" required step={300} value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} /></Field>
            <Field label="Fin"><input className="in" type="time" required step={300} value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} /></Field>
            <Field label="Enseignant">
              <select className="in" value={draft.teacher} onChange={(e) => setDraft({ ...draft, teacher: e.target.value })}>
                <Options placeholder="Autre (saisir un nom)" items={teachers.map((p) => [p.id, who(p.id)])} />
              </select>
            </Field>
            {!draft.teacher && <Field label="Nom de l’enseignant"><input className="in" name="teacher_label" maxLength={60} defaultValue={editing?.teacher_label ?? ''} /></Field>}
            <Field label="TP prévu">
              <select className="in" name="tp_id" defaultValue={editing?.tp_id ?? ''}>
                <Options placeholder="Aucun" items={data.tps.map((t) => [t.id, `${t.code ?? ''} ${t.title}`.trim()])} />
              </select>
            </Field>
            <Field label="Système utilisé">
              <select className="in" name="system_id" defaultValue={editing?.system_id ?? ''}>
                <Options placeholder="Aucun" items={data.systems.map((s) => [s.id, s.name])} />
              </select>
            </Field>
            <Field label="Intitulé libre"><input className="in" maxLength={80} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Atelier, cours…" /></Field>
            <Field label="Du"><input className="in" type="date" required value={period.from} onChange={(e) => setPeriod({ ...period, from: e.target.value })} /></Field>
            <Field label="Au"><input className="in" type="date" required value={period.to} onChange={(e) => setPeriod({ ...period, to: e.target.value })} /></Field>
            {conflicts.length > 0 && (
              <div className="alert wide" role="alert">
                <b>Conflit détecté, l’enregistrement sera refusé :</b>
                <ul>{conflicts.slice(0, 5).map((c) => <li key={c}>{c}</li>)}</ul>
              </div>
            )}
            <div className="actions">
              <button className="btn" type="submit" disabled={days.length === 0 || conflicts.length > 0}>{editing ? 'Enregistrer' : 'Ajouter'}</button>
              {editing && <button className="btn ghost" type="button" onClick={reset}>Annuler</button>}
            </div>
          </form>
        </AddPanel>
      )}
      <section className="panel">
        <div className="tools">
          <Seg<View> label="Vue" value={view} onChange={(v) => { setView(v); setTarget(''); }} items={[['room', 'Par salle'], ['group', 'Par groupe'], ['teacher', 'Par enseignant']]} />
          <Field label={view === 'room' ? 'Salle' : view === 'group' ? 'Groupe' : 'Enseignant'}>
            <select className="in" value={current} onChange={(e) => setTarget(e.target.value)}>
              <Options items={options} />
            </select>
          </Field>
        </div>
        <div className="legend">
          <span><i className="sw l-Seconde" /> Seconde</span>
          <span><i className="sw l-Première" /> Première</span>
          <span><i className="sw l-Terminale" /> Terminale</span>
        </div>
        {mine.length === 0 ? <Empty>Aucun créneau pour cette sélection.</Empty> : <WeekGrid days={weekDays} blocks={blocks} label="Semaine type" />}
      </section>
      {list.length > 0 && (
        <section className="panel">
          <h2>Créneaux ({list.length})</h2>
          <div className="scroll">
            <table className="tbl">
              <thead><tr><th>Jour</th><th>Horaire</th><th>Salle</th><th>Groupe</th><th>Enseignant</th><th>Période</th>{canWrite && <th />}</tr></thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id}>
                    <td>{DAY_LONG[s.weekday - 1]}</td>
                    <td>{hm(s.start_time)}–{hm(s.end_time)}</td>
                    <td>{roomById.get(s.room_id)?.name}</td>
                    <td>{s.group_code}</td>
                    <td>{who(s.teacher_id, s.teacher_label)}</td>
                    <td className="small">{fmtDate(s.valid_from)} → {fmtDate(s.valid_to)}</td>
                    {canWrite && (
                      <td>
                        {canEdit(s) && (
                          <div className="row">
                            <button className="btn ghost sm" onClick={() => startEdit(s)}>Modifier</button>
                            <ConfirmButton onConfirm={() => void act(() => api.remove('timetable_slots', { id: s.id }), { ok: 'Créneau supprimé.', tables: ['timetable_slots', 'sessions'] })}>Supprimer</ConfirmButton>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
