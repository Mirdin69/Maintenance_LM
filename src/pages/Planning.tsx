import { useMemo, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/state/auth';
import { useAct, useStore } from '@/state/store';
import { COMPETENCES, DOMAINS, GROUP_CODES, LEVELS } from '@/lib/domain';
import { addDays, fmtDayLong, fmtShort, iso, minToHM, mondayOf, parseISO, schoolYearBounds, schoolYearOf, toMin } from '@/lib/dates';
import { buildOccurrences, systemUsage, type Occ } from '@/lib/occupancy';
import { sessionConflicts } from '@/lib/conflicts';
import type { Level, Tp } from '@/lib/types';
import { AddPanel, Chip, ConfirmButton, Empty, Field, Options, PageHead, Seg } from '@/components/ui';

type Sub = 'week' | 'tps' | 'usage';

export default function Planning() {
  const [sub, setSub] = useState<Sub>('week');
  return (
    <>
      <PageHead title="Planning des TP">Les séances de la semaine, le catalogue des TP et l’utilisation annuelle des systèmes.</PageHead>
      <div className="tools"><Seg<Sub> label="Section" value={sub} onChange={setSub} items={[['week', 'Séances'], ['tps', 'Catalogue des TP'], ['usage', 'Utilisation des systèmes']]} /></div>
      {sub === 'week' && <Week />}
      {sub === 'tps' && <Catalogue />}
      {sub === 'usage' && <Usage />}
    </>
  );
}

function Week() {
  const { data, roomById, tpById, systemById, who } = useStore();
  const { canWrite, isAdmin, profile } = useAuth();
  const act = useAct();
  const [weekStart, setWeekStart] = useState(() => iso(mondayOf(new Date())));
  const [formKey, setFormKey] = useState(0);
  const days = Array.from({ length: 7 }, (_, i) => iso(addDays(parseISO(weekStart), i)));
  const { occs, cancelled } = useMemo(() => buildOccurrences(data.timetable_slots, data.sessions, days[0], days[6]), [data.timetable_slots, data.sessions, weekStart]); // eslint-disable-line react-hooks/exhaustive-deps
  const [editKey, setEditKey] = useState('');
  const today = iso(new Date());

  /** Crée ou met à jour la séance datée qui remplace (ou précise) une occurrence */
  const saveOverride = (o: Occ, patch: Record<string, unknown>) =>
    act(
      () => o.sessionId
        ? api.update('sessions', { id: o.sessionId }, patch)
        : api.insert('sessions', {
            slot_id: o.slotId, session_date: o.date, start_time: minToHM(o.start), end_time: minToHM(o.end), room_id: o.roomId,
            group_code: o.groupCode, tp_id: o.tpId, system_id: o.systemId, teacher_id: o.teacherId, teacher_label: o.teacherLabel,
            label: o.label, status: 'planned', ...patch,
          }),
      { tables: ['sessions'] },
    );

  const onEdit = async (o: Occ, e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const room = String(f.get('room_id')) || null;
    const start = toMin(String(f.get('start')));
    const end = toMin(String(f.get('end')));
    const issues = sessionConflicts({ id: o.sessionId ?? undefined, slotId: o.slotId, date: o.date, start, end, roomId: room, groupCode: o.groupCode, teacherId: o.teacherId, teacherLabel: o.teacherLabel }, data.timetable_slots, data.sessions, data.rooms);
    if (issues.length) return void act(() => Promise.reject(new Error(issues[0])));
    const ok = await saveOverride(o, {
      room_id: room, start_time: minToHM(start), end_time: minToHM(end),
      tp_id: String(f.get('tp_id')) || null, system_id: String(f.get('system_id')) || null,
      note: String(f.get('note')).trim() || null,
    });
    if (ok) setEditKey('');
  };

  const sysWarn = (o: Occ) => {
    if (!o.systemId) return null;
    const sys = systemById.get(o.systemId);
    if (!sys) return null;
    const n = systemUsage(occs, o.systemId, o.date, o.start, o.end, o.key).length + 1;
    return n > sys.qty ? `${sys.name} : ${n} groupes pour ${sys.qty} poste${sys.qty > 1 ? 's' : ''}` : null;
  };

  const oneOff = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const date = String(f.get('date'));
    const start = toMin(String(f.get('start')));
    const end = toMin(String(f.get('end')));
    const room = String(f.get('room_id')) || null;
    const grp = String(f.get('group_code')) || null;
    const issues = sessionConflicts({ date, start, end, roomId: room, groupCode: grp, teacherId: profile?.id ?? null }, data.timetable_slots, data.sessions, data.rooms);
    if (issues.length) return void act(() => Promise.reject(new Error(issues[0])));
    const ok = await act(
      () => api.insert('sessions', {
        slot_id: null, session_date: date, start_time: minToHM(start), end_time: minToHM(end), room_id: room, group_code: grp,
        tp_id: String(f.get('tp_id')) || null, system_id: String(f.get('system_id')) || null,
        label: String(f.get('label')).trim() || null, status: 'planned',
      }),
      { ok: 'Séance ajoutée.', tables: ['sessions'] },
    );
    if (ok) setFormKey((k) => k + 1);
  };

  const byDay = days.map((d) => ({ d, items: occs.filter((o) => o.date === d), off: cancelled.filter((o) => o.date === d) }));

  return (
    <>
      {canWrite && (
        <AddPanel summary="Ajouter une séance ponctuelle">
          <form className="form" key={formKey} onSubmit={oneOff}>
            <Field label="Date *"><input className="in" type="date" name="date" required defaultValue={today} /></Field>
            <Field label="Début"><input className="in" type="time" name="start" defaultValue="08:00" step={300} required /></Field>
            <Field label="Fin"><input className="in" type="time" name="end" defaultValue="10:00" step={300} required /></Field>
            <Field label="Salle"><select className="in" name="room_id"><Options placeholder="Sans salle" items={data.rooms.filter((r) => r.active).map((r) => [r.id, r.name])} /></select></Field>
            <Field label="Groupe"><select className="in" name="group_code"><Options placeholder="Aucun" items={GROUP_CODES.map((g) => [g, g])} /></select></Field>
            <Field label="TP"><select className="in" name="tp_id"><Options placeholder="Aucun" items={data.tps.map((t) => [t.id, `${t.code ?? ''} ${t.title}`.trim()])} /></select></Field>
            <Field label="Système"><select className="in" name="system_id"><Options placeholder="Aucun" items={data.systems.map((s) => [s.id, s.name])} /></select></Field>
            <Field label="Intitulé"><input className="in" name="label" maxLength={80} placeholder="Réservation, rattrapage…" /></Field>
            <div className="actions"><button className="btn" type="submit">Ajouter</button></div>
          </form>
        </AddPanel>
      )}
      <section className="panel">
        <div className="row between">
          <h2>Semaine du {fmtShort(days[0])} au {fmtShort(days[6])}</h2>
          <div className="row">
            <button className="btn ghost sm" onClick={() => setWeekStart(iso(addDays(parseISO(weekStart), -7)))}>← Précédente</button>
            <button className="btn ghost sm" onClick={() => setWeekStart(iso(mondayOf(new Date())))}>Aujourd’hui</button>
            <button className="btn ghost sm" onClick={() => setWeekStart(iso(addDays(parseISO(weekStart), 7)))}>Suivante →</button>
          </div>
        </div>
        {byDay.filter((x) => x.items.length || x.off.length).length === 0 ? <Empty>Aucune séance cette semaine.</Empty> : byDay.filter((x) => x.items.length || x.off.length).map(({ d, items, off }) => (
          <div key={d} className={'day' + (d === today ? ' today' : '')}>
            <h3>{fmtDayLong(d)}</h3>
            {items.map((o) => {
              const warn = sysWarn(o);
              const mine = isAdmin || o.teacherId === profile?.id || (!o.teacherId && canWrite);
              return (
                <div key={o.key} className="occ">
                  <div className="row between">
                    <div>
                      <span className="tm">{minToHM(o.start)}–{minToHM(o.end)}</span> <b>{o.groupCode ?? o.label ?? 'Réservation'}</b>
                      <span className="muted small"> · {o.roomId ? roomById.get(o.roomId)?.name : 'sans salle'} · {who(o.teacherId, o.teacherLabel)}{o.tpId ? ` · ${tpById.get(o.tpId)?.code ?? tpById.get(o.tpId)?.title}` : ''}{o.systemId ? ` · ${systemById.get(o.systemId)?.name}` : ''}</span>
                      {o.moved && <> <Chip tone="info">Modifiée</Chip></>} {o.status === 'done' && <Chip tone="ok">Réalisée</Chip>}
                    </div>
                    {canWrite && mine && (
                      <div className="row">
                        <button className="btn ghost sm" onClick={() => setEditKey(editKey === o.key ? '' : o.key)}>Renseigner</button>
                        <button className="btn ghost sm" onClick={() => void saveOverride(o, { status: o.status === 'done' ? 'planned' : 'done' })}>{o.status === 'done' ? 'Non réalisée' : 'Réalisée'}</button>
                        {o.slotId && <button className="btn ghost sm" onClick={() => void saveOverride(o, { status: 'cancelled' })}>Annuler</button>}
                        {!o.slotId && o.sessionId && <ConfirmButton onConfirm={() => void act(() => api.remove('sessions', { id: o.sessionId! }), { ok: 'Séance supprimée.', tables: ['sessions'] })}>Supprimer</ConfirmButton>}
                      </div>
                    )}
                  </div>
                  {warn && <div className="alert soft">Attention : {warn}.</div>}
                  {editKey === o.key && (
                    <form className="form occ-edit" onSubmit={(e) => void onEdit(o, e)}>
                      <Field label="Salle"><select className="in" name="room_id" defaultValue={o.roomId ?? ''}><Options placeholder="Sans salle" items={data.rooms.filter((r) => r.active || r.id === o.roomId).map((r) => [r.id, r.name])} /></select></Field>
                      <Field label="Début"><input className="in" type="time" name="start" step={300} defaultValue={minToHM(o.start)} /></Field>
                      <Field label="Fin"><input className="in" type="time" name="end" step={300} defaultValue={minToHM(o.end)} /></Field>
                      <Field label="TP"><select className="in" name="tp_id" defaultValue={o.tpId ?? ''}><Options placeholder="Aucun" items={data.tps.map((t) => [t.id, `${t.code ?? ''} ${t.title}`.trim()])} /></select></Field>
                      <Field label="Système"><select className="in" name="system_id" defaultValue={o.systemId ?? ''}><Options placeholder="Aucun" items={data.systems.map((s) => [s.id, s.name])} /></select></Field>
                      <Field label="Note" wide><input className="in" name="note" maxLength={300} defaultValue={data.sessions.find((s) => s.id === o.sessionId)?.note ?? ''} /></Field>
                      <div className="actions"><button className="btn sm" type="submit">Enregistrer</button></div>
                    </form>
                  )}
                </div>
              );
            })}
            {off.map((o) => (
              <div key={o.key} className="occ">
                <div className="row between">
                  <span className="muted"><s>{minToHM(o.start)}–{minToHM(o.end)} {o.groupCode}</s> <Chip tone="bad">Annulée</Chip></span>
                  {canWrite && o.sessionId && <button className="btn ghost sm" onClick={() => void act(() => api.remove('sessions', { id: o.sessionId! }), { ok: 'Séance rétablie.', tables: ['sessions'] })}>Rétablir</button>}
                </div>
              </div>
            ))}
          </div>
        ))}
      </section>
    </>
  );
}

