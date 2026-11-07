import { useMemo } from 'react';
import { useStore } from '@/state/store';
import { buildOccurrences } from '@/lib/occupancy';
import { addDays, fmtShort, iso, mondayOf, minToHM } from '@/lib/dates';
import { PRIORITIES, MAINT_STATUS, PURCHASE_STATUS, SYSTEM_STATES, eur } from '@/lib/domain';
import { Chip, Empty, PageHead } from '@/components/ui';

export default function Home({ go }: { go: (tab: string) => void }) {
  const { data, roomById, systemById, tpById, who } = useStore();
  const today = iso(new Date());
  const monday = mondayOf(new Date());
  const weekFrom = iso(monday);
  const weekTo = iso(addDays(monday, 6));

  const { week, todayOccs } = useMemo(() => {
    const w = buildOccurrences(data.timetable_slots, data.sessions, weekFrom, weekTo);
    return { week: w.occs, todayOccs: w.occs.filter((o) => o.date === today) };
  }, [data.timetable_slots, data.sessions, weekFrom, weekTo, today]);

  const down = data.systems.filter((s) => s.state !== 'service');
  const openM = data.maintenance
    .filter((m) => m.status !== 'done')
    .sort((a, b) => PRIORITIES[b.priority].rank - PRIORITIES[a.priority].rank || (a.due_date ?? '9').localeCompare(b.due_date ?? '9'));
  const urgent = openM.filter((m) => m.priority === 'u').length;
  const toValidate = data.purchases.filter((p) => p.status === 'req');
  const toValidateTotal = toValidate.reduce((a, p) => a + p.qty * Number(p.unit_price), 0);
  const activeRooms = data.rooms.filter((r) => r.active);
  const busyToday = new Set(todayOccs.map((o) => o.roomId).filter(Boolean)).size;
  const recent = data.purchases.filter((p) => ['req', 'ok', 'ord'].includes(p.status)).slice(0, 6);

  return (
    <>
      <PageHead tab="accueil" title="Tableau de bord" />
      <div className="kpis">
        <Kpi onClick={() => go('systemes')} n={data.systems.length} label="systèmes" sub={down.length ? `${down.length} indisponible${down.length > 1 ? 's' : ''}` : 'tous en service'} alert={down.length > 0} />
        <Kpi onClick={() => go('occupation')} n={busyToday} label="salles occupées aujourd’hui" sub={`sur ${activeRooms.length} salle${activeRooms.length > 1 ? 's' : ''}`} />
        <Kpi onClick={() => go('maintenance')} n={openM.length} label="interventions ouvertes" sub={urgent ? `${urgent} urgente${urgent > 1 ? 's' : ''}` : 'aucune urgence'} alert={urgent > 0} />
        <Kpi onClick={() => go('achats')} n={toValidate.length} label="achats à valider" sub={toValidate.length ? `${eur(toValidateTotal)} estimés` : 'rien en attente'} />
        <Kpi onClick={() => go('planning')} n={week.length} label="séances cette semaine" sub={`semaine du ${fmtShort(weekFrom)}`} />
      </div>
      <div className="cols">
        <section className="panel">
          <h2>Aujourd’hui</h2>
          {todayOccs.length ? (
            <div className="stack">
              {todayOccs.map((o) => (
                <div key={o.key} className="row between">
                  <div>
                    <b>{minToHM(o.start)}–{minToHM(o.end)}</b> {o.groupCode ?? o.label}
                    <span className="muted small"> · {o.roomId ? roomById.get(o.roomId)?.name : 'sans salle'}{o.tpId ? ` · ${tpById.get(o.tpId)?.code ?? tpById.get(o.tpId)?.title}` : ''}</span>
                  </div>
                  <span className="muted small">{who(o.teacherId, o.teacherLabel)}</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty>Aucune séance aujourd’hui.</Empty>
          )}
        </section>
        <section className="panel">
          <h2>Interventions à traiter</h2>
          {openM.length ? (
            <div className="stack">
              {openM.slice(0, 6).map((m) => (
                <div key={m.id} className="row between">
                  <div>
                    <b>{m.title}</b>
                    <span className="muted small"> · {systemById.get(m.system_id)?.name}</span>
                  </div>
                  <div className="row">
                    <Chip tone={PRIORITIES[m.priority].tone}>{PRIORITIES[m.priority].label}</Chip>
                    <Chip tone={MAINT_STATUS[m.status].tone}>{MAINT_STATUS[m.status].label}</Chip>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty>Aucune intervention ouverte.</Empty>
          )}
        </section>
        <section className="panel">
          <h2>Demandes d’achat en cours</h2>
          {recent.length ? (
            <div className="stack">
              {recent.map((p) => (
                <div key={p.id} className="row between">
                  <div>
                    <b>{p.item}</b>
                    <span className="muted small"> · ×{p.qty} · {who(p.requested_by)}</span>
                  </div>
                  <Chip tone={PURCHASE_STATUS[p.status].tone}>{PURCHASE_STATUS[p.status].label}</Chip>
                </div>
              ))}
            </div>
          ) : (
            <Empty>Aucune demande en cours.</Empty>
          )}
        </section>
        <section className="panel">
          <h2>Systèmes indisponibles</h2>
          {down.length ? (
            <div className="stack">
              {down.map((s) => (
                <div key={s.id} className="row between">
                  <div>
                    <b>{s.name}</b>
                    <span className="muted small"> · {s.room_id ? roomById.get(s.room_id)?.name : 'sans salle'}</span>
                  </div>
                  <Chip tone={SYSTEM_STATES[s.state].tone}>{SYSTEM_STATES[s.state].label}</Chip>
                </div>
              ))}
            </div>
          ) : (
            <Empty>Tous les systèmes sont en service.</Empty>
          )}
        </section>
      </div>
    </>
  );
}

function Kpi({ n, label, sub, alert, onClick }: { n: number; label: string; sub: string; alert?: boolean; onClick: () => void }) {
  return (
    <button className={'kpi' + (alert ? ' alert' : '')} onClick={onClick}>
      <span className="n">{n}</span>
      <span className="l">{label}</span>
      <span className="s">{sub}</span>
    </button>
  );
}
