import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/state/auth';
import { useAct, useStore } from '@/state/store';
import { MAINT_KIND, MAINT_STATUS, PRIORITIES } from '@/lib/domain';
import { fmtDate, fmtStamp, iso } from '@/lib/dates';
import type { Maintenance as M } from '@/lib/types';
import { AddPanel, Chip, ConfirmButton, Empty, Field, Options, PageHead, Seg } from '@/components/ui';

type Filter = 'open' | 'all' | 'done';

export default function Maintenance() {
  const { data, systemById, who } = useStore();
  const { canWrite, isAdmin, profile } = useAuth();
  const act = useAct();
  const [filter, setFilter] = useState<Filter>('open');
  const [formKey, setFormKey] = useState(0);
  const today = iso(new Date());

  const list = data.maintenance
    .filter((m) => (filter === 'all' ? true : filter === 'done' ? m.status === 'done' : m.status !== 'done'))
    .sort((a, b) => PRIORITIES[b.priority].rank - PRIORITIES[a.priority].rank || (a.due_date ?? '9').localeCompare(b.due_date ?? '9'));

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ok = await act(
      () => api.insert('maintenance', {
        system_id: f.get('system_id'), kind: f.get('kind'), title: String(f.get('title')).trim(),
        description: String(f.get('description')).trim() || null, priority: f.get('priority'),
        due_date: String(f.get('due_date')) || null, status: 'open',
      }),
      { ok: 'Intervention ajoutée.', tables: ['maintenance'] },
    );
    if (ok) setFormKey((k) => k + 1);
  };

  const addNote = async (m: M, e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const text = String(new FormData(form).get('text')).trim();
    if (!text) return;
    if (await act(() => api.insert('maintenance_notes', { maintenance_id: m.id, text }), { tables: ['maintenance_notes'] })) form.reset();
  };

  return (
    <>
      <PageHead tab="maintenance" title="Maintenance des systèmes" />
      {canWrite && (
        <AddPanel summary="Déclarer une intervention">
          {data.systems.length === 0 ? <Empty>Ajoutez d’abord un système dans l’onglet Systèmes.</Empty> : (
            <form className="form" key={formKey} onSubmit={submit}>
              <Field label="Système *"><select className="in" name="system_id" required><Options placeholder="Choisir…" items={data.systems.map((s) => [s.id, s.name])} /></select></Field>
              <Field label="Type"><select className="in" name="kind"><Options items={Object.entries(MAINT_KIND)} /></select></Field>
              <Field label="Titre *" wide><input className="in" name="title" required maxLength={120} /></Field>
              <Field label="Description" wide><textarea className="in" name="description" maxLength={1000} /></Field>
              <Field label="Priorité"><select className="in" name="priority"><Options items={Object.entries(PRIORITIES).map(([k, v]) => [k, v.label])} /></select></Field>
              <Field label="Échéance"><input className="in" type="date" name="due_date" /></Field>
              <div className="actions"><button className="btn" type="submit">Ajouter</button></div>
            </form>
          )}
        </AddPanel>
      )}
      <section className="panel">
        <div className="row between">
          <h2>Interventions ({list.length})</h2>
          <Seg<Filter> label="Filtre" value={filter} onChange={setFilter} items={[['open', 'À traiter'], ['done', 'Terminées'], ['all', 'Toutes']]} />
        </div>
        {list.length === 0 ? <Empty>Aucune intervention.</Empty> : (
          <div className="stack">
            {list.map((m) => {
              const late = m.status !== 'done' && !!m.due_date && m.due_date < today;
              const notes = data.maintenance_notes.filter((n) => n.maintenance_id === m.id).sort((a, b) => a.created_at.localeCompare(b.created_at));
              return (
                <article key={m.id} className={'card' + (m.priority === 'u' && m.status !== 'done' ? ' urgent' : late ? ' late' : '')}>
                  <div className="row between">
                    <h3>{m.title}</h3>
                    <div className="row">
                      <Chip tone={PRIORITIES[m.priority].tone}>{PRIORITIES[m.priority].label}</Chip>
                      <Chip tone="idle">{MAINT_KIND[m.kind]}</Chip>
                      <Chip tone={MAINT_STATUS[m.status].tone}>{MAINT_STATUS[m.status].label}</Chip>
                    </div>
                  </div>
                  <p className="muted small">
                    {systemById.get(m.system_id)?.name} · déclarée par {who(m.created_by)} le {fmtStamp(m.created_at)}
                    {m.due_date && <> · échéance {fmtDate(m.due_date)}{late ? ' (dépassée)' : ''}</>}
                    {m.closed_at && <> · clôturée le {fmtStamp(m.closed_at)}</>}
                  </p>
                  {m.description && <p>{m.description}</p>}
                  {notes.length > 0 && (
                    <div className="notes">{notes.map((n) => <p key={n.id}><b>{who(n.author_id)}</b> ({fmtStamp(n.created_at)}) : {n.text}</p>)}</div>
                  )}
                  {canWrite && (
                    <div className="row">
                      <select className="in" aria-label="Statut" value={m.status} onChange={(e) => void act(() => api.update('maintenance', { id: m.id }, { status: e.target.value }), { tables: ['maintenance'] })}>
                        <Options items={Object.entries(MAINT_STATUS).map(([k, v]) => [k, v.label])} />
                      </select>
                      <form className="inline" onSubmit={(e) => void addNote(m, e)}>
                        <input className="in" name="text" aria-label="Ajouter une note" placeholder="Ajouter une note…" maxLength={500} />
                        <button className="btn ghost sm" type="submit">Noter</button>
                      </form>
                      {(isAdmin || m.created_by === profile?.id) && (
                        <ConfirmButton onConfirm={() => void act(() => api.remove('maintenance', { id: m.id }), { ok: 'Intervention supprimée.', tables: ['maintenance', 'maintenance_notes'] })}>Supprimer</ConfirmButton>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
