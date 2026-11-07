import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/state/auth';
import { useAct, useStore } from '@/state/store';
import { DOMAINS, SYSTEM_STATES, byText } from '@/lib/domain';
import type { Domain, System, SystemState } from '@/lib/types';
import { AddPanel, Chip, ConfirmButton, Empty, Field, Options, PageHead } from '@/components/ui';

export default function Systems() {
  const { data, roomById } = useStore();
  const { canWrite, isAdmin } = useAuth();
  const act = useAct();
  const [editing, setEditing] = useState<System | null>(null);
  const [formKey, setFormKey] = useState(0);

  const systems = [...data.systems].sort(byText((s) => s.name));
  const rooms = data.rooms.filter((r) => r.active || r.id === editing?.room_id);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const row = {
      name: String(f.get('name')).trim(),
      ref: String(f.get('ref')).trim() || null,
      domain: f.get('domain') as Domain,
      room_id: String(f.get('room_id')) || null,
      qty: Math.max(1, Number(f.get('qty')) || 1),
      state: f.get('state') as SystemState,
      notes: String(f.get('notes')).trim() || null,
    };
    const ok = await act(
      () => (editing ? api.update('systems', { id: editing.id }, row) : api.insert('systems', row)),
      { ok: editing ? 'Système modifié.' : 'Système ajouté.', tables: ['systems'] },
    );
    if (ok) {
      setEditing(null);
      setFormKey((k) => k + 1);
    }
  };

  const linked = (s: System) =>
    data.maintenance.filter((m) => m.system_id === s.id && m.status !== 'done').length +
    data.timetable_slots.filter((x) => x.system_id === s.id).length;

  return (
    <>
      <PageHead title="Systèmes pédagogiques">
        Le parc des systèmes, maquettes et bancs utilisés en TP, avec la salle où ils se trouvent. Ajoutez un système avant de lui rattacher une intervention, un achat ou une séance.
      </PageHead>
      {canWrite && (
        <AddPanel summary={editing ? 'Modifier le système' : 'Ajouter un système'} open={!!editing}>
          <form className="form" key={`${editing?.id ?? 'new'}-${formKey}`} onSubmit={submit}>
            <Field label="Nom du système *"><input className="in" name="name" required maxLength={120} defaultValue={editing?.name} placeholder="Capsuleuse Ravoux" /></Field>
            <Field label="Référence / n° d’inventaire"><input className="in" name="ref" maxLength={80} defaultValue={editing?.ref ?? ''} placeholder="326-021" /></Field>
            <Field label="Domaine">
              <select className="in" name="domain" defaultValue={editing?.domain ?? 'ind'}>
                <Options items={Object.entries(DOMAINS)} />
              </select>
            </Field>
            <Field label="Salle">
              <select className="in" name="room_id" defaultValue={editing?.room_id ?? ''}>
                <Options placeholder="Non affecté" items={rooms.map((r) => [r.id, r.name])} />
              </select>
            </Field>
            <Field label="Postes disponibles"><input className="in" name="qty" type="number" min={1} max={99} defaultValue={editing?.qty ?? 1} /></Field>
            <Field label="État">
              <select className="in" name="state" defaultValue={editing?.state ?? 'service'}>
                <Options items={Object.entries(SYSTEM_STATES).map(([k, v]) => [k, v.label])} />
              </select>
            </Field>
            <Field label="Notes" wide><textarea className="in" name="notes" maxLength={500} defaultValue={editing?.notes ?? ''} /></Field>
            <div className="actions">
              <button className="btn" type="submit">{editing ? 'Enregistrer' : 'Ajouter le système'}</button>
              {editing && <button className="btn ghost" type="button" onClick={() => setEditing(null)}>Annuler</button>}
            </div>
          </form>
        </AddPanel>
      )}
      <section className="panel">
        <h2>Parc actuel</h2>
        {systems.length === 0 ? (
          <Empty>Aucun système pour le moment.{canWrite ? ' Utilisez « Ajouter un système » pour créer le premier.' : ''}</Empty>
        ) : (
          <div className="scroll">
            <table className="tbl">
              <thead>
                <tr><th>Système</th><th>Domaine</th><th>Salle</th><th className="num">Postes</th><th>État</th><th className="num">Interv. ouvertes</th>{canWrite && <th />}</tr>
              </thead>
              <tbody>
                {systems.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <b>{s.name}</b>
                      {s.ref && <span className="sub">Réf. {s.ref}</span>}
                      {s.notes && <span className="sub">{s.notes}</span>}
                    </td>
                    <td>{DOMAINS[s.domain]}</td>
                    <td>{s.room_id ? roomById.get(s.room_id)?.name : <span className="muted">—</span>}</td>
                    <td className="num">{s.qty}</td>
                    <td>
                      {canWrite ? (
                        <select className="in" style={{ minWidth: 140 }} aria-label={`État de ${s.name}`} value={s.state}
                          onChange={(e) => void act(() => api.update('systems', { id: s.id }, { state: e.target.value }), { tables: ['systems'] })}>
                          <Options items={Object.entries(SYSTEM_STATES).map(([k, v]) => [k, v.label])} />
                        </select>
                      ) : (
                        <Chip tone={SYSTEM_STATES[s.state].tone}>{SYSTEM_STATES[s.state].label}</Chip>
                      )}
                    </td>
                    <td className="num">{data.maintenance.filter((m) => m.system_id === s.id && m.status !== 'done').length}</td>
                    {canWrite && (
                      <td>
                        <div className="row">
                          <button className="btn ghost sm" onClick={() => { setEditing(s); window.scrollTo(0, 0); }}>Modifier</button>
                          {isAdmin && (
                            <ConfirmButton warn={linked(s) ? `Confirmer (${linked(s)} lien${linked(s) > 1 ? 's' : ''})` : 'Confirmer'}
                              onConfirm={() => void act(() => api.remove('systems', { id: s.id }), { ok: 'Système supprimé.', tables: ['systems', 'maintenance', 'timetable_slots', 'sessions', 'purchases'] })}>
                              Supprimer
                            </ConfirmButton>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
