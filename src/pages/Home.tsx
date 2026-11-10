import { useMemo } from 'react';
import { useStore } from '@/state/store';
import { useAuth } from '@/state/auth';
import { useNotes } from '@/components/Notifications';
import { buildWarnings, isMyCell } from '@/lib/semainier';
import { buildOccurrences } from '@/lib/occupancy';
import { addDays, fmtShort, iso, mondayOf, minToHM } from '@/lib/dates';
import { PRIORITIES, MAINT_STATUS, PURCHASE_STATUS, SYSTEM_STATES, eur } from '@/lib/domain';
import { Chip, Empty, PageHead } from '@/components/ui';

export default function Home({ go }: { go: (tab: string) => void }) {
  const { data, roomById, systemById, tpById, who } = useStore();
  const today = iso(new Date());
  const { profile, canWrite, isAdmin } = useAuth();
  const notes = useNotes();
  const mineToday = data.planning_cells
    .filter((c) => c.day === today && c.tp_id && isMyCell(c, tpById.get(c.tp_id), profile))
    .sort((a, b) => a.group_code.localeCompare(b.group_code));
  const warnings = buildWarnings(data.planning_cells, tpById, systemById);
  const myMaint = data.maintenance.filter((m) => m.created_by === profile?.id && m.status !== 'done');
  const myBuys = data.purchases.filter((p) => p.requested_by === profile?.id && p.status === 'req');
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
      {isAdmin && (
        <section className="panel" aria-label="À traiter">
          <h2>À traiter</h2>
          {notes.length ? (
            <div className="stack">{notes.map((n) => (
              <div key={n.key} className="row between"><span className={`chip ${n.tone === 'info' ? 'idle' : n.tone}`}>{n.text}</span><button className="btn ghost sm" onClick={() => go(n.tab)}>Ouvrir</button></div>
            ))}</div>
          ) : <p className="muted">Rien en attente.</p>}
        </section>
      )}
      {canWrite && (
        <section className="panel" aria-label="Ma journée">
          <h2>Ma journée</h2>
          {mineToday.length ? (
            <div className="stack">
              {mineToday.map((c) => {
                const tp = tpById.get(c.tp_id!)!;
                const w = warnings.get(`${c.day}|${c.group_code}`);
                return (
                  <div key={c.group_code} className="row between">
                    <div><b>{c.group_code}</b> · {tp.code ?? tp.title}<span className="muted small"> {tp.title}</span>{tp.objective && <span className="muted small"> · {tp.objective}</span>}</div>
                    {w && <span className="chip warn" title={w.join('\n')}>⚠ {w[0]}</span>}
                  </div>
                );
              })}
            </div>
          ) : <p className="muted">Aucun de vos cours au semainier aujourd’hui.</p>}
          {(myMaint.length > 0 || myBuys.length > 0) && (
            <p className="muted small">
              {myMaint.length > 0 && <>{myMaint.length} intervention{myMaint.length > 1 ? 's' : ''} déclarée{myMaint.length > 1 ? 's' : ''} par vous encore ouverte{myMaint.length > 1 ? 's' : ''}. </>}
              {myBuys.length > 0 && <>{myBuys.length} demande{myBuys.length > 1 ? 's' : ''} d’achat en attente de validation.</>}
            </p>
          )}
        </section>
      )}
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
