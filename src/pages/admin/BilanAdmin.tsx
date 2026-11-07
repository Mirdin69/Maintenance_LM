import { useMemo } from 'react';
import { useStore } from '@/state/store';
import { buildBilan } from '@/lib/bilan';
import { PURCHASE_STATUS, eur } from '@/lib/domain';
import { fmtDate, schoolYearBounds, schoolYearOf } from '@/lib/dates';
import { Empty, downloadBlob, toCsv } from '@/components/ui';

/** Synthèse de l'année scolaire : heures, usage des systèmes, pannes, achats, salles */
export default function BilanAdmin() {
  const { data, settings } = useStore();
  const b0 = schoolYearBounds(schoolYearOf(new Date()));
  const from = settings.year_start || b0.from;
  const to = settings.year_end || b0.to;
  const b = useMemo(() => buildBilan(data, from, to), [data, from, to]);

  const exportCsv = () => downloadBlob('bilan-annee.csv', toCsv([
    ['Groupes', 'Jours avec TP', 'Heures'], ...b.groups.map((g) => [g.group, g.days, g.hours]), [],
    ['Systèmes', 'Jours d’utilisation', 'Pannes', 'Pannes ouvertes', 'Durée moyenne de réparation (jours)'], ...b.systems.map((s) => [s.name, s.days, s.faults, s.open, s.downtimeDays ?? '']), [],
    ['Achats', 'Statut', 'Nombre', 'Total'], ...b.purchases.map((p) => [p.kind === 'mat' ? 'Matériel' : 'Consommable', PURCHASE_STATUS[p.status as keyof typeof PURCHASE_STATUS].label, p.count, p.total.toFixed(2).replace('.', ',')]), [],
    ['Salles', 'Heures par semaine'], ...b.rooms.map((r) => [r.name, r.hoursPerWeek]),
  ]));

  return (
    <div className="stack">
      <div className="row between no-print">
        <p className="muted">Bilan du {fmtDate(from)} au {fmtDate(to)}, calculé à partir du semainier, de la maintenance, des achats et de l’emploi du temps.</p>
        <div className="row"><button className="btn ghost sm" onClick={exportCsv}>Exporter en CSV</button><button className="btn ghost sm" onClick={() => window.print()}>Imprimer</button></div>
      </div>
      <h2 className="only-print">Bilan de l’année, du {fmtDate(from)} au {fmtDate(to)}</h2>
      <div className="kpis">
        <div className="kpi"><span className="n">{b.totals.cells}</span><span className="l">cases de TP au semainier</span></div>
        <div className="kpi"><span className="n">{b.totals.faults}</span><span className="l">pannes</span><span className="s">{b.totals.faultsClosed} réparées</span></div>
        <div className="kpi"><span className="n">{eur(b.totals.spent)}</span><span className="l">achats engagés</span></div>
      </div>
      <section className="panel">
        <h2>Par groupe</h2>
        {b.groups.length === 0 ? <Empty>Aucun TP au semainier sur cette période.</Empty> : (
          <div className="scroll"><table className="tbl"><thead><tr><th>Groupe</th><th className="num">Jours avec TP</th><th className="num">Heures</th><th>TP les plus fréquents</th></tr></thead>
            <tbody>{b.groups.map((g) => <tr key={g.group}><td><b>{g.group}</b></td><td className="num">{g.days}</td><td className="num">{g.hours || '—'}</td><td>{g.byTp.slice(0, 4).map((t) => `${t.tp} (${t.days})`).join(', ')}</td></tr>)}</tbody></table></div>
        )}
      </section>
      <section className="panel">
        <h2>Systèmes</h2>
        {b.systems.length === 0 ? <Empty>Aucun système.</Empty> : (
          <div className="scroll"><table className="tbl"><thead><tr><th>Système</th><th className="num">Jours d’utilisation</th><th className="num">Pannes</th><th className="num">Ouvertes</th><th className="num">Réparation moyenne</th></tr></thead>
            <tbody>{b.systems.map((s) => <tr key={s.name}><td><b>{s.name}</b></td><td className="num">{s.days}</td><td className="num">{s.faults}</td><td className="num">{s.open}</td><td className="num">{s.downtimeDays === null ? '—' : `${s.downtimeDays} j`}</td></tr>)}</tbody></table></div>
        )}
      </section>
      <section className="panel">
        <h2>Achats</h2>
        {b.purchases.length === 0 ? <Empty>Aucune demande d’achat.</Empty> : (
          <div className="scroll"><table className="tbl"><thead><tr><th>Type</th><th>Statut</th><th className="num">Demandes</th><th className="num">Total</th></tr></thead>
            <tbody>{b.purchases.map((p) => <tr key={p.kind + p.status}><td>{p.kind === 'mat' ? 'Matériel' : 'Consommable'}</td><td>{PURCHASE_STATUS[p.status as keyof typeof PURCHASE_STATUS].label}</td><td className="num">{p.count}</td><td className="num">{eur(p.total)}</td></tr>)}</tbody></table></div>
        )}
      </section>
      <section className="panel">
        <h2>Salles (heures d’emploi du temps par semaine)</h2>
        {b.rooms.length === 0 ? <Empty>Aucun créneau d’emploi du temps.</Empty> : (
          <div className="scroll"><table className="tbl"><thead><tr><th>Salle</th><th className="num">Heures / semaine</th></tr></thead>
            <tbody>{b.rooms.map((r) => <tr key={r.name}><td>{r.name}</td><td className="num">{r.hoursPerWeek}</td></tr>)}</tbody></table></div>
        )}
      </section>
    </div>
  );
}
