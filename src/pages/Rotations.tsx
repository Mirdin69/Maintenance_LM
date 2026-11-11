import { useMemo, useState } from 'react';
import { useStore } from '@/state/store';
import { GROUP_CODES, byText, levelOfGroup } from '@/lib/domain';
import { addDays, fmtShort, iso, mondayOf, parseISO } from '@/lib/dates';
import { childrenOf } from '@/lib/subtp';
import { capacity, proposeRotation, teamsOf, type RotationStation } from '@/lib/rotation';
import { TEAM_LABEL, rotationWorkbook } from '@/lib/rotationExport';
import { headcountAt } from '@/lib/headcount';
import { studentsEnabled } from '@/lib/studentsFeature';
import { Empty, Field, Options, downloadBlob, toCsv } from '@/components/ui';

/** Proposition de TP tournants : effectif, postes disponibles et binômes → sous-groupes et séances */
export default function Rotations() {
  const { data, settings } = useStore();
  const on = studentsEnabled(settings);
  const [group, setGroup] = useState(GROUP_CODES[0]);
  const roster = useMemo(() => (on ? data.students : []).filter((s) => s.group_code === group).sort(byText((s) => s.name)).map((s) => s.name), [data.students, group, on]);
  const [count, setCount] = useState<number | null>(null);
  const [start, setStart] = useState(() => iso(mondayOf(new Date())));
  const planned = headcountAt(data.headcounts, group, start);
  const n = count ?? (roster.length || planned || 24);
  const [picked, setPicked] = useState<string[]>([]);
  const [postes, setPostes] = useState<Record<string, number>>({});
  const [team, setTeam] = useState<Record<string, number>>({});
  const [step, setStep] = useState(7);

  const level = levelOfGroup(group);
  const tps = useMemo(() => data.tps.filter((t) => t.level === level).sort(byText((t) => `${t.code ?? ''} ${t.title}`)), [data.tps, level]);
  /** Postes d'un TP : le plus petit nombre de systèmes en service parmi ceux qu'il utilise (1 si aucun système n'est lié) */
  const defaultPostes = (id: string) => {
    const t = data.tps.find((x) => x.id === id);
    const sys = (t?.system_ids ?? []).map((sid) => data.systems.find((s) => s.id === sid)).filter((s): s is NonNullable<typeof s> => !!s);
    return sys.length ? Math.min(...sys.map((s) => (s.state === 'service' ? s.qty : 0))) : 1;
  };
  const kids = useMemo(() => childrenOf(data.tps), [data.tps]);
  /** Un TP principal qui a des sous-TP n'est pas un poste en lui-même : la rotation se fait entre ses sous-TP */
  const stations: RotationStation[] = picked.filter((id) => !(kids.get(id)?.length)).flatMap((id) => {
    const t = data.tps.find((x) => x.id === id);
    return t ? [{ id, name: t.code ? `${t.code} · ${t.title}` : t.title, postes: postes[id] ?? defaultPostes(id), team: team[id] ?? t.pair_size ?? 1 }] : [];
  });
  const names = useMemo(() => Array.from({ length: n }, (_, i) => (roster.length === n ? roster[i] : `Élève ${i + 1}`)), [n, roster]);
  const plan = useMemo(() => proposeRotation(names, stations), [names, stations.map((s) => `${s.id}${s.postes}${s.team}`).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const dates = plan.rounds.map((_, r) => iso(addDays(parseISO(start), r * step)));
  const toggle = (id: string) => setPicked((p) => {
    const sub = (kids.get(id) ?? []).map((k) => k.id);
    const on = p.includes(id);
    // Le principal entraîne tous ses sous-TP ; décocher un sous-TP laisse les autres
    return on ? p.filter((x) => x !== id && !sub.includes(x)) : [...new Set([...p, id, ...sub])];
  });
  const title = `Rotation ${group} — ${n} élèves`;
  const label = (g: number, r: number) => (plan.rounds[r][g] < 0 ? 'Attente' : plan.stations[plan.rounds[r][g]].name);

  const exportCsv = () => downloadBlob(`rotation-${group}.csv`, toCsv([
    ['Sous-groupe', 'Élèves', ...dates.map((d) => fmtShort(d))],
    ...plan.groups.map((g, i) => [`Groupe ${i + 1}`, g.join(', '), ...plan.rounds.map((_, r) => label(i, r))]),
  ]));
  const exportXlsx = async () => downloadBlob(`rotation-${group}.xlsx`, await rotationWorkbook(plan, dates, title));

  return (
    <section className="panel stack">
      <h2>Proposition de TP tournants</h2>
      <p className="muted">Choisissez les TP à faire tourner : selon l’effectif, le nombre de postes de leurs systèmes et le travail en binôme, l’outil propose des sous-groupes et un planning où chacun passe sur chaque TP. Les postes viennent des systèmes en service liés au TP (modifiables ici).</p>
      <div className="tools no-print">
        <Field label="Groupe"><select className="in" value={group} onChange={(e) => { setGroup(e.target.value); setCount(null); setPicked([]); }}><Options items={GROUP_CODES.map((g) => [g, g])} /></select></Field>
        <Field label={roster.length ? `Élèves (${roster.length} dans la liste)` : planned ? `Élèves (${planned} au ${fmtShort(start)} d’après l’administration)` : 'Nombre d’élèves'}><input className="in" type="number" min={1} max={60} value={n} onChange={(e) => setCount(Math.min(60, Math.max(1, Number(e.target.value) || 1)))} /></Field>
        <Field label="Première séance"><input className="in" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Intervalle (jours)"><input className="in" type="number" min={1} max={60} value={step} onChange={(e) => setStep(Math.max(1, Number(e.target.value) || 7))} /></Field>
      </div>
      <div className="f no-print"><span className="lab">TP de la rotation ({level ?? '—'})</span>
        {tps.length === 0 ? <p className="muted">Aucun TP de ce niveau dans le catalogue.</p> : <div className="picks">{tps.filter((t) => !t.parent_id).flatMap((t) => [t, ...(kids.get(t.id) ?? [])]).map((t) => <label key={t.id} className="pick" style={t.parent_id ? { marginLeft: 18 } : undefined}><input type="checkbox" checked={picked.includes(t.id)} onChange={() => toggle(t.id)} />{t.parent_id ? '↳ ' : ''}{t.code ? `${t.code} · ` : ''}{t.title}{kids.get(t.id)?.length ? ` (${kids.get(t.id)!.length} sous-TP)` : ''}</label>)}</div>}</div>
      {stations.length > 0 && (
        <div className="scroll no-print"><table className="tbl">
          <thead><tr><th>TP</th><th>Postes</th><th>Élèves par poste</th><th>Capacité</th></tr></thead>
          <tbody>{stations.map((s) => (
            <tr key={s.id}>
              <td>{s.name}</td>
              <td><input className="in" type="number" min={0} max={40} style={{ width: 72 }} aria-label={`Postes, ${s.name}`} value={s.postes} onChange={(e) => setPostes((p) => ({ ...p, [s.id]: Math.max(0, Number(e.target.value) || 0) }))} /></td>
              <td><select className="in" aria-label={`Équipes, ${s.name}`} value={s.team} onChange={(e) => setTeam((p) => ({ ...p, [s.id]: Number(e.target.value) }))}>{[1, 2, 3, 4].map((k) => <option key={k} value={k}>{TEAM_LABEL[k]}</option>)}</select></td>
              <td>{capacity(s)} élève{capacity(s) > 1 ? 's' : ''}</td>
            </tr>))}</tbody>
        </table></div>
      )}
      {stations.length === 0 ? <Empty>Cochez au moins un TP.</Empty>
        : plan.problems.length > 0 ? <div className="alert" role="alert">{plan.problems.map((p) => <p key={p}>{p}</p>)}</div> : (
          <>
            <p role="status"><b>{plan.groups.length} sous-groupe{plan.groups.length > 1 ? 's' : ''}</b> de {Math.min(...plan.groups.map((g) => g.length))}{plan.groups.some((g) => g.length !== plan.groups[0].length) ? ` à ${Math.max(...plan.groups.map((g) => g.length))}` : ''} élèves, <b>{plan.rounds.length} séance{plan.rounds.length > 1 ? 's' : ''}</b>
              {plan.groups.length > stations.length && <> — il y a plus de sous-groupes que de TP : {plan.groups.length - stations.length} sous-groupe{plan.groups.length - stations.length > 1 ? 's attendent' : ' attend'} à chaque séance (autre activité). Ajoutez des postes ou un TP pour réduire le nombre de séances.</>}</p>
            <div className="scroll"><table className="tbl">
              <thead><tr><th>Sous-groupe</th><th>Élèves</th>{dates.map((d, r) => <th key={d}>Séance {r + 1}<br /><span className="small">{fmtShort(d)}</span></th>)}</tr></thead>
              <tbody>{plan.groups.map((g, i) => (
                <tr key={i}>
                  <td><b>Groupe {i + 1}</b><span className="sub">{g.length} élève{g.length > 1 ? 's' : ''}</span></td>
                  <td>{g.join(', ')}</td>
                  {plan.rounds.map((_, r) => {
                    const j = plan.rounds[r][i];
                    if (j < 0) return <td key={r} className="muted">Attente</td>;
                    const st = plan.stations[j];
                    const teams = teamsOf(g, st.team);
                    return <td key={r}>{st.name}{st.team > 1 && <span className="sub">{teams.map((t) => t.join(' + ')).join(' · ')}</span>}</td>;
                  })}
                </tr>))}</tbody>
            </table></div>
            <div className="row no-print"><button className="btn sm" onClick={() => void exportXlsx()}>Exporter en Excel</button><button className="btn ghost sm" onClick={exportCsv}>Exporter en CSV</button><button className="btn ghost sm" onClick={() => window.print()}>Imprimer</button></div>
            <p className="muted small no-print">Le fichier Excel s’ouvre directement dans Google Sheets (Drive, Nouveau, Importer le fichier) ; il contient la rotation, les équipes par séance et les effectifs.</p>
          </>
        )}
    </section>
  );
}
