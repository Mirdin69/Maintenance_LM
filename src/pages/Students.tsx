import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/state/auth';
import { useAct, useStore } from '@/state/store';
import { GROUP_CODES, LEVELS, MARKS, MARK_LABEL, levelOfGroup, byText } from '@/lib/domain';
import type { MarkLevel } from '@/lib/types';
import { Empty, Field, Options, PageHead } from '@/components/ui';

const NEXT: Record<string, MarkLevel | ''> = { '': 'NA', NA: 'ECA', ECA: 'PA', PA: 'A', A: '' };

export default function Students() {
  const { data } = useStore();
  const { canWrite } = useAuth();
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
        <div className="legend">{MARKS.map((m) => <span key={m}><i className={`mk ${m}`}>{m}</i> {MARK_LABEL[m]}</span>)}</div>
      </div>
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
    </>
  );
}

