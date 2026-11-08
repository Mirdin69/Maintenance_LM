import { useMemo, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAct, useStore } from '@/state/store';
import { GROUP_CODES, LEVELS, byText, levelOfGroup } from '@/lib/domain';
import { buildTemplate, planImport, pseudonym, readStudentFile, type ImportPlan, type RawRow } from '@/lib/importStudents';
import { ConfirmButton, Empty, Field, Options, downloadBlob } from '@/components/ui';
import { iso } from '@/lib/dates';
import { useToast, friendlyError } from '@/state/toast';

export default function StudentsAdmin() {
  const { data } = useStore();
  const act = useAct();
  const [group, setGroup] = useState(GROUP_CODES[0]);
  const students = data.students.filter((s) => s.group_code === group).sort(byText((s) => s.name));

  const addOne = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    // Le nom de famille n'est jamais enregistré : seules ses deux premières lettres le sont
    const name = pseudonym(String(f.get('prenom')), String(f.get('nom')));
    if (!String(f.get('prenom')).trim() || !String(f.get('nom')).trim()) return;
    if (await act(() => api.insert('students', { name, group_code: group }), { ok: 'Élève ajouté.', tables: ['students'] })) form.reset();
  };

  const toast = useToast();
  const exportOne = async (id: string, name: string) => {
    try {
      const j = await api.rpc('export_student', { p_id: id });
      downloadBlob(`donnees-${name.replace(/[^\p{L}\p{N}]+/gu, '-')}.json`, new Blob([JSON.stringify(j, null, 2)], { type: 'application/json' }));
    } catch (e) {
      toast?.(friendlyError(e), 'bad');
    }
  };

  return (
    <>
      <p className="muted">Création, déplacement et suppression des élèves par groupe, ou mise à jour en une fois depuis un fichier Excel. La validation des TP se fait dans l’onglet Suivi des élèves.</p>
      <section className="panel stack">
        <h2>Mise à jour par fichier Excel</h2>
        <ImportStudents />
      </section>
      <section className="panel">
        <div className="tools">
          <Field label="Groupe">
            <select className="in" value={group} onChange={(e) => setGroup(e.target.value)}>
              {LEVELS.map((l) => <optgroup key={l} label={l}><Options items={GROUP_CODES.filter((g) => levelOfGroup(g) === l).map((g) => [g, g])} /></optgroup>)}
            </select>
          </Field>
          <form className="inline" onSubmit={addOne}>
            <input className="in" name="prenom" aria-label={`Prénom de l’élève à ajouter dans ${group}`} placeholder="Prénom" maxLength={40} required />
            <input className="in" name="nom" aria-label="Nom de famille (seules les 2 premières lettres sont enregistrées)" placeholder="Nom (2 lettres gardées)" maxLength={40} required />
            <button className="btn sm" type="submit">Ajouter</button>
          </form>
        </div>
        <p className="muted small">Par respect de la vie privée (RGPD), un élève est enregistré sous la forme « Prénom + 2 premières lettres du nom » (exemple : Emma LA). Le nom de famille complet n’est jamais conservé.</p>
        <h2>{group} · {students.length} élève{students.length > 1 ? 's' : ''}</h2>
        {students.some((s) => !s.left_at) && (
          <ConfirmButton detail={`Marquer tous les élèves de ${group} comme sortis aujourd’hui ? Ils seront effacés après la durée de conservation.`}
            onConfirm={() => void act(async () => { for (const s of students.filter((x) => !x.left_at)) await api.update('students', { id: s.id }, { left_at: iso(new Date()) }); }, { ok: `${group} : élèves marqués comme sortis.`, tables: ['students'] })}>
            Marquer la classe comme sortie
          </ConfirmButton>
        )}
        {students.length === 0 ? <Empty>Aucun élève dans ce groupe.</Empty> : (
          <div className="scroll"><table className="tbl">
            <thead><tr><th>Élève</th><th>Groupe</th><th>Sorti le</th><th /></tr></thead>
            <tbody>{students.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>
                  <select className="in" aria-label={`Groupe de ${s.name}`} value={s.group_code}
                    onChange={(e) => void act(() => api.update('students', { id: s.id }, { group_code: e.target.value }), { ok: `${s.name} déplacé.`, tables: ['students'] })}>
                    <Options items={GROUP_CODES.map((g) => [g, g])} />
                  </select>
                </td>
                <td><input className="in" type="date" aria-label={`Date de sortie de ${s.name}`} defaultValue={s.left_at ?? ''} key={`${s.id}${s.left_at ?? ''}`}
                  onBlur={(e) => (e.target.value || null) !== (s.left_at ?? null) && void act(() => api.update('students', { id: s.id }, { left_at: e.target.value || null }), { ok: e.target.value ? 'Sortie enregistrée.' : 'Élève réintégré.', tables: ['students'] })} /></td>
                <td className="row">
                  <button type="button" className="btn ghost sm" aria-label={`Exporter les données de ${s.name}`} onClick={() => void exportOne(s.id, s.name)}>Exporter</button>
                  <ConfirmButton irreversible detail={`Effacer définitivement ${s.name}, sa progression et ses traces dans l’historique ? Cette action est irréversible.`} onConfirm={() => void act(() => api.rpc('erase_student', { p_id: s.id }), { ok: 'Élève effacé définitivement.', tables: ['students', 'progress'] })}>Effacer</ConfirmButton>
                </td>
              </tr>))}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}

function ImportStudents() {
  const { data } = useStore();
  const act = useAct();
  const toast = useToast();
  const [rows, setRows] = useState<RawRow[] | null>(null);
  const reduce = true;
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
      if (removeGone) for (const g of plan.gone) await api.remove('students', { id: g.id });
    }, { ok: `Import terminé : ${plan.add.length} ajouté(s), ${plan.move.length} déplacé(s)${removeGone ? `, ${plan.gone.length} retiré(s)` : ''}.`, tables: ['students', 'progress'] });
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
      <p className="muted small">Seuls le prénom et les 2 premières lettres du nom sont enregistrés (exemple : Emma LA), le nom complet reste dans votre fichier. Les anciens noms du type « Emma L. » sont mis à jour sans perdre la progression.</p>
      {plan && (
        <div className="stack">
          <div className="alert soft">
            <b>{plan.add.length}</b> à ajouter · <b>{plan.move.length}</b> à déplacer · <b>{plan.same.length}</b> inchangés
            {plan.gone.length > 0 && <> · <b>{plan.gone.length}</b> absents du fichier</>}
            {plan.bad.length > 0 && <> · {plan.bad.length} ligne(s) ignorée(s) (groupe non reconnu)</>}
            {plan.dup.length > 0 && <> · {plan.dup.length} doublon(s) ignoré(s)</>}
          </div>
          {plan.move.length > 0 && <details><summary>Déplacements</summary><ul>{plan.move.map((p) => <li key={p.name}>{p.renamedFrom ? `${p.renamedFrom} → ${p.name}` : p.name} : {p.fromGroup} → {p.groupCode}</li>)}</ul></details>}
          {plan.gone.length > 0 && <label className="row"><input type="checkbox" checked={removeGone} onChange={(e) => setRemoveGone(e.target.checked)} /> Retirer les {plan.gone.length} élèves absents du fichier (leur progression est supprimée)</label>}
          <div className="row">
            <button className="btn" disabled={busy || (plan.add.length + plan.move.length === 0 && !(removeGone && plan.gone.length))} onClick={() => void apply()}>{busy ? 'Import…' : 'Appliquer'}</button>
            <button className="btn ghost" onClick={() => setRows(null)}>Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}
