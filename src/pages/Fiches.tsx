import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { usePersisted } from '@/hooks/usePersisted';
import { dropFiles } from '@/lib/docs';
import { useAuth } from '@/state/auth';
import { useAct, useStore } from '@/state/store';
import { CC_LABELS, COMPETENCES, DOMAINS, LEVELS, ccToC } from '@/lib/domain';
import { LEVEL_NOTE, NATURES, ccPair, emptyActivity, emptyEval, emptyPart, fmtMinutes, lines, missingEvalRows, seanceData, sequenceData, totalMinutes, type SeanceData, type SequenceData } from '@/lib/fiche';
import { fmtStamp } from '@/lib/dates';
import type { Fiche, FicheKind, Level } from '@/lib/types';
import { ConfirmButton, Empty, Field, Options, PageHead, Seg, downloadBlob } from '@/components/ui';
import { fileName, seanceModel, sequenceModel, toDocx, toPdf } from '@/lib/ficheExport';
import { DocsEditor, DocsViewer } from '@/components/Docs';
import { asDocs, cleanDocs, orphanPaths, type Doc } from '@/lib/docs';

const KIND: Record<FicheKind, string> = { sequence: 'Fiche séquence', seance: 'Fiche séance' };
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

const Bar = ({ children }: { children: React.ReactNode }) => <h2 className="fd-bar">{children}</h2>;

