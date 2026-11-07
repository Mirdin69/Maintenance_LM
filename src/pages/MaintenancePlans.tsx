import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/state/auth';
import { useAct, useStore } from '@/state/store';
import { PRIORITIES } from '@/lib/domain';
import { fmtDate, iso } from '@/lib/dates';
import type { MaintenancePlan } from '@/lib/types';
import { AddPanel, Chip, ConfirmButton, Empty, Field, Options } from '@/components/ui';

/** Contrôles préventifs récurrents : l'intervention est créée à l'échéance, avec sa liste de contrôle */
export default function MaintenancePlans() {
  const { data, systemById } = useStore();
  const { canWrite, isAdmin } = useAuth();
  const act = useAct();
  const [editing, setEditing] = useState<MaintenancePlan | null>(null);
  const [formKey, setFormKey] = useState(0);
  const today = iso(new Date());
  const plans = [...data.maintenance_plans].sort((a, b) => a.next_due.localeCompare(b.next_due));
  const due = plans.filter((p) => p.active && p.next_due <= today).length;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const row = {
      system_id: f.get('system_id'), title: String(f.get('title')).trim(), description: String(f.get('description')).trim() || null,
      priority: f.get('priority'), every_days: Math.min(3650, Math.max(1, Number(f.get('every_days')) || 365)), next_due: f.get('next_due'),
      checklist: String(f.get('checklist')).split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 30), active: f.get('active') === 'on',
    };
    const ok = await act(() => (editing ? api.update('maintenance_plans', { id: editing.id }, row) : api.insert('maintenance_plans', row)),
      { ok: editing ? 'Contrôle modifié.' : 'Contrôle ajouté.', tables: ['maintenance_plans'] });
    if (ok) { setEditing(null); setFormKey((k) => k + 1); }
  };

  const generate = () => act(async () => {
    const n = Number(await api.rpc('generate_due_maintenance'));
    if (!n) throw new Error('Aucune échéance à créer pour le moment.');
  }, { ok: 'Interventions créées.', tables: ['maintenance', 'maintenance_plans'] });

  return (
    <>
      {canWrite && (
        <AddPanel summary={editing ? 'Modifier le contrôle' : 'Ajouter un contrôle récurrent'} open={!!editing} onClose={() => setEditing(null)}>
          {data.systems.length === 0 ? <Empty>Ajoutez d’abord un système.</Empty> : (
            <form className="form" key={`${editing?.id ?? 'new'}-${formKey}`} onSubmit={submit}>
              <Field label="Système *"><select className="in" name="system_id" required defaultValue={editing?.system_id ?? ''}><Options placeholder="Choisir…" items={data.systems.map((s) => [s.id, s.name])} /></select></Field>
              <Field label="Contrôle *" wide><input className="in" name="title" required maxLength={120} defaultValue={editing?.title} placeholder="Vérification annuelle des protections" /></Field>
              <Field label="Tous les (jours)"><input className="in" type="number" name="every_days" min={1} max={3650} defaultValue={editing?.every_days ?? 365} /></Field>
              <Field label="Prochaine échéance *"><input className="in" type="date" name="next_due" required defaultValue={editing?.next_due} /></Field>
              <Field label="Priorité"><select className="in" name="priority" defaultValue={editing?.priority ?? 'n'}><Options items={Object.entries(PRIORITIES).map(([k, v]) => [k, v.label])} /></select></Field>
              <Field label="Liste de contrôle (une ligne par point)" wide><textarea className="in" name="checklist" rows={4} defaultValue={(editing?.checklist ?? []).join('\n')} /></Field>
              <Field label="Consignes" wide><textarea className="in" name="description" maxLength={1000} defaultValue={editing?.description ?? ''} /></Field>
              <label className="row"><input type="checkbox" name="active" defaultChecked={editing?.active ?? true} /> Actif</label>
              <div className="actions"><button className="btn" type="submit">{editing ? 'Enregistrer' : 'Ajouter'}</button>{editing && <button className="btn ghost" type="button" onClick={() => setEditing(null)}>Annuler</button>}</div>
            </form>
          )}
        </AddPanel>
      )}
      <section className="panel">
        <div className="row between">
          <h2>Contrôles récurrents ({plans.length})</h2>
          {canWrite && <button className="btn sm" onClick={() => void generate()}>Créer les interventions échues{due ? ` (${due})` : ''}</button>}
        </div>
        <p className="muted small">À l’échéance, l’intervention préventive est créée automatiquement à l’ouverture de cet onglet par un enseignant ou un gestionnaire, puis la date suivante est calculée.</p>
        {plans.length === 0 ? <Empty>Aucun contrôle récurrent.</Empty> : (
          <div className="scroll"><table className="tbl">
            <thead><tr><th>Contrôle</th><th>Système</th><th>Périodicité</th><th>Prochaine échéance</th>{canWrite && <th />}</tr></thead>
            <tbody>{plans.map((p) => (
              <tr key={p.id}>
                <td><b>{p.title}</b> {!p.active && <Chip tone="idle">Inactif</Chip>}{p.checklist.length > 0 && <span className="sub">{p.checklist.length} point{p.checklist.length > 1 ? 's' : ''} de contrôle</span>}</td>
                <td>{systemById.get(p.system_id)?.name}</td>
                <td>tous les {p.every_days} jours</td>
                <td>{fmtDate(p.next_due)} {p.active && p.next_due <= today && <Chip tone="bad">Échu</Chip>}</td>
                {canWrite && <td><div className="row">
                  <button className="btn ghost sm" onClick={() => { setEditing(p); window.scrollTo(0, 0); }}>Modifier</button>
                  {isAdmin && <ConfirmButton onConfirm={() => void act(() => api.remove('maintenance_plans', { id: p.id }), { ok: 'Contrôle supprimé.', tables: ['maintenance_plans', 'maintenance'] })}>Supprimer</ConfirmButton>}
                </div></td>}
              </tr>))}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
