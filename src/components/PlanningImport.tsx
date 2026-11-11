import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/state/auth';
import { useAct, useStore } from '@/state/store';
import { DOMAINS, DOMAIN_PALETTE, parseCustomDomains, type CustomDomain } from '@/lib/domain';
import { cellText, parseCsv } from '@/lib/importStudents';
import { schoolYearBounds, schoolYearOf } from '@/lib/dates';
import { CONFLICT_COLS } from '@/lib/semainier';
import { buildCells, domainGuess, findUnknowns, isLabel, loose, parsePlanning, roomMatch, teacherMatch, tpMatch, type Decisions, type ParsedPlanning, type TeacherDecision, type RoomDecision, type TpDecision } from '@/lib/importPlanning';
import { downloadBlob } from '@/components/ui';
import type { Level } from '@/lib/types';

export const PLANNING_COLUMNS = ['Date', 'Groupe', 'Partie', 'TP / Code', 'Activité / Titre', 'Enseignant(s)', 'Salle', 'Domaine', 'Objectif', 'Compétences'];

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 12);

/** Feuilles d'un classeur Excel ou d'un CSV, en texte */
export async function readGrids(file: File): Promise<Array<{ name: string; grid: string[][] }>> {
  const n = file.name.toLowerCase();
  if (n.endsWith('.csv') || n.endsWith('.txt')) return [{ name: 'CSV', grid: parseCsv(await file.text()) }];
  if (n.endsWith('.xls')) throw new Error('Le format .xls n’est pas pris en charge. Enregistrez le fichier au format .xlsx ou .csv.');
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const out: Array<{ name: string; grid: string[][] }> = [];
  wb.eachSheet((ws) => {
    const grid: string[][] = [];
    ws.eachRow({ includeEmpty: true }, (row) => {
      const cells: string[] = [];
      for (let c = 1; c <= Math.max(row.cellCount, ws.columnCount); c++) cells.push(cellText(row.getCell(c).value));
      grid.push(cells);
    });
    out.push({ name: ws.name, grid });
  });
  return out;
}

