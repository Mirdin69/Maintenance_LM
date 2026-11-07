import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { usePersisted } from '@/hooks/usePersisted';
import { useAuth } from '@/state/auth';
import { useAct, useStore } from '@/state/store';
import { GROUP_CODES, LEVELS, MARKS, MARK_LABEL, levelOfGroup, byText } from '@/lib/domain';
import type { MarkLevel } from '@/lib/types';
import { Empty, Field, Options, PageHead, Seg } from '@/components/ui';
import { competencesOf, groupShare, studentCompetence } from '@/lib/competences';
import { COMPETENCES } from '@/lib/domain';

const NEXT: Record<string, MarkLevel | ''> = { '': 'NA', NA: 'ECA', ECA: 'PA', PA: 'A', A: '' };

export default function Students() {
  const { data } = useStore();
  const { canWrite } = useAuth();
  const act = useAct();
  const [group, setGroup] = usePersisted<string>('students-group', GROUP_CODES[0], GROUP_CODES);
  const [view, setView] = usePersisted<'tp' | 'comp'>('students-view', 'tp', ['tp', 'comp']);
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

  const stats = (sid: string) => {
    const done = tps.filter((t) => get(sid, t.id) === 'A').length;
    return tps.length ? `${done}/${tps.length}` : '—';
  };

  return (
    <>
      <PageHead tab="eleves" title="Suivi des élèves" />
      <div className="tools">
        <Field label="Groupe">
          <select className="in" value={group} onChange={(e) => setGroup(e.target.value)}>
            {LEVELS.map((l) => <optgroup key={l} label={l}><Options items={GROUP_CODES.filter((g) => levelOfGroup(g) === l).map((g) => [g, g])} /></optgroup>)}
          </select>
        </Field>
        <Seg<'tp' | 'comp'> label="Vue" value={view} onChange={setView} items={[['tp', 'Par TP'], ['comp', 'Par compétence']]} />
        <div className="legend">{MARKS.map((m) => <span key={m}><i className={`mk ${m}`}>{m}</i> {MARK_LABEL[m]}</span>)}</div>
      </div>
      {view === 'comp' ? (
        <section className="panel">
          <div className="row between"><h2>{group} · compétences</h2><button className="btn ghost sm no-print" onClick={() => window.print()}>Imprimer</button></div>
          {students.length === 0 || tps.length === 0 ? <Empty>Il faut des élèves dans ce groupe et des TP avec des compétences pour ce niveau.</Empty> : (() => {
            const comps = competencesOf(tps);
            const byStudent = students.map((st) => comps.map((c) => studentCompetence(st.id, c, tps, data.progress)));
            return (
              <div className="scroll">
                <table className="mx">
                  <thead><tr><th className="nm">Élève</th>{comps.map((c) => <th key={c} title={COMPETENCES[c]}>{c}</th>)}</tr></thead>
                  <tbody>
                    {students.map((st, i) => (
                      <tr key={st.id}><td className="nm">{st.name}</td>{byStudent[i].map((cell, j) => (
                        <td key={comps[j]}><span className={`mk ${cell.level}`} title={`${cell.done}/${cell.total} TP évalués`} aria-label={`${st.name}, ${comps[j]} : ${cell.level ? MARK_LABEL[cell.level] : 'non évalué'}`}>{cell.level || '·'}</span></td>
                      ))}</tr>
                    ))}
                    <tr><th className="nm">Élèves au moins PA</th>{comps.map((c, j) => { const v = groupShare(byStudent.map((r) => r[j])); return <td key={c}><b>{v === null ? '—' : `${v} %`}</b></td>; })}</tr>
                  </tbody>
                </table>
              </div>
            );
          })()}
          <p className="muted small">Niveau calculé à partir des évaluations des TP qui travaillent la compétence (moyenne : NA 1, ECA 2, PA 3, A 4).</p>
        </section>
      ) : (
      <section className="panel">
        <h2>{group} · {students.length} élève{students.length > 1 ? 's' : ''}</h2>
        {students.length === 0 ? <Empty>Aucun élève dans ce groupe. Un gestionnaire peut en ajouter dans Administration.</Empty> : tps.length === 0 ? <Empty>Aucun TP défini pour ce niveau. Ajoutez-en dans Planning des TP, Catalogue.</Empty> : (
          <div className="scroll">
            <table className="mx">
              <thead><tr><th className="nm">Élève</th>{tps.map((t) => <th key={t.id} title={t.title}>{t.code ?? t.title.slice(0, 6)}</th>)}<th>Acquis</th></tr></thead>
              <tbody>{students.map((s) => (
                <tr key={s.id}>
                  <td className="nm">{s.name}</td>
                  {tps.map((t) => {
                    const m = get(s.id, t.id);
                    return <td key={t.id}><button className={`mk ${m}`} disabled={!canWrite} aria-label={`${s.name}, ${t.code ?? t.title} : ${m ? MARK_LABEL[m] : 'non renseigné'}`} onClick={() => void cycle(s.id, t.id)}>{m || '·'}</button></td>;
                  })}
                  <td>{stats(s.id)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </section>
      )}
    </>
  );
}

