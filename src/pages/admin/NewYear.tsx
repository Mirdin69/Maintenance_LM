import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAct, useStore } from '@/state/store';
import { fmtDate, fmtDayLong, schoolYearBounds, schoolYearOf } from '@/lib/dates';
import { fetchZoneA, onlyNewPeriods, planNewYear, type NewPeriod } from '@/lib/newYear';
import { Chip, Field } from '@/components/ui';

const CHUNK = 200;

/** Importe les vacances de la zone A dans le calendrier (aperçu puis confirmation) */
export function ZoneAImport({ year }: { year: number }) {
  const { data } = useStore();
  const act = useAct();
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<NewPeriod[] | null>(null);
  const [error, setError] = useState('');

  const fetchIt = async () => {
    setBusy(true); setError(''); setFound(null);
    try {
      const list = onlyNewPeriods(await fetchZoneA(year), data.calendar_periods);
      if (!list.length) setError(`Les vacances de la zone A ${year}-${year + 1} sont déjà toutes enregistrées.`);
      else setFound(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };
  const add = async () => {
    if (!found) return;
    if (await act(() => api.insert('calendar_periods', found), { ok: `${found.length} période${found.length > 1 ? 's' : ''} de vacances ajoutée${found.length > 1 ? 's' : ''}.`, tables: ['calendar_periods'] })) setFound(null);
  };

  return (
    <div className="stack">
      <button type="button" className="btn ghost sm" disabled={busy} onClick={() => void fetchIt()}>{busy ? 'Recherche…' : `Importer les vacances ${year}-${year + 1} (zone A)`}</button>
      {error && <div className="alert" role="alert">{error}</div>}
      {found && (
        <div className="panel stack" role="region" aria-label="Vacances trouvées">
          <p>Vacances de la zone A trouvées (source : ministère de l’Éducation nationale). Vérifiez, puis ajoutez :</p>
          <ul>{found.map((p) => <li key={p.start_date}><b>{p.label}</b> : du {fmtDate(p.start_date)} au {fmtDate(p.end_date)}</li>)}</ul>
          <div className="row"><button type="button" className="btn sm" onClick={() => void add()}>Ajouter ces {found.length} périodes</button><button type="button" className="btn ghost sm" onClick={() => setFound(null)}>Annuler</button></div>
        </div>
      )}
    </div>
  );
}

/** Préremplit le semainier d'une nouvelle année à partir de l'année précédente */
export function NewYear() {
  const { data, settings } = useStore();
  const act = useAct();
  const prevFrom = settings.year_start || schoolYearBounds(schoolYearOf(new Date())).from;
  const prevTo = settings.year_end || schoolYearBounds(Number(prevFrom.slice(0, 4))).to;
  const ny = Number(prevFrom.slice(0, 4)) + 1;
  const [from, setFrom] = useState(schoolYearBounds(ny).from);
  const [to, setTo] = useState(schoolYearBounds(ny).to);
  const [labels, setLabels] = useState(true);
  const [switchYear, setSwitchYear] = useState(true);
  const [open, setOpen] = useState(false);

  const plan = useMemo(() => planNewYear({ cells: data.planning_cells, periods: data.calendar_periods, prev: { from: prevFrom, to: prevTo }, next: { from, to }, includeLabels: labels }),
    [data.planning_cells, data.calendar_periods, prevFrom, prevTo, from, to, labels]);
  const valid = from < to && from > prevFrom;
  const changed = plan.diffs.filter((d) => d.status !== 'identique');

  const confirm = async () => {
    const rows = plan.ops.map((o) => ({ day: o.day, group_code: o.group, tp_id: o.value.startsWith('tp:') ? o.value.slice(3) : null, label: o.value.startsWith('lab:') ? o.value.slice(4) : null }));
    const prevSettings = { year_start: settings.year_start, year_end: settings.year_end };
    const run = async () => {
      for (let i = 0; i < rows.length; i += CHUNK) await api.upsert('planning_cells', rows.slice(i, i + CHUNK), 'day,group_code');
      if (switchYear) await api.upsert('settings', [{ key: 'year_start', value: from }, { key: 'year_end', value: to }], 'key');
    };
    const undo = async () => {
      for (let i = 0; i < rows.length; i += 20) await Promise.all(rows.slice(i, i + 20).map((r) => api.remove('planning_cells', { day: r.day, group_code: r.group_code })));
      if (switchYear && prevSettings.year_start) await api.upsert('settings', [{ key: 'year_start', value: prevSettings.year_start }, { key: 'year_end', value: prevSettings.year_end ?? '' }], 'key');
    };
    if (await act(run, { ok: `Semainier ${from.slice(0, 4)}-${to.slice(0, 4)} prérempli : ${rows.length} case${rows.length > 1 ? 's' : ''}.`, tables: ['planning_cells', 'settings'], undo })) setOpen(false);
  };

  return (
    <section className="panel stack">
      <h2>Préparer la nouvelle année scolaire</h2>
      <p className="muted">Reprend le semainier {prevFrom.slice(0, 4)}-{prevTo.slice(0, 4)} comme modèle : chaque case revient le même jour de la même semaine (depuis la rentrée). Les cases qui tombent sur des vacances ou des jours fériés de la nouvelle année sont signalées, pas copiées. Importez d’abord les vacances de la nouvelle année.</p>
      <div className="tools">
        <Field label="Rentrée de la nouvelle année"><input className="in" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Fin d’année"><input className="in" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <label className="row"><input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} /> Copier aussi les cases libres (PFMP, évaluation…)</label>
        <label className="row"><input type="checkbox" checked={switchYear} onChange={(e) => setSwitchYear(e.target.checked)} /> Passer le site sur la nouvelle année</label>
      </div>
      <ZoneAImport year={Number(from.slice(0, 4)) || ny} />
      {!valid && <div className="alert" role="alert">La rentrée doit être postérieure à celle de l’année actuelle ({fmtDate(prevFrom)}) et avant la fin d’année.</div>}
      <div className="row"><button type="button" className="btn" disabled={!valid} onClick={() => setOpen(true)}>Prévisualiser et préremplir</button></div>

      {open && (
        <div className="modal-back no-print" onClick={() => setOpen(false)}>
          <div className="modal panel stack" role="dialog" aria-modal="true" aria-label="Préparer la nouvelle année" style={{ maxHeight: '85vh', overflow: 'auto', maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
            <h2>Semainier {from.slice(0, 4)}-{to.slice(0, 4)}</h2>
            <p><b>{plan.ops.length}</b> case{plan.ops.length > 1 ? 's' : ''} à reporter{plan.kept ? `, ${plan.kept} déjà remplie${plan.kept > 1 ? 's' : ''} (conservée${plan.kept > 1 ? 's' : ''})` : ''}{plan.blocked.length ? `, ${plan.blocked.length} non reportée${plan.blocked.length > 1 ? 's' : ''} (vacances ou férié)` : ''}.</p>
            {plan.noNewHolidays && <div className="alert" role="alert"><b>Attention :</b> aucune vacance n’est enregistrée pour la nouvelle année. Fermez cette fenêtre et importez d’abord les vacances de la zone A, sinon des cases seront placées pendant les vacances.</div>}
            {changed.length > 0 && (
              <div className="alert" role="alert">
                <b>Les vacances ne tombent plus aux mêmes semaines :</b>
                <ul>{changed.map((d) => (
                  <li key={d.label + d.after}><b>{d.label}</b> {d.status === 'nouveau' ? <>(nouvelle période) : {d.after}</> : d.status === 'absent' ? <>(absente de la nouvelle année) : {d.before}</> : <>: {d.before} → {d.after}</>}</li>
                ))}</ul>
              </div>
            )}
            {changed.length === 0 && !plan.noNewHolidays && <p><Chip tone="ok">Vacances identiques</Chip> aux mêmes semaines que l’an dernier.</p>}
            {plan.blocked.length > 0 && (
              <details><summary>Cases non reportées ({plan.blocked.length}) : à replacer à la main</summary>
                <ul className="small">{plan.blocked.slice(0, 40).map((b, i) => <li key={i}>{fmtDayLong(b.day)} · {b.group} · {b.why}</li>)}</ul>
                {plan.blocked.length > 40 && <p className="muted small">… et {plan.blocked.length - 40} autre(s).</p>}
              </details>
            )}
            <div className="row">
              <button type="button" className="btn" disabled={!plan.ops.length && !switchYear} onClick={() => void confirm()}>Préremplir le semainier</button>
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Annuler</button>
            </div>
            <p className="muted small">L’action peut être annulée juste après.</p>
          </div>
        </div>
      )}
    </section>
  );
}
