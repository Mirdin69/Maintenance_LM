import { useMemo, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/state/auth';
import { useAct, useStore } from '@/state/store';
import { GROUP_CODES, LEVELS, MARKS, MARK_LABEL, levelOfGroup, byText } from '@/lib/domain';
import { buildTemplate, planImport, readStudentFile, type ImportPlan, type RawRow } from '@/lib/importStudents';
import type { MarkLevel } from '@/lib/types';
import { AddPanel, ConfirmButton, Empty, Field, Options, PageHead, downloadBlob } from '@/components/ui';
import { useToast, friendlyError } from '@/state/toast';

const NEXT: Record<string, MarkLevel | ''> = { '': 'NA', NA: 'ECA', ECA: 'PA', PA: 'A', A: '' };

export default function Students() {
  const { data } = useStore();
  const { canWrite, isAdmin } = useAuth();
  const act = useAct();
  const [group, setGroup] = useState(GROUP_CODES[0]);
  const [local, setLocal] = useState<Record<string, MarkLevel | ''>>({});
  const level = levelOfGroup(group);
  const tps = data.tps.filter((t) => t.level === level).sort(byText((t) => t.code ?? t.title));
  const students = data.students.filter((s) => s.group_code === group).sort(byText((s) => s.name));
  const marks = useMemo(() => new Map(data.progress.map((p) => [`${p.student_id}|${p.tp_id}`, p.level])), [data.progress]);

  const get = (sid: string, tid: string): MarkLevel | '' => {
    const k = `${sid}|${tid}`;
    return k in local ? local[k] : marks.get(k) ?? '';
  };

  const cycle = async (sid: string, tid: string) => {
    const k = `${sid}|${tid}`;
    const next = NEXT[get(sid, tid)];
    setLocal((l) => ({ ...l, [k]: next }));
    const ok = await act(
      () => (next ? api.upsert('progress', [{ student_id: sid, tp_id: tid, level: next }], 'student_id,tp_id') : api.remove('progress', { student_id: sid, tp_id: tid })),
      { tables: ['progress'] },
    );
    setLocal((l) => { const c = { ...l }; delete c[k]; return c; });
    if (!ok) return;
  };

  const addOne = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const name = String(new FormData(form).get('name')).trim();
    if (!name) return;
    if (await act(() => api.insert('students', { name, group_code: group }), { ok: 'Élève ajouté.', tables: ['students'] })) form.reset();
  };

  const stats = (sid: string) => {
    const done = tps.filter((t) => get(sid, t.id) === 'A').length;
    return tps.length ? `${done}/${tps.length}` : '—';
  };

  return (
    <>
      <PageHead title="Suivi des élèves">Cliquez sur une case pour faire évoluer la validation : non acquis, en cours, partiellement acquis, acquis, puis vide.</PageHead>
      <div className="tools">
        <Field label="Groupe">
          <select className="in" value={group} onChange={(e) => setGroup(e.target.value)}>
            {LEVELS.map((l) => <optgroup key={l} label={l}><Options items={GROUP_CODES.filter((g) => levelOfGroup(g) === l).map((g) => [g, g])} /></optgroup>)}
          </select>
        </Field>
        <div className="legend">{MARKS.map((m) => <span key={m}><i className={`mk ${m}`}>{m}</i> {MARK_LABEL[m]}</span>)}</div>
      </div>
      {canWrite && (
        <AddPanel summary="Ajouter ou mettre à jour des élèves">
          <form className="inline" onSubmit={addOne}>
            <input className="in" name="name" aria-label={`Nom de l’élève à ajouter dans ${group}`} placeholder={`Nouvel élève dans ${group} (Prénom N.)`} maxLength={60} />
            <button className="btn sm" type="submit">Ajouter</button>
          </form>
          <ImportStudents />
        </AddPanel>
      )}
      <section className="panel">
        <h2>{group} · {students.length} élève{students.length > 1 ? 's' : ''}</h2>
        {students.length === 0 ? <Empty>Aucun élève dans ce groupe.</Empty> : tps.length === 0 ? <Empty>Aucun TP défini pour ce niveau. Ajoutez-en dans Planning des TP, Catalogue.</Empty> : (
          <div className="scroll">
            <table className="mx">
              <thead><tr><th className="nm">Élève</th>{tps.map((t) => <th key={t.id} title={t.title}>{t.code ?? t.title.slice(0, 6)}</th>)}<th>Acquis</th>{isAdmin && <th />}</tr></thead>
              <tbody>{students.map((s) => (
                <tr key={s.id}>
                  <td className="nm">{s.name}</td>
                  {tps.map((t) => {
                    const m = get(s.id, t.id);
                    return <td key={t.id}><button className={`mk ${m}`} disabled={!canWrite} aria-label={`${s.name}, ${t.code ?? t.title} : ${m ? MARK_LABEL[m] : 'non renseigné'}`} onClick={() => void cycle(s.id, t.id)}>{m || '·'}</button></td>;
                  })}
                  <td>{stats(s.id)}</td>
                  {isAdmin && <td><ConfirmButton onConfirm={() => void act(() => api.remove('students', { id: s.id }), { ok: 'Élève supprimé.', tables: ['students', 'progress'] })}>Supprimer</ConfirmButton></td>}
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function ImportStudents() {
  const { data } = useStore();
  const { isAdmin } = useAuth();
  const act = useAct();
  const toast = useToast();
  const [rows, setRows] = useState<RawRow[] | null>(null);
  const [reduce, setReduce] = useState(true);
  const [removeGone, setRemoveGone] = useState(false);
  const [busy, setBusy] = useState(false);

  const existing = useMemo(() => data.students.map((s) => ({ id: s.id, name: s.name, group_code: s.group_code })), [data.students]);
  const plan: ImportPlan | null = useMemo(() => (rows ? planImport(rows, existing, reduce) : null), [rows, existing, reduce]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      const r = await readStudentFile(file);
      if (!r.length) toast?.('Aucune ligne exploitable dans ce fichier.', 'bad');
      setRows(r);
    } catch (e) {
      toast?.(friendlyError(e), 'bad');
    }
  };

  const apply = async () => {
    if (!plan) return;
    setBusy(true);
    const ok = await act(async () => {
      for (let i = 0; i < plan.add.length; i += 500)
        await api.insert('students', plan.add.slice(i, i + 500).map((p) => ({ name: p.name, group_code: p.groupCode })));
      if (plan.move.length) await api.upsert('students', plan.move.map((p) => ({ id: p.existingId, name: p.name, group_code: p.groupCode })), 'id');
      if (removeGone && isAdmin) for (const g of plan.gone) await api.remove('students', { id: g.id });
    }, { ok: `Import terminé : ${plan.add.length} ajouté(s), ${plan.move.length} déplacé(s)${removeGone && isAdmin ? `, ${plan.gone.length} retiré(s)` : ''}.`, tables: ['students', 'progress'] });
    setBusy(false);
    if (ok) setRows(null);
  };

  return (
    <div className="stack">
      <h3>Import depuis Excel</h3>
      <p className="muted small">Colonnes : Nom, Prénom, Groupe (2PB1.1, 1PB2, TPB1.2…). Formats .xlsx et .csv.</p>
      <div className="row">
        <input type="file" aria-label="Fichier élèves" accept=".xlsx,.csv,.txt" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
        <button className="btn ghost sm" type="button" onClick={() => void buildTemplate().then((b) => downloadBlob('modele-eleves.xlsx', b))}>Télécharger le modèle</button>
      </div>
      <label className="row"><input type="checkbox" checked={reduce} onChange={(e) => setReduce(e.target.checked)} /> Réduire les noms en « Prénom N. » (recommandé)</label>
      {plan && (
        <div className="stack">
          <div className="alert soft">
            <b>{plan.add.length}</b> à ajouter · <b>{plan.move.length}</b> à déplacer · <b>{plan.same.length}</b> inchangés
            {plan.gone.length > 0 && <> · <b>{plan.gone.length}</b> absents du fichier</>}
            {plan.bad.length > 0 && <> · {plan.bad.length} ligne(s) ignorée(s) (groupe non reconnu)</>}
            {plan.dup.length > 0 && <> · {plan.dup.length} doublon(s) ignoré(s)</>}
          </div>
          {plan.move.length > 0 && <details><summary>Déplacements</summary><ul>{plan.move.map((p) => <li key={p.name}>{p.name} : {p.fromGroup} → {p.groupCode}</li>)}</ul></details>}
          {plan.gone.length > 0 && isAdmin && <label className="row"><input type="checkbox" checked={removeGone} onChange={(e) => setRemoveGone(e.target.checked)} /> Retirer les {plan.gone.length} élèves absents du fichier (leur progression est supprimée)</label>}
          <div className="row">
            <button className="btn" disabled={busy || (plan.add.length + plan.move.length === 0 && !(removeGone && plan.gone.length))} onClick={() => void apply()}>{busy ? 'Import…' : 'Appliquer'}</button>
            <button className="btn ghost" onClick={() => setRows(null)}>Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}
