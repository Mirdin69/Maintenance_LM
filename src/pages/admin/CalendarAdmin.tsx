import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAct, useStore } from '@/state/store';
import { PERIOD_KINDS, byText } from '@/lib/domain';
import { DAY_LONG, fmtDate, schoolYearOf } from '@/lib/dates';
import { LEVELS } from '@/lib/domain';
import { daysKey, formatPartsByDay, frenchHolidays, partsFor, weekdaysFor } from '@/lib/calendar';
import type { CalendarPeriod, Part } from '@/lib/types';
import { NewYear, ZoneAImport } from './NewYear';
import { AddPanel, Chip, ConfirmButton, Empty, Field, Options } from '@/components/ui';

export default function CalendarAdmin() {
  const { data, settings } = useStore();
  const act = useAct();
  const [formKey, setFormKey] = useState(0);
  const start = settings.year_start || '';
  const end = settings.year_end || '';
  const periods = [...data.calendar_periods].sort(byText((p) => p.start_date));

  const setSetting = (key: string, value: string) =>
    act(() => api.upsert('settings', [{ key, value }], 'key'), { ok: 'Enregistré.', tables: ['settings'] });

  const toggleDay = (level: string, d: number) => {
    const shown = weekdaysFor(settings, level);
    const next = shown.includes(d) ? shown.filter((x) => x !== d) : [...shown, d].sort();
    if (!next.length) return;
    void setSetting(daysKey(level), formatPartsByDay(next, partsFor(settings, level)));
  };
  /** Journée entière, matin, après-midi ou les deux (matin et après-midi séparés) pour un jour retenu */
  const setParts = (level: string, d: number, value: string) => {
    const parts = { ...partsFor(settings, level), [d]: (value === 'J' ? ['J'] : value.split('')) as Part[] };
    void setSetting(daysKey(level), formatPartsByDay(weekdaysFor(settings, level), parts));
  };

  const add = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const from = String(f.get('start'));
    const to = String(f.get('end')) || from;
    if (to < from) return void act(() => Promise.reject(new Error('La date de fin est avant le début.')));
    if (await act(() => api.insert('calendar_periods', { kind: f.get('kind'), label: String(f.get('label')).trim(), start_date: from, end_date: to }), { ok: 'Période ajoutée.', tables: ['calendar_periods'] })) setFormKey((k) => k + 1);
  };

  const addHolidays = async () => {
    const y = start ? Number(start.slice(0, 4)) : schoolYearOf(new Date());
    const known = new Set(data.calendar_periods.filter((p) => p.kind === 'ferie').map((p) => p.start_date));
    const rows = frenchHolidays(y).filter((h) => !known.has(h.date)).map((h) => ({ kind: 'ferie', label: h.label, start_date: h.date, end_date: h.date }));
    if (!rows.length) return void act(() => Promise.resolve(), { ok: 'Les jours fériés sont déjà tous présents.' });
    await act(() => api.insert('calendar_periods', rows), { ok: `${rows.length} jours fériés ajoutés.`, tables: ['calendar_periods'] });
  };

  return (
    <>
      <p className="muted">Réglages communs du semainier : année scolaire, jours affichés, vacances et jours fériés (ces jours apparaissent grisés dans le semainier).</p>
      <section className="panel">
        <h2>Année scolaire</h2>
        <div className="tools">
          <Field label="Rentrée"><input className="in" type="date" defaultValue={start} key={`s${start}`} onBlur={(e) => e.target.value && e.target.value !== start && void setSetting('year_start', e.target.value)} /></Field>
          <Field label="Fin d’année"><input className="in" type="date" defaultValue={end} key={`e${end}`} onBlur={(e) => e.target.value && e.target.value !== end && void setSetting('year_end', e.target.value)} /></Field>
          {LEVELS.map((l) => (
            <div key={l} className="f">
              <span className="lab">Jours affichés, {l}</span>
              <div className="picks" role="group" aria-label={`Jours affichés ${l}`}>{DAY_LONG.slice(0, 5).map((d, i) => (
                <span key={d} className="pick">
                  <label><input type="checkbox" checked={weekdaysFor(settings, l).includes(i + 1)} onChange={() => toggleDay(l, i + 1)} /> {d}</label>
                  {weekdaysFor(settings, l).includes(i + 1) && (
                    <select className="in" aria-label={`Partie de la journée, ${d} ${l}`} value={(partsFor(settings, l)[i + 1] ?? ['J']).join('')} onChange={(e) => setParts(l, i + 1, e.target.value)}>
                      <option value="J">Journée</option><option value="M">Matin</option><option value="A">Après-midi</option><option value="MA">Matin et après-midi</option>
                    </select>
                  )}
                </span>
              ))}</div>
            </div>
          ))}
        </div>
      </section>
      <section className="panel stack">
        <h2>Vacances officielles</h2>
        <p className="muted">Récupère automatiquement les vacances scolaires de la zone A (Lyon) publiées par le ministère. Les jours fériés se complètent avec le bouton plus bas.</p>
        <ZoneAImport year={start ? Number(start.slice(0, 4)) : schoolYearOf(new Date())} />
      </section>
      <AddPanel summary="Ajouter des vacances, un jour férié ou une période">
        <form className="form" key={formKey} onSubmit={add}>
          <Field label="Type"><select className="in" name="kind"><Options items={Object.entries(PERIOD_KINDS)} /></select></Field>
          <Field label="Nom *"><input className="in" name="label" required maxLength={60} placeholder="Vacances de la Toussaint" /></Field>
          <Field label="Premier jour *"><input className="in" type="date" name="start" required /></Field>
          <Field label="Dernier jour (vide = un seul jour)"><input className="in" type="date" name="end" /></Field>
          <div className="actions"><button className="btn" type="submit">Ajouter</button></div>
        </form>
      </AddPanel>
      <section className="panel">
        <div className="row between">
          <h2>Vacances et jours fériés ({periods.length})</h2>
          <button className="btn ghost sm" onClick={() => void addHolidays()}>Ajouter les jours fériés de l’année</button>
        </div>
        {periods.length === 0 ? <Empty>Aucune période. Ajoutez les vacances de votre académie.</Empty> : (
          <div className="scroll"><table className="tbl">
            <thead><tr><th>Type</th><th>Nom</th><th>Du</th><th>Au</th><th /></tr></thead>
            <tbody>{periods.map((p: CalendarPeriod) => (
              <tr key={p.id}>
                <td><Chip tone={p.kind === 'ferie' ? 'info' : p.kind === 'vacances' ? 'warn' : 'idle'}>{PERIOD_KINDS[p.kind]}</Chip></td>
                <td>{p.label}</td><td>{fmtDate(p.start_date)}</td><td>{fmtDate(p.end_date)}</td>
                <td><ConfirmButton onConfirm={() => void act(() => api.remove('calendar_periods', { id: p.id }), { ok: 'Période supprimée.', tables: ['calendar_periods'] })}>Supprimer</ConfirmButton></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </section>
      <NewYear />
    </>
  );
}
