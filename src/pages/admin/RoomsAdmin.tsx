import { useMemo, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/state/auth';
import { useAct, useStore } from '@/state/store';
import { ROOM_KINDS, byText } from '@/lib/domain';
import type { Room, RoomKind } from '@/lib/types';
import { AddPanel, Chip, ConfirmButton, Empty, Field, Options } from '@/components/ui';

export default function RoomsAdmin() {
  const { data } = useStore();
  const { isAdmin } = useAuth();
  const act = useAct();
  const [editing, setEditing] = useState<Room | null>(null);
  const [formKey, setFormKey] = useState(0);

  const rooms = useMemo(() => [...data.rooms].sort(byText((r) => r.name)), [data.rooms]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const seats = String(f.get('seats')).trim();
    const row = {
      name: String(f.get('name')).trim(),
      building: String(f.get('building')).trim() || null,
      kind: f.get('kind') as RoomKind,
      seats: seats ? Math.max(0, Number(seats)) : null,
      shared: f.get('shared') === 'on',
      active: f.get('active') === 'on',
      notes: String(f.get('notes')).trim() || null,
    };
    const ok = await act(
      () => (editing ? api.update('rooms', { id: editing.id }, row) : api.insert('rooms', row)),
      { ok: editing ? 'Salle modifiée.' : 'Salle ajoutée.', tables: ['rooms'] },
    );
    if (ok) {
      setEditing(null);
      setFormKey((k) => k + 1);
    }
  };

  const slotsOf = (r: Room) => data.timetable_slots.filter((s) => s.room_id === r.id).length;
  const systemsOf = (r: Room) => data.systems.filter((s) => s.room_id === r.id);

  return (
    <>
      <p className="muted">Les lieux d’enseignement. Une salle « partagée » (grand atelier, par exemple) peut accueillir plusieurs groupes en même temps sans signaler de conflit.</p>
      {isAdmin && (
        <AddPanel summary={editing ? `Modifier la salle ${editing.name}` : 'Ajouter une salle'} open={!!editing} onClose={() => setEditing(null)}>
          <form className="form" key={`${editing?.id ?? 'new'}-${formKey}`} onSubmit={submit}>
            <Field label="Nom *"><input className="in" name="name" required maxLength={60} defaultValue={editing?.name} placeholder="Atelier B12" /></Field>
            <Field label="Bâtiment"><input className="in" name="building" maxLength={60} defaultValue={editing?.building ?? ''} /></Field>
            <Field label="Type">
              <select className="in" name="kind" defaultValue={editing?.kind ?? 'atelier'}>
                <Options items={Object.entries(ROOM_KINDS)} />
              </select>
            </Field>
            <Field label="Places"><input className="in" name="seats" type="number" min={0} max={500} defaultValue={editing?.seats ?? ''} /></Field>
            <div className="f">
              <span className="lab">Options</span>
              <label className="row"><input type="checkbox" name="shared" defaultChecked={editing?.shared ?? false} /> Partagée (plusieurs groupes possibles)</label>
              <label className="row"><input type="checkbox" name="active" defaultChecked={editing?.active ?? true} /> Utilisable</label>
            </div>
            <Field label="Notes" wide><textarea className="in" name="notes" maxLength={500} defaultValue={editing?.notes ?? ''} /></Field>
            <div className="actions">
              <button className="btn" type="submit">{editing ? 'Enregistrer' : 'Ajouter la salle'}</button>
              {editing && <button className="btn ghost" type="button" onClick={() => setEditing(null)}>Annuler</button>}
            </div>
          </form>
        </AddPanel>
      )}
      <section className="panel">
        <h2>Salles ({rooms.length})</h2>
        {rooms.length === 0 ? (
          <Empty>Aucune salle. {isAdmin ? 'Ajoutez-en une pour construire l’emploi du temps.' : 'Un gestionnaire doit en créer.'}</Empty>
        ) : (
          <div className="scroll">
            <table className="tbl">
              <thead>
                <tr><th>Salle</th><th>Type</th><th className="num">Places</th><th>Systèmes présents</th><th className="num">Créneaux</th><th>État</th>{isAdmin && <th />}</tr>
              </thead>
              <tbody>
                {rooms.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <b>{r.name}</b>
                      {r.building && <span className="sub">{r.building}</span>}
                      {r.notes && <span className="sub">{r.notes}</span>}
                    </td>
                    <td>{ROOM_KINDS[r.kind]}</td>
                    <td className="num">{r.seats ?? '—'}</td>
                    <td>{systemsOf(r).length ? systemsOf(r).map((s) => s.name).join(', ') : <span className="muted">—</span>}</td>
                    <td className="num">{slotsOf(r)}</td>
                    <td>
                      {r.shared && <Chip tone="info">Partagée</Chip>} {r.active ? <Chip tone="ok">Utilisable</Chip> : <Chip tone="idle">Inactive</Chip>}
                    </td>
                    {isAdmin && (
                      <td>
                        <div className="row">
                          <button className="btn ghost sm" onClick={() => { setEditing(r); window.scrollTo(0, 0); }}>Modifier</button>
                          <ConfirmButton
                            disabled={slotsOf(r) > 0}
                            onConfirm={() => void act(() => api.remove('rooms', { id: r.id }), { ok: 'Salle supprimée.', tables: ['rooms', 'systems'] })}
                          >
                            Supprimer
                          </ConfirmButton>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {isAdmin && rooms.some((r) => slotsOf(r) > 0) && (
          <p className="muted small">Une salle qui a des créneaux d’emploi du temps ne peut pas être supprimée : désactivez-la, ou supprimez d’abord ses créneaux.</p>
        )}
      </section>
    </>
  );
}
