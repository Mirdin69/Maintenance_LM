import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAct, useStore } from '@/state/store';
import { DAY_LONG } from '@/lib/dates';
import { LEVELS } from '@/lib/domain';
import { weekdaysFor } from '@/lib/calendar';
import { DEFAULT_SCHEDULE, formatSchedule, fromHM, parseSchedule, periodsIn, toHM, type ScheduleConfig } from '@/lib/schedule';

type Draft = { periodMin: number; breaks: Array<[string, string]>; days: Record<number, { M: [string, string]; A: [string, string] }> };

const toDraft = (c: ScheduleConfig): Draft => ({
  periodMin: c.periodMin,
  breaks: c.breaks.map(([a, b]) => [toHM(a), toHM(b)]),
  days: Object.fromEntries(Object.entries(c.days).map(([d, h]) => [d, { M: [toHM(h.M[0]), toHM(h.M[1])], A: [toHM(h.A[0]), toHM(h.A[1])] }])) as Draft['days'],
});

/** Convertit le brouillon en trame ; null et la liste des erreurs si une valeur est invalide */
function fromDraft(d: Draft): { cfg: ScheduleConfig | null; errors: string[] } {
  const errors: string[] = [];
  const days: ScheduleConfig['days'] = {};
  for (const [k, h] of Object.entries(d.days)) {
    const day = Number(k);
    const one = (p: 'M' | 'A', label: string): [number, number] => {
      const a = fromHM(h[p][0]); const b = fromHM(h[p][1]);
      if (a === null || b === null) { errors.push(`${DAY_LONG[day - 1]} ${label} : heures invalides.`); return DEFAULT_SCHEDULE.days[day][p]; }
      if (b <= a) errors.push(`${DAY_LONG[day - 1]} ${label} : la fin doit être après le début.`);
      return [a, b];
    };
    days[day] = { M: one('M', 'matin'), A: one('A', 'après-midi') };
  }
  const breaks: Array<[number, number]> = [];
  d.breaks.forEach(([a, b], i) => {
    const x = fromHM(a); const y = fromHM(b);
    if (x === null || y === null || y <= x) errors.push(`Pause ${i + 1} : heures invalides (la fin doit être après le début).`);
    else breaks.push([x, y]);
  });
  if (!(d.periodMin >= 15 && d.periodMin <= 240)) errors.push('La durée d’une séance doit être comprise entre 15 et 240 minutes.');
  return { cfg: errors.length ? null : { periodMin: d.periodMin, breaks, days }, errors };
}

