import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAct, useStore } from '@/state/store';
import { Field } from '@/components/ui';

export default function BudgetAdmin() {
  const { settings } = useStore();
  const act = useAct();
  const [mat, setMat] = useState(settings.budget_mat ?? '');
  const [conso, setConso] = useState(settings.budget_conso ?? '');
  const clean = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v)) || Number(v) < 0 ? '' : String(Number(v)));
  const save = (e: FormEvent) => {
    e.preventDefault();
    void act(() => api.upsert('settings', [{ key: 'budget_mat', value: clean(mat) }, { key: 'budget_conso', value: clean(conso) }], 'key'), { ok: 'Budget enregistré.', tables: ['settings'] });
  };
  return (
    <form className="panel form" onSubmit={save}>
      <p className="muted wide">Budget de l’année pour les achats. Il s’affiche, avec ce qui est déjà engagé (demandes validées, commandées ou reçues), en haut de l’onglet Achats. Laissez vide pour ne pas suivre un budget.</p>
      <Field label="Matériel (€)"><input className="in" type="number" min={0} step="1" value={mat} onChange={(e) => setMat(e.target.value)} /></Field>
      <Field label="Consommables (€)"><input className="in" type="number" min={0} step="1" value={conso} onChange={(e) => setConso(e.target.value)} /></Field>
      <div className="actions"><button className="btn" type="submit">Enregistrer</button></div>
    </form>
  );
}