function Catalogue() {
  const { data, systemById, who } = useStore();
  const { canWrite, isAdmin } = useAuth();
  const act = useAct();
  const [formKey, setFormKey] = useState(0);
  const [editing, setEditing] = useState<Tp | null>(null);
  const [level, setLevel] = useState<Level | ''>('');
  const [sys, setSys] = useState<string[]>([]);
  const [comp, setComp] = useState<string[]>([]);

  const edit = (t: Tp | null) => { setEditing(t); setSys(t?.system_ids ?? []); setComp(t?.competences ?? []); };
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const row = {
      code: String(f.get('code')).trim() || null, title: String(f.get('title')).trim(), level: f.get('level'), domain: f.get('domain'),
      hours: Number(f.get('hours')) || null, system_ids: sys, competences: comp,
      objective: String(f.get('objective')).trim() || null,
      teacher_id: String(f.get('teacher_id')) || null,
      teacher_label: String(f.get('teacher_id')) ? null : String(f.get('teacher_label')).trim() || null,
      sequence_name: String(f.get('sequence_name')).trim() || null,
    };
    const ok = await act(() => (editing ? api.update('tps', { id: editing.id }, row) : api.insert('tps', row)), { ok: editing ? 'TP modifié.' : 'TP ajouté.', tables: ['tps'] });
    if (ok) { edit(null); setFormKey((k) => k + 1); }
  };

  const list = data.tps.filter((t) => !level || t.level === level).sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || (a.code ?? '').localeCompare(b.code ?? '', 'fr', { numeric: true }));

  return (
    <>
      {canWrite && (
        <AddPanel summary={editing ? 'Modifier le TP' : 'Ajouter un TP'} open={!!editing}>
          <form className="form" key={`${editing?.id ?? 'new'}-${formKey}`} onSubmit={submit}>
            <Field label="Code"><input className="in" name="code" maxLength={20} defaultValue={editing?.code ?? ''} placeholder="TP5" /></Field>
            <Field label="Titre *" wide><input className="in" name="title" required maxLength={160} defaultValue={editing?.title} /></Field>
            <Field label="Niveau"><select className="in" name="level" defaultValue={editing?.level ?? 'Seconde'}><Options items={LEVELS.map((l) => [l, l])} /></select></Field>
            <Field label="Domaine"><select className="in" name="domain" defaultValue={editing?.domain ?? 'ind'}><Options items={Object.entries(DOMAINS)} /></select></Field>
            <Field label="Durée (h)"><input className="in" name="hours" type="number" min={0} step="0.5" defaultValue={editing?.hours ?? ''} /></Field>
            <Field label="Enseignant (compte)"><select className="in" name="teacher_id" defaultValue={editing?.teacher_id ?? ''}><Options placeholder="Autre (saisir le nom)" items={data.profiles.filter((p) => p.active).map((p) => [p.id, who(p.id)])} /></select></Field>
            <Field label="Nom de l’enseignant (si sans compte)"><input className="in" name="teacher_label" maxLength={60} defaultValue={editing?.teacher_label ?? ''} /></Field>
            <Field label="Séquence"><input className="in" name="sequence_name" maxLength={120} defaultValue={editing?.sequence_name ?? ''} /></Field>
            <Field label="Objectif" wide><textarea className="in" name="objective" maxLength={500} defaultValue={editing?.objective ?? ''} /></Field>
            <div className="f wide"><span className="lab">Systèmes utilisés</span>
              <div className="picks">{data.systems.map((s) => <label key={s.id} className="pick"><input type="checkbox" checked={sys.includes(s.id)} onChange={() => setSys(toggle(sys, s.id))} />{s.name}</label>)}</div></div>
            <div className="f wide"><span className="lab">Compétences travaillées</span>
              <div className="picks">{Object.keys(COMPETENCES).map((c) => <label key={c} className="pick" title={COMPETENCES[c]}><input type="checkbox" checked={comp.includes(c)} onChange={() => setComp(toggle(comp, c))} />{c}</label>)}</div></div>
            <div className="actions"><button className="btn" type="submit">{editing ? 'Enregistrer' : 'Ajouter'}</button>{editing && <button className="btn ghost" type="button" onClick={() => edit(null)}>Annuler</button>}</div>
          </form>
        </AddPanel>
      )}
      <section className="panel">
        <div className="row between"><h2>Catalogue ({list.length})</h2>
          <Seg<Level | ''> label="Niveau" value={level} onChange={setLevel} items={[['', 'Tous'], ...LEVELS.map((l) => [l, l] as [Level, string])]} /></div>
        {list.length === 0 ? <Empty>Aucun TP.</Empty> : (
          <div className="scroll"><table className="tbl">
            <thead><tr><th>TP</th><th>Niveau</th><th>Enseignant</th><th className="num">Durée</th><th>Systèmes</th><th>Compétences</th>{canWrite && <th />}</tr></thead>
            <tbody>{list.map((t) => (
              <tr key={t.id}>
                <td><b>{t.code}</b> {t.title}{t.objective && <span className="sub">{t.objective}</span>}</td><td>{t.level}</td><td>{t.teacher_id ? who(t.teacher_id) : t.teacher_label ?? '—'}</td><td className="num">{t.hours ? `${t.hours} h` : '—'}</td>
                <td>{t.system_ids.map((id) => systemById.get(id)?.name).filter(Boolean).join(', ') || '—'}</td>
                <td>{t.competences.join(', ') || '—'}</td>
                {canWrite && <td><div className="row"><button className="btn ghost sm" onClick={() => { edit(t); window.scrollTo(0, 0); }}>Modifier</button>
                  {isAdmin && <ConfirmButton onConfirm={() => void act(() => api.remove('tps', { id: t.id }), { ok: 'TP supprimé.', tables: ['tps', 'progress', 'timetable_slots', 'sessions'] })}>Supprimer</ConfirmButton>}</div></td>}
              </tr>))}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}

function Usage() {
  const { data, systemById } = useStore();
  const bounds = schoolYearBounds(schoolYearOf(new Date()));
  const { occs } = useMemo(() => buildOccurrences(data.timetable_slots, data.sessions, bounds.from, bounds.to), [data.timetable_slots, data.sessions, bounds.from, bounds.to]);
  const months = useMemo(() => {
    const out: Array<{ key: string; label: string }> = [];
    const y = Number(bounds.from.slice(0, 4));
    for (let i = 0; i < 11; i++) {
      const d = new Date(y, 8 + i, 1);
      out.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('fr-FR', { month: 'short' }) });
    }
    return out;
  }, [bounds.from]);
  const hours = (sysId: string, key: string) => occs.filter((o) => o.systemId === sysId && o.date.startsWith(key)).reduce((a, o) => a + (o.end - o.start) / 60, 0);
  const rows = data.systems.map((s) => ({ s, cells: months.map((m) => hours(s.id, m.key)) }));
  const max = Math.max(1, ...rows.flatMap((r) => r.cells));
  const lvl = (h: number) => (h === 0 ? '' : h <= max * 0.25 ? 'l1' : h <= max * 0.5 ? 'l2' : h <= max * 0.75 ? 'l3' : 'l4');
  return (
    <section className="panel">
      <h2>Heures d’utilisation par système, année {bounds.from.slice(0, 4)}-{bounds.to.slice(0, 4)}</h2>
      {rows.length === 0 ? <Empty>Aucun système.</Empty> : (
        <div className="scroll"><table className="heat">
          <thead><tr><th className="sys">Système</th>{months.map((m) => <th key={m.key}>{m.label}</th>)}<th>Total</th></tr></thead>
          <tbody>{rows.map(({ s, cells }) => (
            <tr key={s.id}><th className="sys">{systemById.get(s.id)?.name}</th>
              {cells.map((h, i) => <td key={i}><span className={`c ${lvl(h)}`} title={`${h} h`}>{h ? Math.round(h) : ''}</span></td>)}
              <td className="num"><b>{Math.round(cells.reduce((a, b) => a + b, 0))} h</b></td></tr>))}</tbody>
        </table></div>
      )}
      <p className="muted small">Calculé à partir des créneaux de l’emploi du temps et des séances qui indiquent un système. Une séance annulée n’est pas comptée.</p>
    </section>
  );
}
