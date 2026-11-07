import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAct, useStore } from '@/state/store';
import { TOOL_STATES } from '@/lib/domain';
import type { Tool } from '@/lib/types';
import { AddPanel, ConfirmButton, Field, Options } from '@/components/ui';
import { ImageField } from '@/components/ImageField';
import { ToolsList } from '@/components/Tools';

export default function ToolsAdmin() {
  const { data } = useStore();
  const act = useAct();
  const [editing, setEditing] = useState<Tool | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [img, setImg] = useState('');

  const edit = (t: Tool | null) => { setEditing(t); setImg(t?.image_url ?? ''); };
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const row = {
      name: String(f.get('name')).trim(),
      ref: String(f.get('ref')).trim() || null,
      category: String(f.get('category')).trim() || null,
      qty: Math.max(0, Number(f.get('qty')) || 0),
      room_id: String(f.get('room_id')) || null,
      state: f.get('state'),
      image_url: img.trim() || null,
      notes: String(f.get('notes')).trim() || null,
    };
    const ok = await act(() => (editing ? api.update('tools', { id: editing.id }, row) : api.insert('tools', row)), { ok: editing ? 'Outil modifié.' : 'Outil ajouté.', tables: ['tools'] });
    if (ok) { edit(null); setFormKey((k) => k + 1); }
  };
  const categories = [...new Set(data.tools.map((t) => t.category).filter(Boolean))] as string[];

  return (
    <>
      <p className="muted">Liste des outils et équipements de l’atelier, visible par tous les enseignants dans l’onglet Systèmes.</p>
      <AddPanel summary={editing ? `Modifier ${editing.name}` : 'Ajouter un outil'} open={!!editing}>
        <form className="form" key={`${editing?.id ?? 'new'}-${formKey}`} onSubmit={submit}>
          <Field label="Nom *"><input className="in" name="name" required maxLength={120} defaultValue={editing?.name} /></Field>
          <Field label="Référence"><input className="in" name="ref" maxLength={80} defaultValue={editing?.ref ?? ''} /></Field>
          <Field label="Catégorie"><input className="in" name="category" list="tool-cats" maxLength={60} defaultValue={editing?.category ?? ''} /></Field>
          <datalist id="tool-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          <Field label="Quantité"><input className="in" name="qty" type="number" min={0} defaultValue={editing?.qty ?? 1} /></Field>
          <Field label="Rangement"><select className="in" name="room_id" defaultValue={editing?.room_id ?? ''}><Options placeholder="Non précisé" items={data.rooms.map((r) => [r.id, r.name])} /></select></Field>
          <Field label="État"><select className="in" name="state" defaultValue={editing?.state ?? 'ok'}><Options items={Object.entries(TOOL_STATES).map(([k, v]) => [k, v.label])} /></select></Field>
          <ImageField label="Image de l’outil" value={img} onChange={setImg} />
          <Field label="Notes" wide><textarea className="in" name="notes" maxLength={500} defaultValue={editing?.notes ?? ''} /></Field>
          <div className="actions">
            <button className="btn" type="submit">{editing ? 'Enregistrer' : 'Ajouter l’outil'}</button>
            {editing && <button className="btn ghost" type="button" onClick={() => edit(null)}>Annuler</button>}
          </div>
        </form>
      </AddPanel>
      <ToolsList actions={(t) => (
        <div className="row">
          <button className="btn ghost sm" onClick={() => { edit(t); window.scrollTo(0, 0); }}>Modifier</button>
          <ConfirmButton onConfirm={() => void act(() => api.remove('tools', { id: t.id }), { ok: 'Outil supprimé.', tables: ['tools'] })}>Supprimer</ConfirmButton>
        </div>
      )} />
    </>
  );
}
