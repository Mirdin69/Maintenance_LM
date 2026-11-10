import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/state/auth';
import { useAct, useStore } from '@/state/store';
import { COMPETENCES, DOMAINS, LEVELS } from '@/lib/domain';
import type { Level, Tp } from '@/lib/types';
import { DURATIONS, NO_FILTER, filterTps, isFiltered, sortTps, teacherKey, type Duration, type SortKey, type TpFilters } from '@/lib/tpFilter';
import { AddPanel, ConfirmButton, Empty, Field, Options, PageHead, Seg } from '@/components/ui';
import { DocsEditor, DocsViewer } from '@/components/Docs';
import { PasteImport } from '@/components/PasteImport';
import { TP_COLUMNS, buildTps, parseTpPaste } from '@/lib/importTp';
import { asDocs, cleanDocs, dropFiles, orphanPaths, type Doc } from '@/lib/docs';

export default function Catalogue() {
  const { data, systemById, who } = useStore();
  const { canWrite, isAdmin } = useAuth();
  const act = useAct();
  const [formKey, setFormKey] = useState(0);
  const [editing, setEditing] = useState<Tp | null>(null);
  const [filters, setFilters] = useState<TpFilters>(NO_FILTER);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'code', dir: 1 });
  const setF = (patch: Partial<TpFilters>) => setFilters((f) => ({ ...f, ...patch }));
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

  const teacherName = (t: Tp) => (t.teacher_id ? who(t.teacher_id) : t.teacher_label ?? '');
  const list = sortTps(filterTps(data.tps, filters, teacherName), sort.key, sort.dir, teacherName);
  // Enseignants proposés dans le filtre : ceux qui ont au moins un TP
  const teacherOptions = [...new Map(data.tps.filter((t) => teacherKey(t)).map((t) => [teacherKey(t), teacherName(t)])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr'));
  const usedDomains = [...new Set(data.tps.map((t) => t.domain))];
  const sortBy = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key && s.dir === 1 ? -1 : 1 }));
  const th = (k: SortKey, children: string, num?: boolean) => (
    <th key={k} className={num ? 'num' : ''} aria-sort={sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="th-sort" onClick={() => sortBy(k)}>{children}{sort.key === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</button>
    </th>
  );

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
        <PasteImport summary="Coller une liste de TP depuis Excel" columns={TP_COLUMNS} max={300} parse={parseTpPaste}
          notes={(rows) => buildTps(rows, data.profiles, data.systems).problems}
          onImport={async (rows) => {
            const { ok } = buildTps(rows, data.profiles, data.systems);
            if (!ok.length) return false;
            return act(() => api.insert('tps', ok), { ok: `${ok.length} TP ajouté${ok.length > 1 ? 's' : ''}.`, tables: ['tps'] });
          }} />
      )}
      <section className="panel">
        <div className="row between"><h2>Catalogue ({list.length}{list.length !== data.tps.length ? ` sur ${data.tps.length}` : ''})</h2>
          <Seg<Level | ''> label="Niveau" value={filters.level as Level | ''} onChange={(v) => setF({ level: v })} items={[['', 'Tous'], ...LEVELS.map((l) => [l, l] as [Level, string])]} /></div>
        <div className="tp-filters no-print" role="search" aria-label="Rechercher et filtrer les TP">
          <input className="in" type="search" aria-label="Rechercher un TP" placeholder="Rechercher : titre, code, objectif, enseignant, compétence…" value={filters.q} onChange={(e) => setF({ q: e.target.value })} />
          <select className="in" aria-label="Filtrer par enseignant" value={filters.teacher} onChange={(e) => setF({ teacher: e.target.value })}>
            <option value="">Tous les enseignants</option>
            {teacherOptions.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
          <select className="in" aria-label="Filtrer par domaine" value={filters.domain} onChange={(e) => setF({ domain: e.target.value })}>
            <option value="">Tous les domaines</option>
            {usedDomains.map((d) => <option key={d} value={d}>{DOMAINS[d] ?? d}</option>)}
          </select>
          <select className="in" aria-label="Filtrer par durée" value={filters.duration} onChange={(e) => setF({ duration: e.target.value as Duration })}>
            {DURATIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select className="in" aria-label="Trier par" value={`${sort.key}:${sort.dir}`} onChange={(e) => { const [key, dir] = e.target.value.split(':'); setSort({ key: key as SortKey, dir: Number(dir) as 1 | -1 }); }}>
            {([['code', 'Code'], ['title', 'Titre'], ['level', 'Niveau'], ['teacher', 'Enseignant'], ['hours', 'Durée'], ['competences', 'Compétences']] as Array<[SortKey, string]>).flatMap(([k, l]) => [
              <option key={`${k}1`} value={`${k}:1`}>Trier : {l} ↑</option>, <option key={`${k}-1`} value={`${k}:-1`}>Trier : {l} ↓</option>,
            ])}
          </select>
          <details className="tp-comps" open={filters.comps.length > 0}>
            <summary>Compétences{filters.comps.length ? ` (${filters.comps.length})` : ''}</summary>
            <div className="picks" role="group" aria-label="Compétences travaillées">
              {Object.keys(COMPETENCES).map((c) => <label key={c} className="pick" title={COMPETENCES[c]}><input type="checkbox" checked={filters.comps.includes(c)} onChange={() => setF({ comps: toggle(filters.comps, c) })} />{c}</label>)}
            </div>
            <p className="muted small">Le TP doit travailler toutes les compétences cochées.</p>
          </details>
          {isFiltered(filters) && <button type="button" className="btn ghost sm" onClick={() => setFilters(NO_FILTER)}>Réinitialiser les filtres</button>}
        </div>
        {list.length === 0 ? <Empty>{isFiltered(filters) ? 'Aucun TP ne correspond à cette recherche.' : 'Aucun TP.'}</Empty> : (
          <div className="scroll"><table className="tbl">
            <thead><tr>{th('code', 'TP')}{th('level', 'Niveau')}{th('teacher', 'Enseignant')}{th('hours', 'Durée', true)}<th>Systèmes</th>{th('competences', 'Compétences')}<th>Documents</th>{canWrite && <th />}</tr></thead>
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