/** Horaires des séances de TP : pour chaque jour retenu dans Calendrier, début et fin du matin et de l'après-midi, durée d'une séance et pauses */
export default function ScheduleAdmin() {
  const { settings } = useStore();
  const act = useAct();
  const saved = parseSchedule(settings.schedule);
  const [draft, setDraft] = useState<Draft>(() => toDraft(saved));
  useEffect(() => setDraft(toDraft(parseSchedule(settings.schedule))), [settings.schedule]);

  // Jours retenus dans Calendrier, tous niveaux confondus
  const shown = [...new Set(LEVELS.flatMap((l) => weekdaysFor(settings, l)))].sort();
  const { cfg, errors } = fromDraft(draft);
  const dirty = formatSchedule(cfg ?? saved) !== formatSchedule(saved) || !!errors.length;

  const setTime = (d: number, p: 'M' | 'A', i: 0 | 1, v: string) =>
    setDraft((x) => ({ ...x, days: { ...x.days, [d]: { ...x.days[d], [p]: (i === 0 ? [v, x.days[d][p][1]] : [x.days[d][p][0], v]) } } }));
  const save = (value: ScheduleConfig, ok: string) => act(() => api.upsert('settings', [{ key: 'schedule', value: formatSchedule(value) }], 'key'), { ok, tables: ['settings'] });
  const slots = (d: number, p: 'M' | 'A') => (cfg ? periodsIn(cfg, d, p) : []).map((x) => `${toHM(x.start)}`).join(' · ');

  return (
    <>
      <p className="muted">
        Réglez les horaires des séances de TP pour chaque jour retenu dans <b>Calendrier</b>. Ils servent à la vue Lundi, au générateur de demi-journée et à l’occupation des salles déduite du semainier.
      </p>
      <section className="panel stack">
        <h2>Séances et pauses</h2>
        <div className="form">
          <label className="f"><span className="lab">Durée d’une séance (minutes)</span>
            <input className="in" type="number" min={15} max={240} step={5} value={draft.periodMin} onChange={(e) => setDraft({ ...draft, periodMin: Number(e.target.value) })} /></label>
          <div className="f wide"><span className="lab">Pauses (aucune séance pendant une pause)</span>
            {draft.breaks.map(([a, b], i) => (
              <div key={i} className="row">
                <input className="in" type="time" aria-label={`Début de la pause ${i + 1}`} value={a} onChange={(e) => setDraft({ ...draft, breaks: draft.breaks.map((x, j) => (j === i ? [e.target.value, x[1]] : x)) })} />
                <span>à</span>
                <input className="in" type="time" aria-label={`Fin de la pause ${i + 1}`} value={b} onChange={(e) => setDraft({ ...draft, breaks: draft.breaks.map((x, j) => (j === i ? [x[0], e.target.value] : x)) })} />
                <button type="button" className="btn ghost sm" aria-label={`Retirer la pause ${i + 1}`} onClick={() => setDraft({ ...draft, breaks: draft.breaks.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            {draft.breaks.length < 6 && <button type="button" className="btn ghost sm" onClick={() => setDraft({ ...draft, breaks: [...draft.breaks, ['12:00', '12:15']] })}>+ Ajouter une pause</button>}
          </div>
        </div>
      </section>
      <section className="panel stack">
        <h2>Horaires par jour</h2>
        <div className="scroll">
          <table className="tbl" aria-label="Horaires par jour">
            <thead><tr><th>Jour</th><th>Matin</th><th>Séances du matin</th><th>Après-midi</th><th>Séances de l’après-midi</th></tr></thead>
            <tbody>
              {shown.map((d) => (
                <tr key={d}>
                  <th scope="row">{DAY_LONG[d - 1]}</th>
                  {(['M', 'A'] as const).flatMap((p) => [
                    <td key={p}><div className="row">
                      <input className="in" type="time" aria-label={`${DAY_LONG[d - 1]} ${p === 'M' ? 'matin' : 'après-midi'}, début`} value={draft.days[d][p][0]} onChange={(e) => setTime(d, p, 0, e.target.value)} />
                      <span>à</span>
                      <input className="in" type="time" aria-label={`${DAY_LONG[d - 1]} ${p === 'M' ? 'matin' : 'après-midi'}, fin`} value={draft.days[d][p][1]} onChange={(e) => setTime(d, p, 1, e.target.value)} />
                    </div></td>,
                    <td key={`${p}s`} className="small muted">{slots(d, p) || '—'}</td>,
                  ])}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {errors.length > 0 && <div className="alert" role="alert"><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>}
        <div className="actions">
          <button className="btn" type="button" disabled={!cfg || !dirty} onClick={() => cfg && void save(cfg, 'Horaires enregistrés.')}>Enregistrer les horaires</button>
          <button className="btn ghost" type="button" onClick={() => void save(DEFAULT_SCHEDULE, 'Trame par défaut rétablie.')}>Rétablir la trame du lycée</button>
        </div>
        <p className="muted small">Trame du lycée : séances de 55 min ; lundi 8h40-11h40, du mardi au vendredi 7h45-11h40 ; après-midi 13h10-18h ; pauses 9h35-9h50 et 15h55-16h10. Seuls les jours cochés dans Calendrier sont listés.</p>
      </section>
    </>
  );
}