/** Rend une liste de lignes de texte en puces */
const Bullets = ({ text }: { text: string }) => {
  const l = lines(text);
  return l.length ? <ul className="fd-list">{l.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="muted">—</p>;
};

/** Compétences communes (CC) et leur compétence du référentiel (C), en deux colonnes */
function CompetenceTable({ cc, c }: { cc: string[]; c: string[] }) {
  const rows = cc.map((x) => ({ cc: x, c: ccToC(x) }));
  const extra = c.filter((x) => !rows.some((r) => r.c === x));
  return (
    <div className="scroll"><table className="fd-tbl">
      <thead><tr><th>Vademecum</th><th>Compétence détaillée (vademecum Seconde)</th><th>MELEC</th><th>Compétence du référentiel MELEC</th></tr></thead>
      <tbody>
        {rows.map((r) => <tr key={r.cc}><td><b>{r.cc}</b></td><td>{CC_LABELS[r.cc]}</td><td>{r.c && <b>{r.c}</b>}</td><td>{r.c && COMPETENCES[r.c]}</td></tr>)}
        {extra.map((x) => <tr key={x}><td /><td /><td><b>{x}</b></td><td>{COMPETENCES[x]}</td></tr>)}
        {rows.length + extra.length === 0 && <tr><td colSpan={4} className="muted">—</td></tr>}
      </tbody>
    </table></div>
  );
}

/** Sélection des compétences communes (CC) et des compétences du référentiel (C) */
function CompetencePicker({ cc, c, onChange }: { cc: string[]; c: string[]; onChange: (patch: { cc?: string[]; competences?: string[] }) => void }) {
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  return (
    <>
      <div className="f wide">
        <span className="lab">Compétences communes du vademecum (CC)</span>
        <div className="picks">{Object.keys(CC_LABELS).map((x) => (
          <label key={x} className="pick" title={`${CC_LABELS[x]}${ccToC(x) ? ` — référentiel ${ccToC(x)}` : ''}`}>
            <input type="checkbox" checked={cc.includes(x)} onChange={() => {
              const next = toggle(cc, x);
              const k = ccToC(x);
              onChange({ cc: next, ...(k && next.includes(x) && !c.includes(k) ? { competences: [...c, k] } : {}) });
            }} /> {x}
          </label>
        ))}</div>
      </div>
      <div className="f wide">
        <span className="lab">Compétences du référentiel MELEC (C)</span>
        <div className="picks">{Object.keys(COMPETENCES).map((x) => (
          <label key={x} className="pick" title={COMPETENCES[x]}><input type="checkbox" checked={c.includes(x)} onChange={() => onChange({ competences: toggle(c, x) })} /> {x}</label>
        ))}</div>
      </div>
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
  const [sq, setSq] = useState<SequenceData>(() => sequenceData(fiche?.data));
  const [sc, setSc] = useState<SeanceData>(() => seanceData(fiche?.data));
  const touched = useRef(false);
  const setSeq = (patch: Partial<SequenceData>) => { touched.current = true; setSq((x) => ({ ...x, ...patch })); };
  const setSea = (patch: Partial<SeanceData>) => { touched.current = true; setSc((x) => ({ ...x, ...patch })); };
  const current = kind === 'sequence' ? sq : sc;

  const save = async () => {
    if (!title.trim()) return void act(() => Promise.reject(new Error('Donnez un titre à la fiche.')));
    // Les champs de l'ancien modèle sont conservés tels quels derrière les nouveaux
    const row = { kind, title: title.trim(), level: level || null, data: { ...(fiche?.data ?? {}), ...current }, documents: cleanDocs(docs), reusable, sequence_id: kind === 'seance' ? sequenceId || null : null };
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
  const [draft, setDraft] = useState<{ title: string; level: Level | ''; d: unknown; sequenceId: string } | null>(() => {
    try { const raw = window.localStorage.getItem(draftKey); return raw ? JSON.parse(raw) : null; } catch { return null; }
  });
  useEffect(() => {
    if (!editable || !touched.current) return;
    const t = window.setTimeout(() => {
      try { window.localStorage.setItem(draftKey, JSON.stringify({ title, level, d: current, sequenceId })); } catch { /* ignoré */ }
    }, 600);
    return () => window.clearTimeout(t);
  }, [title, level, current, sequenceId, editable, draftKey]);
  const markTouched = () => { touched.current = true; };
  const clearDraft = () => { try { window.localStorage.removeItem(draftKey); } catch { /* ignoré */ } setDraft(null); };

  const ro = !editable;
  const exportAs = (format: 'docx' | 'pdf') => act(async () => {
    const model = kind === 'sequence' ? sequenceModel(title, level, sq) : seanceModel(title, level, sc, data.fiches.find((x) => x.id === (fiche?.sequence_id ?? sequenceId))?.title);
    downloadBlob(fileName(title, format), format === 'docx' ? await toDocx(model) : await toPdf(model));
  }, { ok: format === 'docx' ? 'Fiche Word téléchargée.' : 'Fiche PDF téléchargée.' });
  const sequences = data.fiches.filter((x) => x.kind === 'sequence').sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  const linkedSeq = data.fiches.find((x) => x.id === (fiche?.sequence_id ?? sequenceId));
  const seances = fiche ? data.fiches.filter((x) => x.sequence_id === fiche.id).sort((a, b) => a.title.localeCompare(b.title, 'fr', { numeric: true })) : [];
  const area = (label: string, value: string, onChange: (v: string) => void, rows = 2, wide = true) => (
    <Field label={label} wide={wide}><textarea className="in" rows={rows} maxLength={4000} value={value} onChange={(e) => onChange(e.target.value)} /></Field>
  );
  const line = (label: string, value: string, onChange: (v: string) => void) => (
    <Field label={label}><input className="in" maxLength={300} value={value} onChange={(e) => onChange(e.target.value)} /></Field>
  );

  return (
    <>
      <PageHead title={title || `Nouvelle ${KIND[kind].toLowerCase()}`}>{KIND[kind]}{fiche ? '' : ' (non enregistrée)'}</PageHead>
      <div className="tools no-print">
        <button className="btn ghost sm" onClick={onClose}>← Retour à la liste</button>
        {ro && canEdit && <button className="btn sm" onClick={onEdit}>Modifier</button>}
        {editable && <button className="btn sm" onClick={() => void save()}>Enregistrer</button>}
        <button className="btn ghost sm" onClick={() => window.print()}>Imprimer</button>
        {ro && <>
          <button className="btn ghost sm" title="Télécharge la fiche au format Word (.docx)" onClick={() => void exportAs('docx')}>Exporter en Word</button>
          <button className="btn ghost sm" title="Télécharge la fiche au format PDF" onClick={() => void exportAs('pdf')}>Exporter en PDF</button>
        </>}
        {fiche && canWrite && <button className="btn ghost sm" title="Copie la fiche (les fichiers déposés ne sont pas copiés, seulement les liens)" onClick={async () => {
          let newId = '';
          const ok = await act(async () => {
            const [row] = await api.insert<Fiche>('fiches', { kind: fiche.kind, title: `${fiche.title} (copie)`, level: fiche.level, data: fiche.data, documents: asDocs(fiche.documents).filter((x) => x.url), reusable: false, sequence_id: fiche.sequence_id });
            newId = row.id;
          }, { ok: 'Fiche dupliquée.', tables: ['fiches'] });
          if (ok && newId) onOpen(newId);
        }}>Dupliquer</button>}
        {fiche && canEdit && <ConfirmButton detail={`Supprimer la fiche « ${fiche.title} » ?${seances.length ? ` ${seances.length} séance(s) y sont rattachées et seront détachées.` : ''} Les fichiers déposés sont supprimés.`} onConfirm={async () => {
          const ok = await act(async () => {
            await api.remove('fiches', { id: fiche.id });
            await dropFiles(orphanPaths(asDocs(fiche.documents), []));
          }, { ok: 'Fiche supprimée.', tables: ['fiches'] });
          if (ok) onClose();
        }}>Supprimer</ConfirmButton>}
      </div>
      {editable && draft && (
        <div className="alert soft no-print" role="status">
          Un brouillon non enregistré de cette fiche existe sur cet appareil.
          <button className="btn sm" style={{ marginLeft: 8 }} onClick={() => {
            setTitle(draft.title); setLevel(draft.level); setSequenceId(draft.sequenceId);
            if (kind === 'sequence') setSq(sequenceData(draft.d)); else setSc(seanceData(draft.d));
            setDraft(null); touched.current = true;
          }}>Restaurer le brouillon</button>
          <button className="btn ghost sm" style={{ marginLeft: 4 }} onClick={clearDraft}>Ignorer</button>
        </div>
      )}
      {ro ? (
        <section className="panel fiche-sheet fiche-doc">
          <h1 className="fd-title">{kind === 'sequence' ? 'FICHE DE SÉQUENCE' : `FICHE DE SÉANCE${sc.numero ? ` — ${sc.numero}` : ''}`}</h1>
          {kind === 'sequence' ? <SequenceView title={title} level={level} d={sq} /> : <SeanceView title={title} level={level} d={sc} sequence={linkedSeq} onOpen={onOpen} />}
          <div className="f wide"><span className="lab">Documents joints</span><DocsViewer docs={docs} /></div>
          {kind === 'sequence' && fiche && <Attached seances={seances} onOpen={onOpen} />}
        </section>
      ) : (
        <section className="panel form fiche-sheet">
          <Field label="Titre *" wide><input className="in" value={title} maxLength={160} onChange={(e) => { markTouched(); setTitle(e.target.value); }} /></Field>
          <label className="row wide"><input type="checkbox" checked={reusable} onChange={(e) => setReusable(e.target.checked)} /> Ressource réutilisable (visible dans la Banque de ressources)</label>
          <Field label="Niveau"><select className="in" value={level} onChange={(e) => { markTouched(); setLevel(e.target.value as Level | ''); }}><Options placeholder="Non précisé" items={LEVELS.map((l) => [l, l])} /></select></Field>
          {kind === 'sequence' ? (
            <>
              <Bar>Identité de la séquence</Bar>
              {line('Domaine', sq.domaine, (v) => setSeq({ domaine: v }))}
              {line('Modalité', sq.modalite, (v) => setSeq({ modalite: v }))}
              {area('Organisation (séances, durées, groupe, postes)', sq.organisation, (v) => setSeq({ organisation: v }))}
              {area('Prérequis', sq.prerequis, (v) => setSeq({ prerequis: v }))}
              {area('Objectif général', sq.objectif, (v) => setSeq({ objectif: v }))}
              <Bar>Compétences couvertes</Bar>
              <CompetencePicker cc={sq.cc} c={sq.competences} onChange={setSeq} />
              <Bar>Récapitulatif du TP</Bar>
              <div className="f wide">
                <div className="scroll"><table>
                  <thead><tr><th>Partie</th><th>Intitulé / support</th><th>Nature</th><th>Durée</th><th>Supports</th><th>Compétences</th><th /></tr></thead>
                  <tbody>{sq.parties.map((p, i) => {
                    const upd = (patch: Partial<typeof p>) => setSeq({ parties: sq.parties.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                    return (
                      <tr key={i}>
                        <td><input className="in" style={{ width: 60 }} aria-label={`Partie ${i + 1}`} value={p.partie} maxLength={10} onChange={(e) => upd({ partie: e.target.value })} /></td>
                        <td><textarea className="in" rows={2} aria-label={`Intitulé ${i + 1}`} value={p.intitule} maxLength={400} onChange={(e) => upd({ intitule: e.target.value })} /></td>
                        <td><input className="in" list="fiche-natures" aria-label={`Nature ${i + 1}`} value={p.nature} maxLength={30} onChange={(e) => upd({ nature: e.target.value })} /></td>
                        <td><input className="in" style={{ width: 80 }} aria-label={`Durée ${i + 1}`} value={p.duree} maxLength={20} placeholder="1 h 05" onChange={(e) => upd({ duree: e.target.value })} /></td>
                        <td><textarea className="in" rows={2} aria-label={`Supports ${i + 1}`} value={p.supports} maxLength={300} onChange={(e) => upd({ supports: e.target.value })} /></td>
                        <td><input className="in" aria-label={`Compétences ${i + 1}`} value={p.competences} maxLength={100} placeholder="CC11 (C1)" onChange={(e) => upd({ competences: e.target.value })} /></td>
                        <td><button type="button" className="btn ghost sm" onClick={() => setSeq({ parties: sq.parties.filter((_, j) => j !== i) })}>Retirer</button></td>
                      </tr>
                    );
                  })}</tbody>
                </table></div>
                <datalist id="fiche-natures">{NATURES.map((n) => <option key={n} value={n} />)}</datalist>
                <div className="row">
                  <button type="button" className="btn ghost sm" onClick={() => setSeq({ parties: [...sq.parties, emptyPart()] })}>+ Ajouter une partie</button>
                  {totalMinutes(sq.parties.map((p) => p.duree)) !== null && <span className="muted small">Total : {fmtMinutes(totalMinutes(sq.parties.map((p) => p.duree))!)}</span>}
                </div>
              </div>
              <Bar>Principe d’organisation</Bar>
              {sq.principe.map((p, i) => (
                <div key={i} className="f wide">
                  <input className="in" aria-label={`Rubrique ${i + 1}`} value={p.titre} maxLength={80} onChange={(e) => setSeq({ principe: sq.principe.map((x, j) => (j === i ? { ...x, titre: e.target.value } : x)) })} />
                  <textarea className="in" rows={2} aria-label={`Texte de la rubrique ${i + 1}`} maxLength={2000} value={p.texte} onChange={(e) => setSeq({ principe: sq.principe.map((x, j) => (j === i ? { ...x, texte: e.target.value } : x)) })} />
                  <button type="button" className="btn ghost sm" onClick={() => setSeq({ principe: sq.principe.filter((_, j) => j !== i) })}>Retirer la rubrique</button>
                </div>
              ))}
              <div className="f wide"><button type="button" className="btn ghost sm" onClick={() => setSeq({ principe: [...sq.principe, { titre: '', texte: '' }] })}>+ Ajouter une rubrique</button></div>
              <Bar>Cohérence pédagogique et fil rouge</Bar>
              {area('Une idée par ligne', sq.coherence, (v) => setSeq({ coherence: v }), 4)}
              <Bar>Évaluation</Bar>
              <p className="muted small wide">{LEVEL_NOTE}</p>
              <div className="f wide">
                <div className="scroll"><table>
                  <thead><tr><th>CC / C</th><th>Indicateur observé</th><th>NA</th><th>ECA</th><th>PA</th><th>A</th><th /></tr></thead>
                  <tbody>{sq.evaluation.map((r, i) => {
                    const upd = (patch: Partial<typeof r>) => setSeq({ evaluation: sq.evaluation.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                    return (
                      <tr key={i}>
                        <td><input className="in" style={{ width: 70 }} aria-label={`Compétence ${i + 1}`} value={r.cc} maxLength={12} onChange={(e) => upd({ cc: e.target.value })} />{ccToC(r.cc) && <span className="sub">{ccPair(r.cc)}</span>}</td>
                        {(['indicateur', 'na', 'eca', 'pa', 'a'] as const).map((k) => (
                          <td key={k}><textarea className="in" rows={3} aria-label={`${k === 'indicateur' ? 'Indicateur' : k.toUpperCase()} ${i + 1}`} maxLength={400} value={r[k]} onChange={(e) => upd({ [k]: e.target.value })} /></td>
                        ))}
                        <td><button type="button" className="btn ghost sm" onClick={() => setSeq({ evaluation: sq.evaluation.filter((_, j) => j !== i) })}>Retirer</button></td>
                      </tr>
                    );
                  })}</tbody>
                </table></div>
                <div className="row">
                  <button type="button" className="btn ghost sm" onClick={() => setSeq({ evaluation: [...sq.evaluation, emptyEval()] })}>+ Ajouter une ligne</button>
                  {missingEvalRows(sq.cc, sq.evaluation).length > 0 && (
                    <button type="button" className="btn ghost sm" onClick={() => setSeq({ evaluation: [...sq.evaluation, ...missingEvalRows(sq.cc, sq.evaluation)] })}>Ajouter les compétences cochées ({missingEvalRows(sq.cc, sq.evaluation).length})</button>
                  )}
                </div>
              </div>
              {area('Auto-évaluation', sq.autoeval, (v) => setSeq({ autoeval: v }), 3)}
            </>
          ) : (
            <>
              {line('Discipline', sc.discipline, (v) => setSea({ discipline: v }))}
              {line('Année', sc.annee, (v) => setSea({ annee: v }))}
              {line('Numéro de séance / thème', sc.numero, (v) => setSea({ numero: v }))}
              <Field label="Fiche séquence liée" wide>
                <select className="in" value={sequenceId} onChange={(e) => { markTouched(); setSequenceId(e.target.value); }}>
                  <Options placeholder="Aucune" items={sequences.map((x) => [x.id, `${x.title}${x.level ? ` (${x.level})` : ''}`])} />
                </select>
              </Field>
              <Field label="Domaine d’activité"><select className="in" value={sc.domaine} onChange={(e) => setSea({ domaine: e.target.value })}><Options placeholder="Choisir" items={Object.entries(DOMAINS)} /></select></Field>
              {area('Objectif du TP', sc.objectif, (v) => setSea({ objectif: v }), 2)}
              <Bar>Activité en lien avec le référentiel MELEC</Bar>
              {area('Contexte (fil rouge)', sc.contexte, (v) => setSea({ contexte: v }), 3)}
              <CompetencePicker cc={sc.cc} c={sc.competences} onChange={setSea} />
              {area('Position dans l’année', sc.repere, (v) => setSea({ repere: v }), 1)}
              {area('Prérequis (un par ligne)', sc.prerequis, (v) => setSea({ prerequis: v }), 3)}
              {area('Organisation', sc.organisation, (v) => setSea({ organisation: v }), 2)}
              <Bar>Fiche de déroulement</Bar>
              {area('Durée totale et parcours', sc.duree, (v) => setSea({ duree: v }), 2)}
              {sc.blocs.map((b, bi) => {
                const updBlock = (patch: Partial<typeof b>) => setSea({ blocs: sc.blocs.map((x, j) => (j === bi ? { ...x, ...patch } : x)) });
                const total = totalMinutes(b.lignes.map((l) => l.duree));
                return (
                  <div key={bi} className="f wide fd-block">
                    <input className="in" aria-label={`Titre du bloc ${bi + 1}`} placeholder="Mercredi – 3 séances de 55 min (165 min) : préparation, implantation…" value={b.titre} maxLength={200} onChange={(e) => updBlock({ titre: e.target.value })} />
                    <div className="scroll"><table>
                      <thead><tr><th>Activité</th><th>Durée</th><th>Professeur</th><th>Élève</th><th>Outils et supports</th><th /></tr></thead>
                      <tbody>{b.lignes.map((a, i) => (
                        <tr key={i}>
                          {(['activite', 'duree', 'professeur', 'eleve', 'outils'] as const).map((k) => (
                            <td key={k}><textarea className="in" rows={k === 'duree' ? 1 : 3} style={k === 'duree' ? { width: 70 } : undefined} aria-label={`${k} ${bi + 1}.${i + 1}`} maxLength={800} value={a[k]}
                              onChange={(e) => updBlock({ lignes: b.lignes.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) })} /></td>
                          ))}
                          <td><button type="button" className="btn ghost sm" onClick={() => updBlock({ lignes: b.lignes.filter((_, j) => j !== i) })}>Retirer</button></td>
                        </tr>))}</tbody>
                    </table></div>
                    <div className="row">
                      <button type="button" className="btn ghost sm" onClick={() => updBlock({ lignes: [...b.lignes, emptyActivity()] })}>+ Ajouter une ligne</button>
                      {total !== null && <span className="muted small">Total du bloc : {fmtMinutes(total)}</span>}
                      {sc.blocs.length > 1 && <button type="button" className="btn ghost sm" onClick={() => setSea({ blocs: sc.blocs.filter((_, j) => j !== bi) })}>Retirer ce bloc</button>}
                    </div>
                  </div>
                );
              })}
              <div className="f wide"><button type="button" className="btn ghost sm" onClick={() => setSea({ blocs: [...sc.blocs, { titre: '', lignes: [emptyActivity()] }] })}>+ Ajouter un bloc (jour ou demi-journée)</button></div>
              <Bar>Scénario</Bar>
              {area('Mise en situation', sc.situation, (v) => setSea({ situation: v }), 3)}
              {area('Déroulement (une idée par ligne)', sc.deroulement, (v) => setSea({ deroulement: v }), 5)}
              <div className="f wide">
                <span className="lab">Points de vigilance</span>
                {sc.vigilance.map((w, i) => (
                  <div key={i} className="row">
                    <select className="in" style={{ width: 150 }} aria-label={`Type du point ${i + 1}`} value={w.type} onChange={(e) => setSea({ vigilance: sc.vigilance.map((x, j) => (j === i ? { ...x, type: e.target.value as 'danger' | 'ok' } : x)) })}>
                      <option value="danger">⚠ Sécurité</option><option value="ok">✔ Bonne pratique</option>
                    </select>
                    <textarea className="in" style={{ flex: 1 }} rows={2} aria-label={`Point de vigilance ${i + 1}`} maxLength={1000} value={w.texte} onChange={(e) => setSea({ vigilance: sc.vigilance.map((x, j) => (j === i ? { ...x, texte: e.target.value } : x)) })} />
                    <button type="button" className="btn ghost sm" onClick={() => setSea({ vigilance: sc.vigilance.filter((_, j) => j !== i) })}>Retirer</button>
                  </div>
                ))}
                <button type="button" className="btn ghost sm" onClick={() => setSea({ vigilance: [...sc.vigilance, { type: 'danger', texte: '' }] })}>+ Ajouter un point</button>
              </div>
              <div className="f wide"><span className="lab">Différenciation</span></div>
              {area('Guidé', sc.guide, (v) => setSea({ guide: v }), 2)}
              {area('Autonome', sc.autonome, (v) => setSea({ autonome: v }), 2)}
              {area('Expert', sc.expert, (v) => setSea({ expert: v }), 2)}
              {area('Annexe', sc.annexe, (v) => setSea({ annexe: v }), 2)}
            </>
          )}
          <DocsEditor value={docs} onChange={setDocs} />
          {kind === 'sequence' && fiche && <Attached seances={seances} onOpen={onOpen} />}
        </section>
      )}
    </>
  );
}

function Attached({ seances, onOpen }: { seances: Fiche[]; onOpen: (id: string) => void }) {
  return (
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
  );
}

/** Fiche de séquence en lecture : même plan que le document Word */
function SequenceView({ title, level, d }: { title: string; level: Level | ''; d: SequenceData }) {
  const kv = (rows: Array<[string, string]>) => (
    <table className="fd-kv"><tbody>{rows.filter(([, v]) => v.trim()).map(([k, v]) => <tr key={k}><th>{k}</th><td className="pre">{v}</td></tr>)}</tbody></table>
  );
  const total = totalMinutes(d.parties.map((p) => p.duree));
  return (
    <>
      <Bar>Identité de la séquence</Bar>
      {kv([['Intitulé', title], ['Domaine', d.domaine], ['Niveau', level], ['Organisation', d.organisation], ['Prérequis', d.prerequis], ['Modalité', d.modalite], ['Objectif général', d.objectif]])}
      <Bar>Compétences couvertes</Bar>
      <CompetenceTable cc={d.cc} c={d.competences} />
      {d.parties.length > 0 && <>
        <Bar>Récapitulatif du TP</Bar>
        <div className="scroll"><table className="fd-tbl">
          <thead><tr><th>Partie</th><th>Intitulé / support</th><th>Nature</th><th>Durée</th><th>Supports</th><th>Compétences</th></tr></thead>
          <tbody>{d.parties.map((p, i) => <tr key={i}><td><b>{p.partie}</b></td><td>{p.intitule}</td><td>{p.nature}</td><td>{p.duree}</td><td>{p.supports}</td><td>{p.competences}</td></tr>)}</tbody>
          {total !== null && <tfoot><tr><td colSpan={3}><b>Total</b></td><td colSpan={3}><b>{fmtMinutes(total)}</b></td></tr></tfoot>}
        </table></div>
      </>}
      {d.principe.some((p) => p.texte.trim()) && <>
        <Bar>Principe d’organisation</Bar>
        {kv(d.principe.map((p): [string, string] => [p.titre, p.texte]))}
      </>}
      {d.coherence.trim() && <><Bar>Cohérence pédagogique et fil rouge</Bar><Bullets text={d.coherence} /></>}
      {(d.evaluation.length > 0 || d.autoeval.trim()) && <>
        <Bar>Évaluation</Bar>
        <p className="muted small"><i>{LEVEL_NOTE}</i></p>
        {d.evaluation.length > 0 && <div className="scroll"><table className="fd-tbl">
          <thead><tr><th>CC / C</th><th>Indicateur observé</th><th>NA</th><th>ECA</th><th>PA</th><th>A</th></tr></thead>
          <tbody>{d.evaluation.map((r, i) => <tr key={i}><td><b>{ccPair(r.cc)}</b></td><td>{r.indicateur}</td><td>{r.na}</td><td>{r.eca}</td><td>{r.pa}</td><td>{r.a}</td></tr>)}</tbody>
        </table></div>}
        {d.autoeval.trim() && <p className="pre">{d.autoeval}</p>}
      </>}
    </>
  );
}

/** Fiche de séance en lecture : même plan que le document Word */
function SeanceView({ title, level, d, sequence, onOpen }: { title: string; level: Level | ''; d: SeanceData; sequence?: Fiche; onOpen: (id: string) => void }) {
  const kv = (rows: Array<[string, React.ReactNode]>) => (
    <table className="fd-kv"><tbody>{rows.filter(([, v]) => v).map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>
  );
  const blocs = d.blocs.filter((b) => b.titre.trim() || b.lignes.length);
  return (
    <>
      <table className="fd-head"><tbody><tr>
        <td><b>Discipline : {d.discipline}</b><br />Lycée La Mache</td>
        <td><b>{d.numero ? `Thème ${d.numero}` : 'Séance'}</b></td>
        <td>Année {d.annee}</td>
      </tr></tbody></table>
      <div className="fd-banner"><b>Séquence : {sequence ? <button type="button" className="linklike" onClick={() => onOpen(sequence.id)}>{sequence.title}</button> : '—'}{level ? ` — ${level}` : ''}{d.domaine ? ` — ${DOMAINS[d.domaine as keyof typeof DOMAINS] ?? d.domaine}` : ''}</b></div>
      <div className="fd-tp"><b>TP : {title}</b>{d.objectif.trim() && <div>Objectif : {d.objectif}</div>}</div>
      <Bar>Activité en lien avec le référentiel MELEC</Bar>
      {kv([
        ['Contexte (fil rouge)', d.contexte.trim() && <span className="pre">{d.contexte}</span>],
        ['Compétences travaillées', (d.cc.length + d.competences.length) > 0 && (
          <ul className="fd-list">
            {d.cc.map((x) => <li key={x}><b>{x}</b> — {CC_LABELS[x]}{ccToC(x) && <div className="muted">↳ Référentiel MELEC : <b>{ccToC(x)}</b> — {COMPETENCES[ccToC(x)!]}</div>}</li>)}
            {d.competences.filter((c) => !d.cc.some((x) => ccToC(x) === c)).map((c) => <li key={c}><b>{c}</b> — {COMPETENCES[c]}</li>)}
          </ul>),
        ],
        ['Position dans l’année', d.repere.trim() && <span className="pre">{d.repere}</span>],
        ['Prérequis', d.prerequis.trim() && <Bullets text={d.prerequis} />],
        ['Organisation', d.organisation.trim() && <span className="pre">{d.organisation}</span>],
      ])}
      <Bar>Fiche de déroulement</Bar>
      {d.duree.trim() && <p className="fd-note pre">{d.duree}</p>}
      {blocs.map((b, bi) => (
        <div key={bi}>
          {b.titre.trim() && <h3 className="fd-sub">{b.titre}</h3>}
          <div className="scroll"><table className="fd-tbl fd-zebra">
            <thead><tr><th>Activité</th><th>Durée</th><th>Professeur</th><th>Élève</th><th>Outils et supports</th></tr></thead>
            <tbody>{b.lignes.map((a, i) => <tr key={i}><td><b className="pre">{a.activite}</b></td><td>{a.duree}</td><td className="pre">{a.professeur}</td><td className="pre">{a.eleve}</td><td className="pre">{a.outils}</td></tr>)}</tbody>
          </table></div>
        </div>
      ))}
      {(d.situation.trim() || d.deroulement.trim() || d.vigilance.length > 0 || d.guide.trim() || d.autonome.trim() || d.expert.trim() || d.annexe.trim()) && <Bar>Scénario</Bar>}
      {d.situation.trim() && <><h3 className="fd-sub">Mise en situation</h3><p className="pre">{d.situation}</p></>}
      {d.deroulement.trim() && <><h3 className="fd-sub">Déroulement</h3><Bullets text={d.deroulement} /></>}
      {d.vigilance.filter((w) => w.texte.trim()).length > 0 && <>
        <h3 className="fd-sub">Points de vigilance</h3>
        {d.vigilance.filter((w) => w.texte.trim()).map((w, i) => <div key={i} className={w.type === 'danger' ? 'fd-warn' : 'fd-good'}>{w.type === 'danger' ? '⚠' : '✔'} {w.texte}</div>)}
      </>}
      {(d.guide.trim() || d.autonome.trim() || d.expert.trim()) && <>
        <h3 className="fd-sub">Différenciation</h3>
        {kv([['Guidé', d.guide.trim() && <span className="pre">{d.guide}</span>], ['Autonome', d.autonome.trim() && <span className="pre">{d.autonome}</span>], ['Expert', d.expert.trim() && <span className="pre">{d.expert}</span>]])}
      </>}
      {d.annexe.trim() && <p className="pre"><b>Annexe</b> – {d.annexe}</p>}
    </>
  );
}