export async function planningTemplate(): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Planning');
  ws.columns = PLANNING_COLUMNS.map((h) => ({ header: h, width: h === 'Objectif' || h.startsWith('Activ') ? 36 : 16 }));
  ws.addRows([
    ['2026-11-03', '2PB1.1', 'Matin', 'P1', 'Câblage avec fiches bananes', 'G. Morel / A. Verwaerde', 'A101', 'Industriel', 'Câbler un circuit simple', 'C1, C4'],
    ['2026-11-03', '2PB1.1', 'Après-midi', 'Remédiation', '', 'A. Verwaerde', '', '', '', ''],
    ['2026-11-04', '2PB1.2', 'Journée', 'P2', '', 'G. Morel', 'A102', '', '', ''],
  ]);
  ws.getRow(1).font = { bold: true };
  const ref = wb.addWorksheet('Aide');
  ref.addRows([
    ['Partie : Journée (par défaut), Matin ou Après-midi.'],
    ['Plusieurs cours le même jour pour un groupe : une ligne par cours, la même Date, Groupe et Partie.'],
    ['Plusieurs enseignants : séparez les noms par « / », « , » ou « et ».'],
    ['Les TP, domaines, enseignants et salles inconnus pourront être créés ou associés à un existant à l’import.'],
  ]);
  return new Blob([(await wb.xlsx.writeBuffer()) as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function PlanningImport() {
  const { data, settings } = useStore();
  const { isAdmin } = useAuth();
  const act = useAct();
  const [sheets, setSheets] = useState<Array<{ name: string; grid: string[][] }>>([]);
  const [sheet, setSheet] = useState(0);
  const [error, setError] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [onlyDoubt, setOnlyDoubt] = useState(false);
  const [modal, setModal] = useState(false);
  const [dec, setDec] = useState<{ tps: Record<string, TpDecision>; tpDomain: Record<string, string>; teachers: Record<string, TeacherDecision>; rooms: Record<string, RoomDecision> }>({ tps: {}, tpDomain: {}, teachers: {}, rooms: {} });

  const bounds = useMemo(() => {
    const b = schoolYearBounds(schoolYearOf(new Date()));
    return { from: settings.year_start || b.from, to: settings.year_end || b.to };
  }, [settings.year_start, settings.year_end]);
  const cat = useMemo(() => ({ tps: data.tps, profiles: data.profiles.filter((p) => p.active), rooms: data.rooms, domains: { ...DOMAINS } as Record<string, string> }), [data.tps, data.profiles, data.rooms]);
  const parsed: ParsedPlanning | null = useMemo(() => (sheets[sheet] ? parsePlanning(sheets[sheet].grid.map((r) => [...r]), bounds) : null), [sheets, sheet, bounds]);
  const unknowns = useMemo(() => (parsed ? findUnknowns(parsed.rows, cat) : null), [parsed, cat]);
  const preRows = useMemo(() => (parsed?.rows ?? []).map((row) => {
    const doubt: string[] = [];
    if (!isLabel(row.ref) && !tpMatch(row.ref, row.title, cat.tps)) doubt.push('TP inconnu');
    if (row.teachers.some((t) => !teacherMatch(t, cat.profiles))) doubt.push('enseignant sans compte');
    if (row.room && !roomMatch(row.room, cat.rooms)) doubt.push('salle inconnue');
    return { row, doubt };
  }), [parsed, cat]);
  const customDomains = parseCustomDomains(settings.custom_domains);

  const pickFile = async (f: File | undefined) => {
    setError('');
    setSheets([]);
    if (!f) return;
    try {
      const s = await readGrids(f);
      setSheets(s);
      // La feuille qui donne le plus de cours est choisie d'office (le classeur du lycée en contient plusieurs vues du même planning)
      const counts = s.map((x) => parsePlanning(x.grid.map((r) => [...r]), bounds).rows.length);
      setSheet(Math.max(0, counts.indexOf(Math.max(...counts))));
      setDec({ tps: {}, tpDomain: {}, teachers: {}, rooms: {} });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lecture impossible.');
    }
  };

  const domainChoice = (key: string, domainRef: string) => dec.tpDomain[key] ?? domainGuess(domainRef, cat.domains) ?? (isAdmin ? `new:${domainRef.replace(/\(.*?\)/g, '').replace(/\b(tp|td|cours)\b/gi, '').replace(/\s+/g, ' ').trim()}` : 'ind');

  const run = async () => {
    if (!parsed || !unknowns) return;
    const creatable = !!isAdmin;
    const decisions: Decisions = { tps: {}, teachers: {}, rooms: {}, created: {}, createdRooms: {} };
    // 1. domaines à créer (réglage « custom_domains »)
    const wanted = new Map<string, string>();
    for (const t of unknowns.tps) {
      const mode = dec.tps[t.key]?.mode ?? 'create';
      const d = domainChoice(t.key, t.domainRef);
      if (mode === 'create' && d.startsWith('new:')) wanted.set(d, d.slice(4));
    }
    const newDomains: CustomDomain[] = [];
    const idOfNew = new Map<string, string>();
    for (const [k, label] of wanted) {
      let id = `c-${slug(label) || 'domaine'}`;
      for (let n = 2; [...customDomains, ...newDomains].some((d) => d.id === id); n++) id = `c-${slug(label).slice(0, 12)}-${n}`;
      newDomains.push({ id, label: label.slice(0, 40), color: Object.keys(DOMAIN_PALETTE)[(customDomains.length + newDomains.length) % Object.keys(DOMAIN_PALETTE).length] });
      idOfNew.set(k, id);
    }
    const sorted = new Map(parsed.rows.map((r) => [`${r.day}|${r.group}|${r.part}`, 0]));
    void sorted;
    const before = data.planning_cells.map((c) => ({ ...c }));
    const doIt = async () => {
      if (newDomains.length) await api.upsert('settings', [{ key: 'custom_domains', value: JSON.stringify([...customDomains, ...newDomains]) }], 'key');
      // 2. salles
      for (const name of unknowns.rooms) {
        const d = dec.rooms[name] ?? (creatable ? { mode: 'create' as const } : { mode: 'skip' as const });
        decisions.rooms[name] = d;
        if (d.mode === 'create') { const [r] = await api.insert<{ id: string }>('rooms', { name: name.slice(0, 40), kind: 'salle' }); decisions.createdRooms[name] = r.id; }
      }
      // 3. TP
      for (const t of unknowns.tps) {
        const d = dec.tps[t.key] ?? { mode: 'create' as const };
        decisions.tps[t.key] = d;
        if (d.mode !== 'create') continue;
        const choice = domainChoice(t.key, t.domainRef);
        const domain = choice.startsWith('new:') ? idOfNew.get(choice) ?? 'ind' : choice;
        const comps = [...new Set(t.rows.flatMap((r) => r.competences))];
        const [row] = await api.insert<{ id: string }>('tps', {
          code: /^[\p{L}\d._-]{1,12}$/u.test(t.ref) && t.title !== t.ref ? t.ref : null, title: (t.title || t.ref).slice(0, 160), level: t.level as Level, domain, hours: null,
          objective: t.rows.find((r) => r.objective)?.objective.slice(0, 500) ?? null, competences: comps, system_ids: [], tool_ids: [], documents: [], reusable: false,
        });
        decisions.created[t.key] = row.id;
      }
      decisions.teachers = Object.fromEntries(unknowns.teachers.map((n) => [n, dec.teachers[n] ?? { mode: 'label' as const }]));
      // 4. cases : les TP créés viennent d'être ajoutés, la recherche se fait donc avec les identifiants connus
      const { cells } = buildCells(parsed.rows, { ...cat, tps: cat.tps }, decisions, before, overwrite);
      if (cells.length) await api.upsert('planning_cells', cells as unknown as Array<Record<string, unknown>>, CONFLICT_COLS);
      return cells;
    };
    let written: Array<{ day: string; group_code: string; part: string; seq: number }> = [];
    const ok = await act(async () => { written = await doIt(); }, {
      ok: 'Planning importé.', tables: ['planning_cells', 'tps', 'rooms', 'settings'],
      undo: async () => {
        for (const w of written) {
          const prev = before.find((c) => c.day === w.day && c.group_code === w.group_code && (c.part ?? 'J') === w.part && (c.seq ?? 1) === w.seq);
          if (prev) await api.upsert('planning_cells', [{ day: prev.day, group_code: prev.group_code, part: prev.part ?? 'J', seq: prev.seq ?? 1, room_id: prev.room_id ?? null, tp_id: prev.tp_id, label: prev.label, note: prev.note, teacher_ids: prev.teacher_ids ?? [], teacher_labels: prev.teacher_labels ?? [] }], CONFLICT_COLS);
          else await api.remove('planning_cells', { day: w.day, group_code: w.group_code, part: w.part, seq: w.seq });
        }
      },
    });
    if (ok) { setModal(false); setSheets([]); }
  };

  const needsModal = !!unknowns && (unknowns.tps.length || unknowns.teachers.length || unknowns.rooms.length);
  const preview = parsed && unknowns ? buildCells(parsed.rows, cat, { tps: {}, teachers: {}, rooms: {}, created: {}, createdRooms: {} }, data.planning_cells, overwrite) : null;

  return (
    <details className="add no-print">
      <summary>Importer un planning depuis Excel</summary>
      <div className="add-body stack">
        <p className="muted small">Deux formats : un <b>emploi du temps par groupe</b> (blocs Domaine / Enseignant / TP / Objectif / Compétences sous des jours datés) ou un <b>tableau</b> d’une ligne par cours (colonnes : {PLANNING_COLUMNS.join(' · ')}). Les TP, domaines, enseignants et salles inconnus pourront être créés ou associés à un existant avant l’import.</p>
        <div className="row">
          <input type="file" aria-label="Fichier de planning" accept=".xlsx,.xlsm,.csv,.txt" onChange={(e) => void pickFile(e.target.files?.[0])} />
          <button type="button" className="btn ghost sm" onClick={async () => downloadBlob('modele-planning.xlsx', await planningTemplate())}>Télécharger le modèle</button>
        </div>
        {error && <p className="alert" role="alert">{error}</p>}
        {sheets.length > 1 && (
          <label className="row">Feuille <select className="in" aria-label="Feuille à importer" value={sheet} onChange={(e) => setSheet(Number(e.target.value))}>{sheets.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}</select></label>
        )}
        {parsed && (
          <>
            <p><b>{parsed.rows.length}</b> cours lus ({parsed.layout === 'edt' ? 'emploi du temps par groupe' : 'tableau'})
              {unknowns && unknowns.tps.length > 0 && <> · <b>{unknowns.tps.length}</b> TP/activité(s) inconnu(s)</>}
              {unknowns && unknowns.teachers.length > 0 && <> · <b>{unknowns.teachers.length}</b> enseignant(s) sans compte</>}
              {unknowns && unknowns.rooms.length > 0 && <> · <b>{unknowns.rooms.length}</b> salle(s) inconnue(s)</>}.</p>
            {parsed.problems.length > 0 && <div className="alert" role="status"><b>À vérifier</b><ul>{parsed.problems.slice(0, 8).map((m) => <li key={m}>{m}</li>)}</ul></div>}
            {parsed.rows.length > 0 && (
              <details className="preview" open>
                <summary>Aperçu des cours lus</summary>
                <label className="row small"><input type="checkbox" checked={onlyDoubt} onChange={(e) => setOnlyDoubt(e.target.checked)} /> Seulement les lignes à vérifier ({preRows.filter((r) => r.doubt.length).length})</label>
                <div className="scroll" style={{ maxHeight: 320, overflow: 'auto' }}>
                  <table className="tbl small">
                    <thead><tr><th>Date</th><th>Groupe</th><th>TP / activité</th><th>Enseignants</th><th>Salle</th><th>À vérifier</th></tr></thead>
                    <tbody>
                      {preRows.filter((r) => !onlyDoubt || r.doubt.length).slice(0, 300).map((r, i) => (
                        <tr key={i} className={r.doubt.length ? 'warn' : ''}>
                          <td>{r.row.day}</td><td>{r.row.group}</td>
                          <td>{r.row.ref}{r.row.title && r.row.title !== r.row.ref ? ` — ${r.row.title}` : ''}</td>
                          <td>{r.row.teachers.join(' / ') || '—'}</td><td>{r.row.room || '—'}</td>
                          <td>{r.doubt.join(', ') || '✓'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preRows.length > 300 && <p className="muted small">Les 300 premières lignes sont affichées ; toutes seront importées.</p>}
              </details>
            )}
            <label className="row"><input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} /> Remplacer les cases déjà remplies</label>
            {preview && <p className="muted small">{preview.cells.length} case(s) à écrire sur les TP connus{preview.skipped ? `, ${preview.skipped} ignorée(s) (déjà remplies ou à décider)` : ''}.</p>}
            <div className="actions">
              <button type="button" className="btn sm" disabled={!parsed.rows.length} onClick={() => (needsModal ? setModal(true) : void run())}>
                {needsModal ? 'Continuer…' : `Importer ${parsed.rows.length} cours`}
              </button>
            </div>
          </>
        )}
      </div>
      {modal && unknowns && (
        <div className="modal-back no-print" role="dialog" aria-modal="true" aria-label="Éléments inconnus">
          <div className="modal stack" style={{ maxWidth: 760, maxHeight: '85vh', overflow: 'auto' }}>
            <h2>Éléments absents de l’application</h2>
            <p className="muted small">Pour chacun, créez-le ou associez-le à un élément existant. {isAdmin ? '' : 'La création de domaines et de salles est réservée aux gestionnaires.'}</p>
            {unknowns.tps.length > 0 && (
              <section className="stack"><h3>TP et activités</h3>
                {unknowns.tps.map((t) => {
                  const d = dec.tps[t.key] ?? { mode: 'create' as const };
                  const val = d.mode === 'existing' ? `ex:${d.id}` : d.mode;
                  const newLabel = t.domainRef.replace(/\(.*?\)/g, '').replace(/\b(tp|td|cours)\b/gi, '').replace(/\s+/g, ' ').trim();
                  return (
                    <div key={t.key} className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                      <b style={{ minWidth: 160 }}>{t.ref}{t.title && t.title !== t.ref ? ` — ${t.title}` : ''}</b>
                      <span className="muted small">{t.rows.length} séance{t.rows.length > 1 ? 's' : ''}</span>
                      <select className="in" aria-label={`Action pour ${t.ref}`} value={val} onChange={(e) => {
                        const v = e.target.value;
                        setDec((s) => ({ ...s, tps: { ...s.tps, [t.key]: v.startsWith('ex:') ? { mode: 'existing', id: v.slice(3) } : ({ mode: v } as TpDecision) } }));
                      }}>
                        <option value="create">Créer ce TP</option>
                        <option value="label">Garder comme activité (texte libre)</option>
                        <option value="skip">Ignorer</option>
                        <optgroup label="Associer à un TP existant">{data.tps.map((x) => <option key={x.id} value={`ex:${x.id}`}>{x.code ? `${x.code} · ` : ''}{x.title}</option>)}</optgroup>
                      </select>
                      {d.mode === 'create' && (
                        <select className="in" aria-label={`Domaine de ${t.ref}`} value={domainChoice(t.key, t.domainRef)} onChange={(e) => setDec((s) => ({ ...s, tpDomain: { ...s.tpDomain, [t.key]: e.target.value } }))}>
                          {isAdmin && newLabel && !domainGuess(newLabel, cat.domains) && <option value={`new:${newLabel}`}>Créer le domaine « {newLabel} »</option>}
                          {Object.entries(DOMAINS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                      )}
                    </div>
                  );
                })}
              </section>
            )}
            {unknowns.teachers.length > 0 && (
              <section className="stack"><h3>Enseignants</h3>
                {unknowns.teachers.map((n) => {
                  const d = dec.teachers[n] ?? { mode: 'label' as const };
                  return (
                    <div key={n} className="row" style={{ gap: 8 }}>
                      <b style={{ minWidth: 160 }}>{n}</b>
                      <select className="in" aria-label={`Enseignant ${n}`} value={d.mode === 'account' ? `ac:${d.id}` : d.mode} onChange={(e) => {
                        const v = e.target.value;
                        setDec((s) => ({ ...s, teachers: { ...s.teachers, [n]: v.startsWith('ac:') ? { mode: 'account', id: v.slice(3) } : ({ mode: v } as TeacherDecision) } }));
                      }}>
                        <option value="label">Garder le nom tel quel</option>
                        <option value="skip">Ne pas l’associer</option>
                        <optgroup label="Associer à un compte">{cat.profiles.map((p) => <option key={p.id} value={`ac:${p.id}`}>{p.full_name || p.email}</option>)}</optgroup>
                      </select>
                    </div>
                  );
                })}
              </section>
            )}
            {unknowns.rooms.length > 0 && (
              <section className="stack"><h3>Salles</h3>
                {unknowns.rooms.map((n) => {
                  const d = dec.rooms[n] ?? (isAdmin ? { mode: 'create' as const } : { mode: 'skip' as const });
                  return (
                    <div key={n} className="row" style={{ gap: 8 }}>
                      <b style={{ minWidth: 160 }}>{n}</b>
                      <select className="in" aria-label={`Salle ${n}`} value={d.mode === 'existing' ? `ex:${d.id}` : d.mode} onChange={(e) => {
                        const v = e.target.value;
                        setDec((s) => ({ ...s, rooms: { ...s.rooms, [n]: v.startsWith('ex:') ? { mode: 'existing', id: v.slice(3) } : ({ mode: v } as RoomDecision) } }));
                      }}>
                        {isAdmin && <option value="create">Créer la salle</option>}
                        <option value="skip">Ne pas renseigner la salle</option>
                        <optgroup label="Associer à une salle">{data.rooms.map((r) => <option key={r.id} value={`ex:${r.id}`}>{r.name}</option>)}</optgroup>
                      </select>
                    </div>
                  );
                })}
              </section>
            )}
            <div className="actions">
              <button type="button" className="btn" onClick={() => void run()}>Importer</button>
              <button type="button" className="btn ghost" onClick={() => setModal(false)}>Annuler</button>
            </div>
            <p className="muted small">Les TP, domaines et salles créés restent en place si vous annulez l’import ensuite ; seules les cases du semainier reviennent en arrière.</p>
          </div>
        </div>
      )}
    </details>
  );
}
void loose;
