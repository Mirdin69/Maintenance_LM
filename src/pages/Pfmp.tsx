import { useMemo, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/state/auth';
import { useAct, useStore } from '@/state/store';
import { GROUP_CODES, byText } from '@/lib/domain';
import { addDays, fmtDate, iso } from '@/lib/dates';
import { usePersisted } from '@/hooks/usePersisted';
import type { Company, PfmpPeriod, PfmpStatus } from '@/lib/types';
import { AddPanel, Chip, ConfirmButton, Empty, Field, Options, PageHead, Seg, downloadBlob, toCsv } from '@/components/ui';

const STATUS: Record<PfmpStatus, { label: string; tone: 'idle' | 'info' | 'ok' }> = {
  planned: { label: 'Prévue', tone: 'idle' }, ongoing: { label: 'En cours', tone: 'info' }, done: { label: 'Terminée', tone: 'ok' },
};

export default function Pfmp() {
  const [sub, setSub] = usePersisted<'periodes' | 'entreprises'>('pfmp-sub', 'periodes', ['periodes', 'entreprises']);
  return (
    <>
      <PageHead tab="pfmp" title="PFMP" />
      <div className="tools"><Seg<'periodes' | 'entreprises'> label="Section" value={sub} onChange={setSub} items={[['periodes', 'Périodes'], ['entreprises', 'Entreprises']]} /></div>
      {sub === 'periodes' ? <Periods /> : <Companies />}
    </>
  );
}

function Periods() {
  const { data } = useStore();
  const { canWrite } = useAuth();
  const act = useAct();
  const [group, setGroup] = useState('');
  const [editing, setEditing] = useState<PfmpPeriod | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [formGroup, setFormGroup] = useState('');
  const today = iso(new Date());
  const soon = iso(addDays(new Date(), 14));
  const stu = useMemo(() => new Map(data.students.map((s) => [s.id, s])), [data.students]);
  const co = useMemo(() => new Map(data.companies.map((c) => [c.id, c])), [data.companies]);

  const list = data.pfmp_periods.filter((p) => !group || stu.get(p.student_id)?.group_code === group).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const candidates = data.students.filter((s) => !formGroup || s.group_code === formGroup).sort(byText((s) => s.name));
  const state = (p: PfmpPeriod): PfmpStatus => (p.status === 'done' ? 'done' : p.start_date <= today && p.end_date >= today ? 'ongoing' : p.status);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const row = {
      student_id: f.get('student_id'), company_id: String(f.get('company_id')) || null, start_date: f.get('start_date'), end_date: f.get('end_date'),
      tutor: String(f.get('tutor')).trim() || null, visit_date: String(f.get('visit_date')) || null, visit_by: String(f.get('visit_by')).trim() || null,
      evaluation: String(f.get('evaluation')).trim() || null, status: f.get('status'),
    };
    if (String(row.end_date) < String(row.start_date)) return void act(() => Promise.reject(new Error('La fin est avant le début.')));
    const ok = await act(() => (editing ? api.update('pfmp_periods', { id: editing.id }, row) : api.insert('pfmp_periods', row)), { ok: editing ? 'Période modifiée.' : 'Période ajoutée.', tables: ['pfmp_periods'] });
    if (ok) { setEditing(null); setFormKey((k) => k + 1); }
  };

  const exportCsv = () => downloadBlob('pfmp.csv', toCsv([
    ['Élève', 'Groupe', 'Entreprise', 'Début', 'Fin', 'Tuteur', 'Visite', 'Visite faite par', 'Statut', 'Évaluation'],
    ...list.map((p) => [stu.get(p.student_id)?.name, stu.get(p.student_id)?.group_code, p.company_id ? co.get(p.company_id)?.name : '', p.start_date, p.end_date, p.tutor, p.visit_date, p.visit_by, STATUS[state(p)].label, p.evaluation]),
  ]));

  return (
    <>
      {canWrite && (
        <AddPanel summary={editing ? 'Modifier la période' : 'Ajouter une période de PFMP'} open={!!editing}>
          {data.students.length === 0 ? <Empty>Aucun élève : un gestionnaire peut les ajouter dans Administration, Élèves.</Empty> : (
            <form className="form" key={`${editing?.id ?? 'new'}-${formKey}`} onSubmit={submit}>
              <Field label="Groupe (filtre)"><select className="in" value={formGroup} onChange={(e) => setFormGroup(e.target.value)}><Options placeholder="Tous" items={GROUP_CODES.map((g) => [g, g])} /></select></Field>
              <Field label="Élève *"><select className="in" name="student_id" required defaultValue={editing?.student_id ?? ''}><Options placeholder="Choisir…" items={candidates.map((s) => [s.id, `${s.name} (${s.group_code})`])} /></select></Field>
              <Field label="Entreprise"><select className="in" name="company_id" defaultValue={editing?.company_id ?? ''}><Options placeholder="À définir" items={data.companies.map((c) => [c.id, c.name])} /></select></Field>
              <Field label="Début *"><input className="in" type="date" name="start_date" required defaultValue={editing?.start_date} /></Field>
              <Field label="Fin *"><input className="in" type="date" name="end_date" required defaultValue={editing?.end_date} /></Field>
              <Field label="Tuteur"><input className="in" name="tutor" maxLength={120} defaultValue={editing?.tutor ?? ''} /></Field>
              <Field label="Date de la visite"><input className="in" type="date" name="visit_date" defaultValue={editing?.visit_date ?? ''} /></Field>
              <Field label="Visite faite par"><input className="in" name="visit_by" maxLength={120} defaultValue={editing?.visit_by ?? ''} /></Field>
              <Field label="Statut"><select className="in" name="status" defaultValue={editing?.status ?? 'planned'}><Options items={Object.entries(STATUS).map(([k, v]) => [k, v.label])} /></select></Field>
              <Field label="Évaluation / remarques" wide><textarea className="in" name="evaluation" maxLength={2000} defaultValue={editing?.evaluation ?? ''} /></Field>
              <div className="actions"><button className="btn" type="submit">{editing ? 'Enregistrer' : 'Ajouter'}</button>{editing && <button className="btn ghost" type="button" onClick={() => setEditing(null)}>Annuler</button>}</div>
            </form>
          )}
        </AddPanel>
      )}
      <section className="panel">
        <div className="row between">
          <h2>Périodes ({list.length})</h2>
          <div className="row">
            <select className="in" aria-label="Filtrer par groupe" value={group} onChange={(e) => setGroup(e.target.value)}><Options placeholder="Tous les groupes" items={GROUP_CODES.map((g) => [g, g])} /></select>
            <button className="btn ghost sm" onClick={exportCsv} disabled={!list.length}>Exporter en CSV</button>
          </div>
        </div>
        {list.length === 0 ? <Empty>Aucune période de PFMP.</Empty> : (
          <div className="scroll"><table className="tbl">
            <thead><tr><th>Élève</th><th>Entreprise</th><th>Période</th><th>Visite</th><th>Statut</th>{canWrite && <th />}</tr></thead>
            <tbody>{list.map((p) => {
              const st = state(p);
              const toVisit = p.status !== 'done' && !p.visit_date && p.start_date <= soon && p.end_date >= today;
              return (
                <tr key={p.id}>
                  <td><b>{stu.get(p.student_id)?.name ?? '—'}</b><span className="sub">{stu.get(p.student_id)?.group_code}</span></td>
                  <td>{p.company_id ? co.get(p.company_id)?.name : <span className="muted">À définir</span>}{p.tutor && <span className="sub">Tuteur : {p.tutor}</span>}</td>
                  <td>{fmtDate(p.start_date)} → {fmtDate(p.end_date)}</td>
                  <td>{p.visit_date ? `${fmtDate(p.visit_date)}${p.visit_by ? ` (${p.visit_by})` : ''}` : toVisit ? <Chip tone="warn">À planifier</Chip> : '—'}</td>
                  <td><Chip tone={STATUS[st].tone}>{STATUS[st].label}</Chip>{p.evaluation && <span className="sub">{p.evaluation}</span>}</td>
                  {canWrite && <td><div className="row"><button className="btn ghost sm" onClick={() => { setEditing(p); window.scrollTo(0, 0); }}>Modifier</button>
                    <ConfirmButton onConfirm={() => void act(() => api.remove('pfmp_periods', { id: p.id }), { ok: 'Période supprimée.', tables: ['pfmp_periods'] })}>Supprimer</ConfirmButton></div></td>}
                </tr>);
            })}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}

function Companies() {
  const { data } = useStore();
  const { canWrite, isAdmin } = useAuth();
  const act = useAct();
  const [editing, setEditing] = useState<Company | null>(null);
  const [formKey, setFormKey] = useState(0);
  const list = [...data.companies].sort(byText((c) => c.name));

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k)).trim() || null;
    const row = { name: String(f.get('name')).trim(), address: v('address'), contact: v('contact'), phone: v('phone'), email: v('email'), notes: v('notes') };
    const ok = await act(() => (editing ? api.update('companies', { id: editing.id }, row) : api.insert('companies', row)), { ok: editing ? 'Entreprise modifiée.' : 'Entreprise ajoutée.', tables: ['companies'] });
    if (ok) { setEditing(null); setFormKey((k) => k + 1); }
  };

  return (
    <>
      {canWrite && (
        <AddPanel summary={editing ? 'Modifier l’entreprise' : 'Ajouter une entreprise'} open={!!editing}>
          <form className="form" key={`${editing?.id ?? 'new'}-${formKey}`} onSubmit={submit}>
            <Field label="Nom *" wide><input className="in" name="name" required maxLength={120} defaultValue={editing?.name} /></Field>
            <Field label="Adresse" wide><input className="in" name="address" maxLength={200} defaultValue={editing?.address ?? ''} /></Field>
            <Field label="Contact"><input className="in" name="contact" maxLength={120} defaultValue={editing?.contact ?? ''} /></Field>
            <Field label="Téléphone"><input className="in" name="phone" maxLength={30} defaultValue={editing?.phone ?? ''} /></Field>
            <Field label="E-mail"><input className="in" name="email" type="email" maxLength={120} defaultValue={editing?.email ?? ''} /></Field>
            <Field label="Notes" wide><textarea className="in" name="notes" maxLength={1000} defaultValue={editing?.notes ?? ''} /></Field>
            <div className="actions"><button className="btn" type="submit">{editing ? 'Enregistrer' : 'Ajouter'}</button>{editing && <button className="btn ghost" type="button" onClick={() => setEditing(null)}>Annuler</button>}</div>
          </form>
        </AddPanel>
      )}
      <section className="panel">
        <h2>Entreprises ({list.length})</h2>
        {list.length === 0 ? <Empty>Aucune entreprise.</Empty> : (
          <div className="scroll"><table className="tbl">
            <thead><tr><th>Entreprise</th><th>Contact</th><th className="num">Périodes</th>{canWrite && <th />}</tr></thead>
            <tbody>{list.map((c) => (
              <tr key={c.id}>
                <td><b>{c.name}</b>{c.address && <span className="sub">{c.address}</span>}{c.notes && <span className="sub">{c.notes}</span>}</td>
                <td>{[c.contact, c.phone].filter(Boolean).join(' · ') || '—'}{c.email && <span className="sub">{c.email}</span>}</td>
                <td className="num">{data.pfmp_periods.filter((p) => p.company_id === c.id).length}</td>
                {canWrite && <td><div className="row"><button className="btn ghost sm" onClick={() => { setEditing(c); window.scrollTo(0, 0); }}>Modifier</button>
                  {isAdmin && <ConfirmButton onConfirm={() => void act(() => api.remove('companies', { id: c.id }), { ok: 'Entreprise supprimée.', tables: ['companies', 'pfmp_periods'] })}>Supprimer</ConfirmButton>}</div></td>}
              </tr>))}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
