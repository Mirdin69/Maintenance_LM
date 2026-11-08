import { useMemo, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAct, useStore } from '@/state/store';
import { useAuth } from '@/state/auth';
import { displayName } from '@/lib/domain';
import { fmtDate } from '@/lib/dates';
import type { Idea, IdeaCategory, IdeaStatus } from '@/lib/types';
import { Chip, ConfirmButton, Empty, Field, PageHead, Seg } from '@/components/ui';

const CATEGORIES: Record<IdeaCategory, string> = { fonction: 'Nouvelle fonction', affichage: 'Affichage, confort', donnees: 'Données, imports', autre: 'Autre' };
const STATUSES: Record<IdeaStatus, { label: string; tone: 'idle' | 'ok' | 'warn' | 'bad' | 'info' }> = {
  nouvelle: { label: 'Nouvelle', tone: 'info' }, etudiee: { label: 'À l’étude', tone: 'warn' }, retenue: { label: 'Retenue', tone: 'ok' }, faite: { label: 'Réalisée', tone: 'ok' }, refusee: { label: 'Non retenue', tone: 'idle' },
};
type Filter = 'ouvertes' | 'faites' | 'toutes';

/** Boîte à idées : chaque enseignant propose et vote, les gestionnaires répondent */
export default function Ideas() {
  const { data, profileById } = useStore();
  const { user, isAdmin } = useAuth();
  const act = useAct();
  const [filter, setFilter] = useState<Filter>('ouvertes');
  const [formKey, setFormKey] = useState(0);

  const list = useMemo(() => {
    const open = (i: Idea) => i.status !== 'faite' && i.status !== 'refusee';
    return data.ideas
      .filter((i) => (filter === 'toutes' ? true : filter === 'faites' ? !open(i) : open(i)))
      .sort((a, b) => b.votes.length - a.votes.length || b.created_at.localeCompare(a.created_at));
  }, [data.ideas, filter]);

  const send = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const title = String(f.get('title')).trim();
    if (title.length < 3) return;
    const body = String(f.get('body')).trim();
    if (await act(() => api.insert('ideas', [{ title, body: body || null, category: String(f.get('category')) }]), { ok: 'Merci ! Votre idée a été envoyée.', tables: ['ideas'] })) setFormKey((k) => k + 1);
  };
  const vote = (i: Idea) => act(() => api.rpc('toggle_idea_vote', { p_id: i.id }), { ok: i.votes.includes(user?.id ?? '') ? 'Vote retiré.' : 'Vote pris en compte.', tables: ['ideas'] });
  const patch = (i: Idea, p: Partial<Idea>) => act(() => api.update('ideas', { id: i.id }, p), { ok: 'Enregistré.', tables: ['ideas'] });

  return (
    <>
      <PageHead tab="idees" title="Idées d’amélioration" />
      <section className="panel stack">
        <h2>Proposer une idée</h2>
        <form className="form" key={formKey} onSubmit={send}>
          <Field label="Votre idée en une phrase *"><input className="in" name="title" required minLength={3} maxLength={120} placeholder="Pouvoir exporter le semainier en PDF" /></Field>
          <Field label="Catégorie"><select className="in" name="category" defaultValue="fonction">{Object.entries(CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Détails (à quoi cela servirait, dans quel cas)" wide><textarea className="in" name="body" rows={3} maxLength={2000} /></Field>
          <div className="actions"><button className="btn" type="submit">Envoyer l’idée</button></div>
        </form>
      </section>

      <div className="tools">
        <Seg<Filter> label="Idées affichées" value={filter} onChange={setFilter} items={[['ouvertes', 'En cours'], ['faites', 'Réalisées ou non retenues'], ['toutes', 'Toutes']]} />
      </div>
      {list.length === 0 ? <Empty>Aucune idée dans cette liste pour le moment.</Empty> : (
        <div className="stack">
          {list.map((i) => {
            const mine = !!user && i.votes.includes(user.id);
            const st = STATUSES[i.status];
            return (
              <article key={i.id} className="panel stack">
                <div className="row between">
                  <h3 style={{ margin: 0 }}>{i.title}</h3>
                  <Chip tone={st.tone}>{st.label}</Chip>
                </div>
                {i.body && <p style={{ whiteSpace: 'pre-wrap' }}>{i.body}</p>}
                <p className="muted small">{CATEGORIES[i.category]} · proposée par {i.created_by ? (profileById.get(i.created_by) ? displayName(profileById.get(i.created_by)!) : 'un collègue') : 'un ancien compte'} le {fmtDate(i.created_at.slice(0, 10))}</p>
                {i.answer && <div className="notice" role="note"><span><b>Réponse :</b> {i.answer}</span></div>}
                <div className="row">
                  <button type="button" className="btn ghost sm" aria-pressed={mine} onClick={() => void vote(i)}>{mine ? '👍 Je soutiens' : '👍 Soutenir'} · {i.votes.length}</button>
                  {isAdmin && (
                    <>
                      <select className="in" aria-label={`Statut de l’idée « ${i.title} »`} value={i.status} onChange={(e) => void patch(i, { status: e.target.value as IdeaStatus })} style={{ width: 'auto' }}>
                        {Object.entries(STATUSES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                      </select>
                      <input className="in" aria-label={`Réponse à « ${i.title} »`} placeholder="Réponse aux collègues" defaultValue={i.answer ?? ''} maxLength={1000} key={`${i.id}${i.answer ?? ''}`} style={{ flex: 1, minWidth: 180 }}
                        onBlur={(e) => e.target.value.trim() !== (i.answer ?? '') && void patch(i, { answer: e.target.value.trim() || null })} />
                      <ConfirmButton detail={`Supprimer l’idée « ${i.title} » ?`} onConfirm={() => void act(() => api.remove('ideas', { id: i.id }), { ok: 'Idée supprimée.', tables: ['ideas'] })}>Supprimer</ConfirmButton>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
