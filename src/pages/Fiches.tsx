import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { usePersisted } from '@/hooks/usePersisted';
import { dropFiles } from '@/lib/docs';
import { useAuth } from '@/state/auth';
import { useAct, useStore } from '@/state/store';
import { COMPETENCES, DOMAINS, LEVELS } from '@/lib/domain';
import { fmtStamp } from '@/lib/dates';
import type { Fiche, FicheKind, Level } from '@/lib/types';
import { ConfirmButton, Empty, Field, Options, PageHead, Seg } from '@/components/ui';
import { DocsEditor, DocsViewer } from '@/components/Docs';
import { asDocs, cleanDocs, orphanPaths, type Doc } from '@/lib/docs';

interface Activity { activite: string; professeur: string; eleve: string; outils: string }
interface Data {
  discipline?: string; objectif?: string; repere?: string; duree?: string; prerequis?: string; contexte?: string; effectif?: string;
  seances?: string[]; numero?: string; sequence?: string; domaine?: string; objectifs?: string; activites?: Activity[]; competences?: string[];
}

const KIND: Record<FicheKind, string> = { sequence: 'Fiche séquence', seance: 'Fiche séance' };
const STD_ACTIVITIES: Activity[] = [
  { activite: 'Accueil, prérequis, contextualisation', professeur: 'Appel, questionnement, annonce de l’objectif', eleve: 'Participation orale', outils: 'Tableau' },
  { activite: 'Bilan', professeur: 'Synthèse et travail à faire', eleve: 'Écoutent, participent', outils: '' },
];

