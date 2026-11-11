import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAct, useStore } from '@/state/store';
import { GROUP_CODES } from '@/lib/domain';
import { fmtDate, iso } from '@/lib/dates';
import { headcountAt, headcountTimeline } from '@/lib/headcount';
import { ConfirmButton, Empty, Field, Options } from '@/components/ui';

const KIND = { initial: 'Effectif initial', arrivee: 'Arrivée', depart: 'Départ' } as const;

/** Effectif par groupe : valeur initiale, puis arrivées et départs datés ; l'effectif se lit à n'importe quelle date */
export default function HeadcountAdmin() {
  const { data, settings } = useStore();
  const act = useAct();
  const [at, setAt] = useState(() => iso(new Date()));
  const [group, setGroup] = useState(GROUP_CODES[0]);
  const rows = data.headcounts;
  const start = settings.year_start || iso(new Date());

  const setInitial = (g: string, n: number) => {
    const cur = rows.find((r) => r.group_code === g && r.kind === 'initial');
    if (cur) return act(() => api.update('headcounts', { id: cur.id }, { n }), { ok: 'Effectif initial enregistré.', tables: ['headcounts'] });
    return act(() => api.insert('headcounts', { group_code: g, day: start, kind: 'initial', n }), { ok: 'Effectif initial enregistré.', tables: ['headcounts'] });
  };

  const addMove = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const ok = await act(() => api.insert('headcounts', { group_code: group, day: String(f.get('day')), kind: f.get('kind'), n: Number(f.get('n')) || 1, note: String(f.get('note') ?? '').trim() || null }), { ok: 'Mouvement enregistré.', tables: ['headcounts'] });
    if (ok) form.reset();
  };

  const timeline = headcountTimeline(rows, group);
  return (
    <section className="panel stack">
      <h2>Effectifs des groupes</h2>
      <p className="muted">Saisissez l’effectif initial de chaque groupe, puis notez les arrivées et les départs avec leur date : l’effectif à une date donnée alimente les rotations de TP.</p>
      <Field label="Effectif à la date du"><input className="in" type="date" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
      <div className="scroll"><table className="tbl">
        <thead><tr><th>Groupe</th><th>Effectif initial</th><th>Arrivées</th><th>Départs</th><th>Effectif au {fmtDate(at)}</th></tr></thead>
        <tbody>{GROUP_CODES.map((g) => {
          const mine = rows.filter((r) => r.group_code === g && r.day <= at);
          const init = rows.find((r) => r.group_code === g && r.kind === 'initial');
          return (
            <tr key={g}>
              <td><b>{g}</b></td>
              <td><input className="in" type="number" min={0} max={60} style={{ width: 80 }} aria-label={`Effectif initial ${g}`} defaultValue={init?.n ?? ''} key={`${g}-${init?.n ?? ''}`}
                onBlur={(e) => { const v = e.target.value; if (v !== '' && Number(v) !== init?.n) void setInitial(g, Math.min(60, Math.max(0, Number(v)))); }} /></td>
              <td>+{mine.filter((r) => r.kind === 'arrivee').reduce((s, r) => s + r.n, 0)}</td>
              <td>−{mine.filter((r) => r.kind === 'depart').reduce((s, r) => s + r.n, 0)}</td>
              <td><b>{init ? headcountAt(rows, g, at) : '—'}</b></td>
            </tr>
          );
        })}</tbody>
      </table></div>

      <h3>Arrivées et départs</h3>
      <form className="tools" onSubmit={(e) => void addMove(e)} aria-label="Ajouter un mouvement">
        <Field label="Groupe"><select className="in" value={group} onChange={(e) => setGroup(e.target.value)}><Options items={GROUP_CODES.map((g) => [g, g])} /></select></Field>
        <Field label="Mouvement"><select className="in" name="kind" defaultValue="depart"><option value="arrivee">Arrivée</option><option value="depart">Départ</option></select></Field>
        <Field label="Nombre d’élèves"><input className="in" name="n" type="number" min={1} max={60} defaultValue={1} required /></Field>
        <Field label="Date"><input className="in" name="day" type="date" defaultValue={iso(new Date())} required /></Field>
        <Field label="Note (facultatif)"><input className="in" name="note" maxLength={120} placeholder="Réorientation, nouvel arrivant…" /></Field>
        <button className="btn" type="submit" disabled={!rows.some((r) => r.group_code === group && r.kind === 'initial')} title={rows.some((r) => r.group_code === group && r.kind === 'initial') ? undefined : 'Saisissez d’abord l’effectif initial'}>Ajouter</button>
      </form>
      {timeline.length === 0 ? <Empty>Aucun effectif pour {group}.</Empty> : (
        <div className="scroll"><table className="tbl">
          <thead><tr><th>Date</th><th>Mouvement</th><th>Élèves</th><th>Effectif après</th><th>Note</th><th /></tr></thead>
          <tbody>{timeline.map(({ row, after }) => (
            <tr key={row.id}>
              <td>{fmtDate(row.day)}</td><td>{KIND[row.kind]}</td><td>{row.kind === 'depart' ? '−' : row.kind === 'arrivee' ? '+' : ''}{row.n}</td><td>{after}</td><td>{row.note ?? ''}</td>
              <td>{row.kind !== 'initial' && <ConfirmButton onConfirm={() => void act(() => api.remove('headcounts', { id: row.id }), { ok: 'Mouvement supprimé.', tables: ['headcounts'] })}>Supprimer</ConfirmButton>}</td>
            </tr>))}</tbody>
        </table></div>
      )}
    </section>
  );
}
