import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/state/auth';
import { useAct, useStore } from '@/state/store';
import { COMPETENCES, DOMAINS, LEVELS } from '@/lib/domain';
import type { Level, Tp } from '@/lib/types';
import { AddPanel, ConfirmButton, Empty, Field, Options, PageHead, Seg } from '@/components/ui';
import { DocsEditor, DocsViewer } from '@/components/Docs';
import { PasteImport } from '@/components/PasteImport';
import { TP_COLUMNS, buildTps } from '@/lib/importTp';
import { asDocs, cleanDocs, dropFiles, orphanPaths, type Doc } from '@/lib/docs';

export default function Catalogue() {
  const { data, systemById, who } = useStore();
  const { canWrite, isAdmin } = useAuth();
  const act = useAct();
  const [formKey, setFormKey] = useState(0);
  const [editing, setEditing] = useState<Tp | null>(null);
  const [level, setLevel] = useState<Level | ''>('');
  const [sys, setSys] = useState<string[]>([]);
  const [comp, setComp] = useState<string[]>([]);
  const [toolIds, setToolIds] = useState<string[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [viewing, setViewing] = useState<string | null>(null);

  const edit = (t: Tp | null) => { setEditing(t); setSys(t?.system_ids ?? []); setComp(t?.competences ?? []); setToolIds(t?.tool_ids ?? []); setDocs(asDocs(t?.documents)); };
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const row = {
      code: String(f.get('code')).trim() || null, title: String(f.get('title')).trim(), level: f.get('level'), domain: f.get('domain'),
      hours: Number(f.get('hours')) || null, system_ids: sys, competences: comp, tool_ids: toolIds, reusable: f.get('reusable') === 'on',
      objective: String(f.get('objective')).trim() || null,
      teacher_id: String(f.get('teacher_id')) || null,
      teacher_label: String(f.get('teacher_id')) ? null : String(f.get('teacher_label')).trim() || null,
      sequence_name: String(f.get('sequence_name')).trim() || null,
      documents: cleanDocs(docs),
    };
    const ok = await act(() => (editing ? api.update('tps', { id: editing.id }, row) : api.insert('tps', row)), { ok: editing ? 'TP modifié.' : 'TP ajouté.', tables: ['tps'] });
    if (ok && editing) void dropFiles(orphanPaths(asDocs(editing.documents), row.documents));
    if (ok) { edit(null); setFormKey((k) => k + 1); }
  };

  const list = data.tps.filter((t) => !level || t.level === level).sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || (a.code ?? '').localeCompare(b.code ?? '', 'fr', { numeric: true }));

  return (
    <>
      <PageHead tab="catalogue" title="Catalogue des TP" />
      {canWrite && (
        <AddPanel summary={editing ? 'Modifier le TP' : 'Ajouter un TP'} open={!!editing} onClose={() => edit(null)}>
          <form className="form" key={`${editing?.id ?? 'new'}-${formKey}`} onSubmit={submit}>
            <Field label="Code"><input className="in" name="code" maxLength={20} defaultValue={editing?.code ?? ''} placeholder="TP5" /></Field>
            <Field label="Titre *" wide><input className="in" name="title" required maxLength={160} defaultValue={editing?.title} /></Field>
            <Field label="Niveau"><select className="in" name="level" defaultValue={editing?.level ?? 'Seconde'}><Options items={LEVELS.map((l) => [l, l])} /></select></Field>
            <Field label="Domaine"><select className="in" name="domain" defaultValue={editing?.domain ?? 'ind'}><Options items={Object.entries(DOMAINS)} /></select></Field>
            <Field label="Durée (h)"><input className="in" name="hours" type="number" min={0} step="0.5" defaultValue={editing?.hours ?? ''} /></Field>
            <Field label="Enseignant (compte)"><select className="in" name="teacher_id" defaultValue={editing?.teacher_id ?? ''}><Options placeholder="Autre (saisir le nom)" items={data.profiles.filter((p) => p.active).map((p) => [p.id, who(p.id)])} /></select></Field>
            <Field label="Nom de l’enseignant (si sans compte)"><input className="in" name="teacher_label" maxLength={60} defaultValue={editing?.teacher_label ?? ''} /></Field>
            <Field label="Séquence"><input className="in" name="sequence_name" maxLength={120} defaultValue={editing?.sequence_name ?? ''} /></Field>
            <Field label="Objectif" wide><textarea className="in" name="objective" maxLength={500} defaultValue={editing?.objective ?? ''} /></Field>
            <div className="f wide"><span className="lab">Systèmes utilisés</span>
              <div className="picks">{data.systems.map((s) => <label key={s.id} className="pick"><input type="checkbox" checked={sys.includes(s.id)} onChange={() => setSys(toggle(sys, s.id))} />{s.name}</label>)}</div></div>
            <div className="f wide"><span className="lab">Compétences travaillées</span>
              <div className="picks">{Object.keys(COMPETENCES).map((c) => <label key={c} className="pick" title={COMPETENCES[c]}><input type="checkbox" checked={comp.includes(c)} onChange={() => setComp(toggle(comp, c))} />{c}</label>)}</div></div>
            <div className="f wide"><span className="lab">Outils nécessaires</span>
              <div className="picks">{data.tools.map((t) => <label key={t.id} className="pick"><input type="checkbox" checked={toolIds.includes(t.id)} onChange={() => setToolIds(toggle(toolIds, t.id))} />{t.name}</label>)}{data.tools.length === 0 && <span className="muted small">Aucun outil : un gestionnaire les ajoute dans Administration, Outils.</span>}</div></div>
            <label className="row wide"><input type="checkbox" name="reusable" defaultChecked={editing?.reusable ?? false} /> Ressource réutilisable (visible dans la Banque de ressources)</label>
            <DocsEditor value={docs} onChange={setDocs} />
            <div className="actions"><button className="btn" type="submit">{editing ? 'Enregistrer' : 'Ajouter'}</button>{editing && <button className="btn ghost" type="button" onClick={() => edit(null)}>Annuler</button>}</div>
          </form>
        </AddPanel>
      )}
      {canWrite && (
        <PasteImport summary="Coller une liste de TP depuis Excel" columns={TP_COLUMNS} max={300}
          notes={(rows) => buildTps(rows, data.profiles, data.systems).problems}
          onImport={async (rows) => {
            const { ok } = buildTps(rows, data.profiles, data.systems);
            if (!ok.length) return false;
            return act(() => api.insert('tps', ok), { ok: `${ok.length} TP ajouté${ok.length > 1 ? 's' : ''}.`, tables: ['tps'] });
          }} />
      )}
      <section className="panel">
        <div className="row between"><h2>Catalogue ({list.length})</h2>
          <Seg<Level | ''> label="Niveau" value={level} onChange={setLevel} items={[['', 'Tous'], ...LEVELS.map((l) => [l, l] as [Level, string])]} /></div>
        {list.length === 0 ? <Empty>Aucun TP.</Empty> : (
          <div className="scroll"><table className="tbl">
            <thead><tr><th>TP</th><th>Niveau</th><th>Enseignant</th><th className="num">Durée</th><th>Systèmes</th><th>Compétences</th><th>Documents</th>{canWrite && <th />}</tr></thead>
            <tbody>{list.map((t) => (
              <tr key={t.id}>
                <td><b>{t.code}</b> {t.title}{t.objective && <span className="sub">{t.objective}</span>}</td><td>{t.level}</td><td>{t.teacher_id ? who(t.teacher_id) : t.teacher_label ?? '—'}</td><td className="num">{t.hours ? `${t.hours} h` : '—'}</td>
                <td>{t.system_ids.map((id) => systemById.get(id)?.name).filter(Boolean).join(', ') || '—'}</td>
                <td>{t.competences.join(', ') || '—'}</td>
                <td>{asDocs(t.documents).length ? <button className="btn ghost sm" aria-pressed={viewing === t.id} onClick={() => setViewing(viewing === t.id ? null : t.id)}>{asDocs(t.documents).length} document{asDocs(t.documents).length > 1 ? 's' : ''}</button> : <span className="muted">—</span>}</td>
                {canWrite && <td><div className="row"><button className="btn ghost sm" onClick={() => { edit(t); window.scrollTo(0, 0); }}>Modifier</button>
                  <button className="btn ghost sm" title="Copie le TP (les fichiers déposés ne sont pas copiés, seulement les liens)" onClick={() => void act(() => api.insert('tps', {
                    code: t.code ? `${t.code} (copie)` : null, title: t.title, level: t.level, domain: t.domain, hours: t.hours, system_ids: t.system_ids, tool_ids: t.tool_ids ?? [],
                    competences: t.competences, objective: t.objective, teacher_id: t.teacher_id, teacher_label: t.teacher_label, sequence_name: t.sequence_name,
                    documents: asDocs(t.documents).filter((d) => d.url), reusable: false,
                  }), { ok: 'TP dupliqué.', tables: ['tps'] })}>Dupliquer</button>
                  {isAdmin && <ConfirmButton detail={`Supprimer le TP « ${t.title} » ? ${data.sessions.filter((x) => x.tp_id === t.id).length} séance(s), ${data.timetable_slots.filter((x) => x.tp_id === t.id).length} créneau(x) et le suivi des élèves associés seront supprimés, ainsi que les fichiers déposés.`} onConfirm={async () => { if (await act(() => api.remove('tps', { id: t.id }), { ok: 'TP supprimé.', tables: ['tps', 'progress', 'timetable_slots', 'sessions'] })) void dropFiles(orphanPaths(asDocs(t.documents), [])); }}>Supprimer</ConfirmButton>}</div></td>}
              </tr>))}</tbody>
          </table></div>
        )}
        {viewing && data.tps.find((t) => t.id === viewing) && (
          <div className="stack">
            <h3>Documents du TP {data.tps.find((t) => t.id === viewing)!.code ?? ''} {data.tps.find((t) => t.id === viewing)!.title}</h3>
            <DocsViewer docs={asDocs(data.tps.find((t) => t.id === viewing)!.documents)} />
          </div>
        )}
      </section>
    </>
  );
}