export default function Fiches() {
  const { data, who } = useStore();
  const { canWrite, isAdmin, profile } = useAuth();
  const [kind, setKind] = usePersisted<FicheKind | ''>('fiche-kind', '', ['', 'sequence', 'seance']);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ id?: string; kind: FicheKind } | null>(null);

  const list = useMemo(() => data.fiches.filter((f) => !kind || f.kind === kind).sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [data.fiches, kind]);
  const current = data.fiches.find((f) => f.id === openId);

  if (draft || current) {
    const f = draft?.id ? data.fiches.find((x) => x.id === draft.id) : current;
    const editable = !!draft && (!f || isAdmin || f.created_by === profile?.id);
    return <Editor fiche={f} kind={draft?.kind ?? f!.kind} editable={editable && canWrite}
      canEdit={!!f && canWrite && (isAdmin || f.created_by === profile?.id)} onEdit={() => f && setDraft({ id: f.id, kind: f.kind })}
      onOpen={(id) => { setDraft(null); setOpenId(id); }}
      onClose={() => { setDraft(null); setOpenId(null); }} onSaved={(id) => { setDraft(null); setOpenId(id); }} />;
  }

  return (
    <>
      <PageHead tab="fiches" title="Fiches de séquence et de séance" />
      <div className="tools">
        <Seg<FicheKind | ''> label="Type" value={kind} onChange={setKind} items={[['', 'Toutes'], ['sequence', 'Séquences'], ['seance', 'Séances']]} />
        {canWrite && <>
          <button className="btn sm" onClick={() => setDraft({ kind: 'sequence' })}>+ Fiche séquence</button>
          <button className="btn sm" onClick={() => setDraft({ kind: 'seance' })}>+ Fiche séance</button>
        </>}
      </div>
      <section className="panel">
        {list.length === 0 ? <Empty>Aucune fiche pour le moment.</Empty> : (
          <div className="scroll"><table className="tbl">
            <thead><tr><th>Titre</th><th>Type</th><th>Séquence</th><th>Niveau</th><th>Auteur</th><th>Modifiée</th><th /></tr></thead>
            <tbody>{list.map((f) => (
              <tr key={f.id}>
                <td><b>{f.title}</b>{asDocs(f.documents).length > 0 && <span className="sub">{asDocs(f.documents).length} document(s) joint(s)</span>}</td><td>{KIND[f.kind]}</td><td>{f.kind === 'seance' ? data.fiches.find((x) => x.id === f.sequence_id)?.title ?? '—' : `${data.fiches.filter((x) => x.sequence_id === f.id).length} séance(s)`}</td><td>{f.level ?? '—'}</td><td>{who(f.created_by)}</td><td>{fmtStamp(f.updated_at)}</td>
                <td><button className="btn ghost sm" onClick={() => setOpenId(f.id)}>Ouvrir</button></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}

function Editor({ fiche, kind, editable, canEdit, onEdit, onClose, onSaved, onOpen }: {
  fiche?: Fiche; kind: FicheKind; editable: boolean; canEdit: boolean; onEdit: () => void; onClose: () => void; onSaved: (id: string) => void; onOpen: (id: string) => void;
}) {
  const { data } = useStore();
  const { canWrite } = useAuth();
  const act = useAct();
  const [docs, setDocs] = useState<Doc[]>(() => asDocs(fiche?.documents));
  const [sequenceId, setSequenceId] = useState(fiche?.sequence_id ?? '');
  const [title, setTitle] = useState(fiche?.title ?? '');
  const [reusable, setReusable] = useState(fiche?.reusable ?? false);
  const [level, setLevel] = useState<Level | ''>(fiche?.level ?? '');
  const [d, setD] = useState<Data>(() => (fiche?.data as Data) ?? (kind === 'seance' ? { activites: STD_ACTIVITIES } : { seances: ['', ''] }));
  const set = (patch: Data) => { touched.current = true; setD((x) => ({ ...x, ...patch })); };
  const comps = d.competences ?? [];

  const save = async () => {
    if (!title.trim()) return void act(() => Promise.reject(new Error('Donnez un titre à la fiche.')));
    const row = { kind, title: title.trim(), level: level || null, data: d, documents: cleanDocs(docs), reusable, sequence_id: kind === 'seance' ? sequenceId || null : null };
    let id = fiche?.id;
    const ok = await act(async () => {
      if (id) await api.update('fiches', { id }, row);
      else id = ((await api.insert<Fiche>('fiches', row))[0] as Fiche).id;
    }, { ok: 'Fiche enregistrée.', tables: ['fiches'] });
    if (ok && fiche) void dropFiles(orphanPaths(asDocs(fiche.documents), row.documents));
    if (ok) clearDraft();
    if (ok && id) onSaved(id);
  };

  // Brouillon : conservé dans ce navigateur pendant la saisie, proposé à la réouverture
  const draftKey = `parc:draft:fiche:${fiche?.id ?? `new-${kind}`}`;
  const [draft, setDraft] = useState<{ title: string; level: Level | ''; d: Data; sequenceId: string } | null>(() => {
    try { const raw = window.localStorage.getItem(draftKey); return raw ? JSON.parse(raw) : null; } catch { return null; }
  });
  const touched = useRef(false);
  useEffect(() => {
    if (!editable || !touched.current) return;
    const t = window.setTimeout(() => {
      try { window.localStorage.setItem(draftKey, JSON.stringify({ title, level, d, sequenceId })); } catch { /* ignoré */ }
    }, 600);
    return () => window.clearTimeout(t);
  }, [title, level, d, sequenceId, editable, draftKey]);
  const markTouched = () => { touched.current = true; };
  const clearDraft = () => { try { window.localStorage.removeItem(draftKey); } catch { /* ignoré */ } setDraft(null); };

  const ro = !editable;
  const sequences = data.fiches.filter((x) => x.kind === 'sequence').sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  const linkedSeq = data.fiches.find((x) => x.id === (fiche?.sequence_id ?? sequenceId));
  const seances = fiche ? data.fiches.filter((x) => x.sequence_id === fiche.id).sort((a, b) => a.title.localeCompare(b.title, 'fr', { numeric: true })) : [];
  const text = (label: string, key: keyof Data, rows = 2, wide = true) => (
    <Field label={label} wide={wide}>
      {ro ? <div className="pre">{(d[key] as string) || '—'}</div> : <textarea className="in" rows={rows} maxLength={4000} value={(d[key] as string) ?? ''} onChange={(e) => set({ [key]: e.target.value })} />}
    </Field>
  );

  return (
    <>
      <PageHead title={title || `Nouvelle ${KIND[kind].toLowerCase()}`}>{KIND[kind]}{fiche ? '' : ' (non enregistrée)'}</PageHead>
      <div className="tools no-print">
        <button className="btn ghost sm" onClick={onClose}>← Retour à la liste</button>
        {ro && canEdit && <button className="btn sm" onClick={onEdit}>Modifier</button>}
        {editable && <button className="btn sm" onClick={() => void save()}>Enregistrer</button>}
        <button className="btn ghost sm" onClick={() => window.print()}>Imprimer</button>
        {fiche && canWrite && <button className="btn ghost sm" title="Copie la fiche (les fichiers déposés ne sont pas copiés, seulement les liens)" onClick={async () => {
          let newId = '';
          const ok = await act(async () => {
            const [row] = await api.insert<Fiche>('fiches', { kind: fiche.kind, title: `${fiche.title} (copie)`, level: fiche.level, data: fiche.data, documents: asDocs(fiche.documents).filter((x) => x.url), reusable: false, sequence_id: fiche.sequence_id });
            newId = row.id;
          }, { ok: 'Fiche dupliquée.', tables: ['fiches'] });
          if (ok && newId) onOpen(newId);
        }}>Dupliquer</button>}
        {fiche && canEdit && <ConfirmButton detail={`Supprimer la fiche « ${fiche.title} » ?${seances.length ? ` ${seances.length} séance(s) y sont rattachées et seront détachées.` : ''} Les fichiers déposés sont supprimés.`} onConfirm={async () => { if (await act(() => api.remove('fiches', { id: fiche.id }), { ok: 'Fiche supprimée.', tables: ['fiches'] })) { void dropFiles(orphanPaths(asDocs(fiche.documents), [])); onClose(); } }}>Supprimer</ConfirmButton>}
      </div>
      {editable && draft && (
        <div className="alert soft no-print" role="status">
          Un brouillon non enregistré de cette fiche existe sur cet appareil.
          <button className="btn sm" style={{ marginLeft: 8 }} onClick={() => { setTitle(draft.title); setLevel(draft.level); setD(draft.d); setSequenceId(draft.sequenceId); setDraft(null); touched.current = true; }}>Restaurer le brouillon</button>
          <button className="btn ghost sm" style={{ marginLeft: 4 }} onClick={clearDraft}>Ignorer</button>
        </div>
      )}
      <section className="panel form fiche-sheet">
        <Field label="Titre *" wide>{ro ? <b>{title}</b> : <input className="in" value={title} maxLength={160} onChange={(e) => { markTouched(); setTitle(e.target.value); }} />}</Field>
        {!ro && <label className="row wide"><input type="checkbox" checked={reusable} onChange={(e) => setReusable(e.target.checked)} /> Ressource réutilisable (visible dans la Banque de ressources)</label>}
        <Field label="Niveau">{ro ? <span>{level || '—'}</span> : <select className="in" value={level} onChange={(e) => setLevel(e.target.value as Level | '')}><Options placeholder="Non précisé" items={LEVELS.map((l) => [l, l])} /></select>}</Field>
        {kind === 'sequence' ? <>
          {text('Discipline', 'discipline', 1, false)}
          {text('Durée', 'duree', 1, false)}
          {text('Effectif', 'effectif', 1, false)}
          {text('Objectif', 'objectif')}
          {text('Repère dans l’année', 'repere', 1)}
          {text('Prérequis', 'prerequis')}
          {text('Contexte pédagogique', 'contexte', 3)}
        </> : <>
          {text('Numéro de séance', 'numero', 1, false)}
          {ro ? (
            <div className="f wide"><span className="lab">Fiche séquence liée</span>
              {linkedSeq ? <button type="button" className="btn ghost sm" onClick={() => onOpen(linkedSeq.id)}>{linkedSeq.title}</button> : <span>—</span>}
            </div>
          ) : (
            <Field label="Fiche séquence liée" wide>
              <select className="in" value={sequenceId} onChange={(e) => setSequenceId(e.target.value)}>
                <Options placeholder="Aucune" items={sequences.map((x) => [x.id, `${x.title}${x.level ? ` (${x.level})` : ''}`])} />
              </select>
            </Field>
          )}
          <Field label="Domaine d’activité">{ro ? <span>{d.domaine || '—'}</span> : <select className="in" value={d.domaine ?? ''} onChange={(e) => set({ domaine: e.target.value })}><Options placeholder="Choisir" items={Object.values(DOMAINS).map((x) => [x, x])} /></select>}</Field>
          {text('Objectifs', 'objectifs', 3)}
          {text('Prérequis', 'prerequis')}
        </>}
        <div className="f wide">
          <span className="lab">Compétences visées</span>
          <div className="picks">{Object.keys(COMPETENCES).filter((c) => !ro || comps.includes(c)).map((c) => (
            <label key={c} className="pick" title={COMPETENCES[c]}><input type="checkbox" disabled={ro} checked={comps.includes(c)} onChange={() => set({ competences: comps.includes(c) ? comps.filter((x) => x !== c) : [...comps, c] })} />{c}</label>
          ))}{ro && comps.length === 0 && <span>—</span>}</div>
        </div>
        {kind === 'sequence' ? (
          <div className="f wide">
            <span className="lab">Séances</span>
            {(d.seances ?? []).map((s, i) => (
              <div key={i} className="row">
                <b>Séance {i + 1}</b>
                {ro ? <span className="pre">{s || '—'}</span> : <>
                  <input className="in" style={{ flex: 1 }} aria-label={`Séance ${i + 1}`} value={s} maxLength={500} onChange={(e) => set({ seances: (d.seances ?? []).map((x, j) => (j === i ? e.target.value : x)) })} />
                  <button type="button" className="btn ghost sm" onClick={() => set({ seances: (d.seances ?? []).filter((_, j) => j !== i) })}>Retirer</button>
                </>}
              </div>
            ))}
            {!ro && <button type="button" className="btn ghost sm" onClick={() => set({ seances: [...(d.seances ?? []), ''] })}>+ Ajouter une séance</button>}
          </div>
        ) : (
          <div className="f wide">
            <span className="lab">Déroulement</span>
            <div className="scroll"><table>
              <thead><tr><th>Activité</th><th>Professeur</th><th>Élève</th><th>Outils et supports</th>{!ro && <th />}</tr></thead>
              <tbody>{(d.activites ?? []).map((a, i) => (
                <tr key={i}>
                  {(['activite', 'professeur', 'eleve', 'outils'] as const).map((k) => (
                    <td key={k}>{ro ? <span className="pre">{a[k]}</span> : <textarea className="in" rows={2} aria-label={`${k} ${i + 1}`} maxLength={600} value={a[k]}
                      onChange={(e) => set({ activites: (d.activites ?? []).map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) })} />}</td>
                  ))}
                  {!ro && <td><button type="button" className="btn ghost sm" onClick={() => set({ activites: (d.activites ?? []).filter((_, j) => j !== i) })}>Retirer</button></td>}
                </tr>))}</tbody>
            </table></div>
            {!ro && <button type="button" className="btn ghost sm" onClick={() => set({ activites: [...(d.activites ?? []), { activite: '', professeur: '', eleve: '', outils: '' }] })}>+ Ajouter une ligne</button>}
          </div>
        )}
        {ro ? (
          <div className="f wide"><span className="lab">Documents joints</span><DocsViewer docs={docs} /></div>
        ) : (
          <DocsEditor value={docs} onChange={setDocs} />
        )}
        {kind === 'sequence' && fiche && (
          <div className="f wide">
            <span className="lab">Fiches séance rattachées ({seances.length})</span>
            {seances.length === 0 ? <span className="muted">Aucune. Créez une fiche séance et choisissez cette séquence.</span> : (
              <div className="docs">{seances.map((x) => (
                <div key={x.id} className="doc"><span className="doc-t">{x.title}</span>
                  {asDocs(x.documents).length > 0 && <span className="muted small">{asDocs(x.documents).length} document(s)</span>}
                  <button type="button" className="btn ghost sm no-print" onClick={() => onOpen(x.id)}>Ouvrir</button></div>
              ))}</div>
            )}
          </div>
        )}
      </section>
    </>
  );
}
