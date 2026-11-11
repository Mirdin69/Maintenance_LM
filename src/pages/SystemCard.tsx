import { useAuth } from '@/state/auth';
import { api } from '@/lib/api';
import { useAct, useStore } from '@/state/store';
import { DOMAINS, SYSTEM_STATES, byText } from '@/lib/domain';
import { Chip, Empty, Options } from '@/components/ui';
import { Img } from '@/components/Img';
import { FaultButton } from '@/components/ReportFault';

/** Fiche d'un système, ouverte par le QR code collé dessus : état, interventions, TP concernés, signalement de panne */
export default function SystemCard({ id, poste, go }: { id: string; poste: number | null; go: (t: string) => void }) {
  const { data, roomById } = useStore();
  const { canWrite } = useAuth();
  const act = useAct();
  const s = data.systems.find((x) => x.id === id);
  if (!s) return <section className="panel"><Empty>Ce système n’existe plus ou le lien est incorrect.</Empty><button className="btn ghost" onClick={() => go('accueil')}>Retour à l’accueil</button></section>;
  const open = data.maintenance.filter((m) => m.system_id === s.id && m.status !== 'done');
  const tps = data.tps.filter((t) => t.system_ids.includes(s.id)).sort(byText((t) => t.code ?? t.title));
  return (
    <section className="panel stack" aria-label={`Fiche de ${s.name}`}>
      <h2>{s.name}{poste ? ` · Poste ${poste}` : ''}</h2>
      <div className="sys-card">
        <Img url={s.image_url} alt={`Photo de ${s.name}`} className="thumb" width={300} />
        <div className="stack">
          <span><Chip tone={SYSTEM_STATES[s.state].tone}>{SYSTEM_STATES[s.state].label}</Chip> {DOMAINS[s.domain]}{s.ref ? ` · Réf. ${s.ref}` : ''}</span>
          <span className="muted">{s.room_id ? roomById.get(s.room_id)?.name : 'Sans salle'} · {s.qty} poste{s.qty > 1 ? 's' : ''}</span>
          {s.notes && <span>{s.notes}</span>}
        </div>
      </div>
      <div className="row">
        <FaultButton systemId={s.id} label="Signaler une panne" context={poste ? `Poste ${poste}.` : undefined} />
        {canWrite && (
          <select className="in" aria-label={`État de ${s.name}`} value={s.state} onChange={(e) => void act(() => api.update('systems', { id: s.id }, { state: e.target.value }), { tables: ['systems'] })}>
            <Options items={Object.entries(SYSTEM_STATES).map(([k, v]) => [k, v.label])} />
          </select>
        )}
        <button className="btn ghost sm" onClick={() => go('maintenance')}>Voir la maintenance</button>
      </div>
      <h3>Interventions ouvertes</h3>
      {open.length === 0 ? <p className="muted">Aucune intervention ouverte.</p> : <ul>{open.map((m) => <li key={m.id}><b>{m.title}</b>{m.description ? <span className="muted"> — {m.description}</span> : null}</li>)}</ul>}
      <h3>TP qui l’utilisent</h3>
      {tps.length === 0 ? <p className="muted">Aucun TP associé.</p> : <ul>{tps.map((t) => <li key={t.id}>{t.code ? `${t.code} · ` : ''}{t.title} <span className="muted">({t.level})</span></li>)}</ul>}
    </section>
  );
}
