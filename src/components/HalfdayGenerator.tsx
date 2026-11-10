import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAct, useStore } from '@/state/store';
import { GROUP_CODES, LEVELS, levelOfGroup } from '@/lib/domain';
import { DAY_LONG, minToHM, schoolYearBounds, schoolYearOf } from '@/lib/dates';
import { blocksFrom, periodsOf } from '@/lib/schedule';
import { periodOn } from '@/lib/calendar';
import { CONFLICT_COLS, cellKey } from '@/lib/semainier';
import { datesFor, noteOf, planHalfday, type Activity } from '@/lib/halfday';
import type { Level, Part, Slot } from '@/lib/types';
import { AddPanel, Field, Options } from './ui';

const KINDS: Activity['kind'][] = ['TP', 'TD', 'Cours'];

/** Génère l'emploi du temps d'une demi-journée en carrousel (TP / TD / cours en rotation) et remplit le semainier. */
export function HalfdayGenerator() {
  const { data, settings, who } = useStore();
  const act = useAct();
  const rooms = data.rooms.filter((r) => r.active);
  const teachers = data.profiles.filter((p) => p.active);
  const sy = schoolYearBounds(schoolYearOf(new Date()));

  const [subject, setSubject] = useState('');
  const [level, setLevel] = useState<Level>('Seconde');
  const [picked, setPicked] = useState<string[] | null>(null);
  const [weekday, setWeekday] = useState(1);
  const [part, setPart] = useState<Exclude<Part, 'J'>>('A');
  const [first, setFirst] = useState(0);
  const [size, setSize] = useState(1);
  const [acts, setActs] = useState<Activity[]>(() => KINDS.map((kind) => ({ kind, roomId: '', teacherId: null })));
  const [from, setFrom] = useState(settings.year_start || sy.from);
  const [to, setTo] = useState(settings.year_end || sy.to);
  const [fill, setFill] = useState(true);

  const levelGroups = GROUP_CODES.filter((g) => levelOfGroup(g) === level);
  const groups = (picked ?? levelGroups).filter((g) => levelGroups.includes(g));
  const periods = useMemo(() => periodsOf(weekday, part), [weekday, part]);
  const blocks = useMemo(() => blocksFrom(periods, Math.min(first, periods.length - 1), acts.length, size), [periods, first, acts.length, size]);
  const ready = blocks.length === acts.length && !!subject.trim() && acts.every((a) => a.roomId) && groups.length > 0 && from <= to;

  const planned = useMemo(
    () => (ready ? planHalfday({ subject, groups, activities: acts, weekday, blocks, from, to }, data.timetable_slots, data.sessions, data.rooms) : []),
    [ready, subject, groups.join(), acts, weekday, blocks, from, to, data.timetable_slots, data.sessions, data.rooms],
  );
  const okSlots = planned.filter((p) => !p.conflicts.length);
  const bad = planned.filter((p) => p.conflicts.length);
  const roomName = (id: string) => data.rooms.find((r) => r.id === id)?.name ?? '?';
  const setAct = (i: number, patch: Partial<Activity>) => setActs((cur) => cur.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  const generate = async () => {
    const cellsByKey = new Set(data.planning_cells.filter((c) => c.tp_id || c.label).map((c) => cellKey(c.day, c.group_code, c.part ?? 'J')));
    const dates = fill ? datesFor(from, to, weekday, (d) => !!periodOn(d, data.calendar_periods)) : [];
    const roomOf = (g: string) => {
      const ids = [...new Set(okSlots.filter((p) => p.group === g).map((p) => p.activity.roomId))];
      return ids.length === 1 ? ids[0] : null;
    };
    const cellRows = dates.flatMap((day) =>
      [...new Set(okSlots.map((p) => p.group))]
        .filter((g) => !cellsByKey.has(cellKey(day, g, part)))
        .map((g) => ({ day, group_code: g, part, room_id: roomOf(g), tp_id: null, label: subject.trim().slice(0, 60), note: noteOf(planned, g) || null })),
    );
    let ids: string[] = [];
    const run = async () => {
      const rows = okSlots.map((p) => ({
        room_id: p.activity.roomId, group_code: p.group, teacher_id: p.activity.teacherId, teacher_label: null, weekday,
        start_time: minToHM(p.start), end_time: minToHM(p.end), label: p.label, tp_id: null, system_id: null, valid_from: from, valid_to: to,
      }));
      ids = (await api.insert<Slot>('timetable_slots', rows)).map((s) => s.id);
      for (let i = 0; i < cellRows.length; i += 100) await api.upsert('planning_cells', cellRows.slice(i, i + 100), CONFLICT_COLS);
    };
    const undo = async () => {
      if (ids.length) await api.remove('timetable_slots', { id: ids });
      for (let i = 0; i < cellRows.length; i += 20)
        await Promise.all(cellRows.slice(i, i + 20).map((r) => api.remove('planning_cells', { day: r.day, group_code: r.group_code, part: r.part })));
    };
    await act(run, {
      ok: `${okSlots.length} créneau${okSlots.length > 1 ? 'x' : ''} créé${okSlots.length > 1 ? 's' : ''}${fill ? `, ${cellRows.length} case${cellRows.length > 1 ? 's' : ''} du semainier remplie${cellRows.length > 1 ? 's' : ''}` : ''}.`,
      tables: ['timetable_slots', 'planning_cells'], undo,
    });
  };

  return (
    <AddPanel summary="Générer une demi-journée (carrousel TP / TD / cours)">
      <div className="form">
        <p className="muted small wide">
          Exemple : REM le lundi après-midi, 3 séances de 1 h. Chaque groupe passe successivement par le TP, le TD et le cours (rotation). Les créneaux sont ajoutés à l’emploi du temps avec leur salle, et le semainier reçoit une case « {subject.trim() || 'REM'} » sur l’après-midi de chaque semaine.
        </p>
        <Field label="Intitulé *"><input className="in" value={subject} maxLength={40} placeholder="REM" onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label="Niveau">
          <select className="in" value={level} onChange={(e) => { setLevel(e.target.value as Level); setPicked(null); }}>
            <Options items={LEVELS.map((l) => [l, l])} />
          </select>
        </Field>
        <div className="f wide">
          <span className="lab">Groupes qui tournent</span>
          <div className="picks" role="group" aria-label="Groupes">
            {levelGroups.map((g) => (
              <label key={g} className="pick"><input type="checkbox" checked={groups.includes(g)} onChange={(e) => setPicked(e.target.checked ? [...groups, g] : groups.filter((x) => x !== g))} /> {g}</label>
            ))}
          </div>
        </div>
        <Field label="Jour">
          <select className="in" value={weekday} onChange={(e) => { setWeekday(Number(e.target.value)); setFirst(0); }}>
            <Options items={DAY_LONG.slice(0, 5).map((d, i) => [String(i + 1), d])} />
          </select>
        </Field>
        <Field label="Partie de la journée">
          <select className="in" value={part} onChange={(e) => { const p = e.target.value as Exclude<Part, 'J'>; setPart(p); setFirst(0); }}>
            <option value="M">Matin</option><option value="A">Après-midi</option>
          </select>
        </Field>
        <Field label="Première séance">
          <select className="in" value={first} onChange={(e) => setFirst(Number(e.target.value))}>
            {periods.map((p, i) => <option key={p.start} value={i}>{minToHM(p.start)} – {minToHM(p.end)}</option>)}
          </select>
        </Field>
        <Field label="Heures par séance">
          <select className="in" value={size} onChange={(e) => setSize(Number(e.target.value))}>
            <option value={1}>1 heure (55 min)</option><option value={2}>2 heures</option><option value={3}>3 heures</option>
          </select>
        </Field>
        <div className="f wide">
          <span className="lab">Activités en rotation ({acts.length} séances de {size} h, de {blocks.length ? minToHM(blocks[0].start) : '…'} à {blocks.length ? minToHM(blocks[blocks.length - 1].end) : '…'})</span>
          {acts.map((a, i) => (
            <div key={i} className="row">
              <select className="in" aria-label={`Type de l’activité ${i + 1}`} value={a.kind} onChange={(e) => setAct(i, { kind: e.target.value as Activity['kind'] })}>
                <Options items={KINDS.map((k) => [k, k])} />
              </select>
              <select className="in" aria-label={`Salle de l’activité ${i + 1}`} value={a.roomId} onChange={(e) => setAct(i, { roomId: e.target.value })}>
                <Options placeholder="Salle…" items={rooms.map((r) => [r.id, r.name])} />
              </select>
              <select className="in" aria-label={`Enseignant de l’activité ${i + 1}`} value={a.teacherId ?? ''} onChange={(e) => setAct(i, { teacherId: e.target.value || null })}>
                <Options placeholder="Sans enseignant" items={teachers.map((p) => [p.id, who(p.id)])} />
              </select>
              {acts.length > 2 && <button type="button" className="btn ghost sm" aria-label={`Retirer l’activité ${i + 1}`} onClick={() => setActs(acts.filter((_, j) => j !== i))}>✕</button>}
            </div>
          ))}
          {acts.length < 6 && <button type="button" className="btn ghost sm" onClick={() => setActs([...acts, { kind: 'TP', roomId: '', teacherId: null }])}>+ Ajouter une activité</button>}
        </div>
        <Field label="Du"><input className="in" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Au"><input className="in" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <label className="row wide"><input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} /> Remplir aussi le semainier (hors vacances et jours fériés, sans écraser les cases déjà remplies)</label>
        {ready && (
          <div className="wide scroll">
            <table className="tbl" aria-label="Aperçu de la rotation">
              <thead><tr><th>Groupe</th>{acts.map((_, b) => <th key={b}>{blocks[b] ? minToHM(blocks[b].start) : ''}</th>)}</tr></thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g}><th scope="row">{g}</th>{acts.map((_, b) => {
                    const p = planned.find((x) => x.group === g && x.block === b);
                    return <td key={b} className={p?.conflicts.length ? 'bad' : ''}>{p ? `${p.activity.kind} · ${roomName(p.activity.roomId)}` : ''}{p?.conflicts.length ? ' ⚠' : ''}</td>;
                  })}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {bad.length > 0 && (
          <div className="alert wide" role="alert">
            <b>{bad.length} créneau{bad.length > 1 ? 'x' : ''} en conflit, non créé{bad.length > 1 ? 's' : ''} :</b>
            <ul>{[...new Set(bad.flatMap((p) => p.conflicts.map((c) => `${p.group} à ${minToHM(p.start)} : ${c}`)))].slice(0, 6).map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
        )}
        <div className="actions">
          <button className="btn" type="button" disabled={!ready || okSlots.length === 0} onClick={() => void generate()}>
            Générer {okSlots.length > 0 ? `${okSlots.length} créneau${okSlots.length > 1 ? 'x' : ''}` : ''}
          </button>
        </div>
      </div>
    </AddPanel>
  );
}
