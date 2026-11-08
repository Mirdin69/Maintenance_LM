import { useMemo, useState } from 'react';
import { useStore } from '@/state/store';
import { GROUP_CODES, byText } from '@/lib/domain';
import { addDays, fmtShort, iso, mondayOf, parseISO } from '@/lib/dates';
import { buildRotation } from '@/lib/rotation';
import { studentsEnabled, STUDENTS_OFF_TIP } from '@/lib/studentsFeature';
import { Empty, Field, Options, downloadBlob, toCsv } from '@/components/ui';

/** Rotation des sous-groupes sur les postes : qui passe où, et quand */
export default function Rotations() {
  const { data, settings } = useStore();
  const on = studentsEnabled(settings);
  const [group, setGroup] = useState(GROUP_CODES[0]);
  const [picked, setPicked] = useState<string[]>([]);
  const [start, setStart] = useState(() => iso(mondayOf(new Date())));
  const [step, setStep] = useState(7);

  const students = useMemo(() => (on ? data.students : []).filter((s) => s.group_code === group).sort(byText((s) => s.name)), [data.students, group, on]);
  const stations = picked.map((id) => data.systems.find((s) => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s);
  const plan = useMemo(() => buildRotation(students.map((s) => s.name), stations.length), [students, stations.length]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const dates = plan.rounds.map((_, r) => iso(addDays(parseISO(start), r * step)));

  const exportCsv = () => downloadBlob(`rotation-${group}.csv`, toCsv([
    ['Sous-groupe', 'Élèves', ...dates.map((d) => fmtShort(d))],
    ...plan.subgroups.map((g, i) => [`Groupe ${i + 1}`, g.join(', '), ...plan.rounds.map((r) => stations[r[i]].name)]),
  ]));

  return (
    <section className="panel stack">
      <h2>Rotations des groupes sur les postes</h2>
      <p className="muted">Choisissez le groupe et les systèmes à faire tourner : les élèves sont répartis en autant de sous-groupes que de systèmes, et chaque sous-groupe passe sur tous les systèmes à tour de rôle.</p>
      <div className="tools no-print">
        <Field label="Groupe"><select className="in" value={group} onChange={(e) => setGroup(e.target.value)}><Options items={GROUP_CODES.map((g) => [g, g])} /></select></Field>
        <Field label="Première séance"><input className="in" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Intervalle (jours)"><input className="in" type="number" min={1} max={60} value={step} onChange={(e) => setStep(Math.max(1, Number(e.target.value) || 7))} /></Field>
      </div>
      <div className="f no-print"><span className="lab">Systèmes de la rotation</span>
        <div className="picks">{data.systems.map((s) => <label key={s.id} className="pick"><input type="checkbox" checked={picked.includes(s.id)} onChange={() => toggle(s.id)} />{s.name} ({s.qty} poste{s.qty > 1 ? 's' : ''})</label>)}</div></div>
      {students.length === 0 ? <Empty to={on ? { href: '#admin', label: 'Ouvrir l’administration' } : undefined}>{on ? `Aucun élève dans ${group}. Un gestionnaire peut les ajouter dans Administration, Élèves.` : `Répartition des élèves : ${STUDENTS_OFF_TIP.toLowerCase()}.`}</Empty>
        : stations.length === 0 ? <Empty>Cochez au moins un système.</Empty> : (
          <>
            <div className="scroll"><table className="tbl">
              <thead><tr><th>Sous-groupe</th><th>Élèves</th>{dates.map((d, r) => <th key={d}>Séance {r + 1}<br /><span className="small">{fmtShort(d)}</span></th>)}</tr></thead>
              <tbody>{plan.subgroups.map((g, i) => (
                <tr key={i}>
                  <td><b>Groupe {i + 1}</b><span className="sub">{g.length} élève{g.length > 1 ? 's' : ''}</span></td>
                  <td>{g.join(', ')}</td>
                  {plan.rounds.map((r, k) => {
                    const st = stations[r[i]];
                    return <td key={k}>{st.name}{g.length > st.qty && <span className="chip warn" style={{ marginLeft: 6 }} title={`${g.length} élèves pour ${st.qty} poste(s)`}>{g.length} él. / {st.qty} poste{st.qty > 1 ? 's' : ''}</span>}</td>;
                  })}
                </tr>))}</tbody>
            </table></div>
            <div className="row no-print"><button className="btn ghost sm" onClick={exportCsv}>Exporter en CSV</button><button className="btn ghost sm" onClick={() => window.print()}>Imprimer</button></div>
          </>
        )}
    </section>
  );
}
