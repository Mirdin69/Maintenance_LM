import { capacity, teamsOf, type RotationProposal } from './rotation';
import { fmtShort } from './dates';

export const TEAM_LABEL: Record<number, string> = { 1: 'individuel', 2: 'binôme', 3: 'trinôme', 4: 'quadrinôme' };

/** Classeur Excel : rotation (sous-groupes × séances), équipes par séance et poste, effectifs. Google Sheets l'ouvre tel quel. */
export async function rotationWorkbook(plan: RotationProposal, dates: string[], title: string): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const name = (g: number, r: number) => (plan.rounds[r][g] < 0 ? 'Attente' : plan.stations[plan.rounds[r][g]].name);

  const ws = wb.addWorksheet('Rotation');
  ws.addRow([title]).font = { bold: true, size: 13 };
  ws.addRow([]);
  ws.addRow(['Sous-groupe', 'Élèves', ...dates.map((d, r) => `Séance ${r + 1} (${fmtShort(d)})`)]).font = { bold: true };
  plan.groups.forEach((g, i) => ws.addRow([`Groupe ${i + 1}`, g.length, ...plan.rounds.map((_, r) => name(i, r))]));
  ws.columns.forEach((c, i) => { c.width = i === 0 ? 14 : i === 1 ? 9 : 26; });

  const eq = wb.addWorksheet('Équipes');
  eq.addRow(['Séance', 'Date', 'TP', 'Sous-groupe', 'Poste', 'Équipe', 'Élèves']).font = { bold: true };
  plan.rounds.forEach((row, r) => {
    plan.stations.forEach((st, j) => {
      const g = row.indexOf(j);
      if (g < 0) return;
      teamsOf(plan.groups[g], st.team).forEach((t, k) => eq.addRow([r + 1, dates[r], st.name, `Groupe ${g + 1}`, k + 1, t.length > 1 ? `${TEAM_LABEL[t.length] ?? 'équipe'} ${k + 1}` : `Élève ${k + 1}`, t.join(' + ')]));
    });
  });
  eq.columns.forEach((c, i) => { c.width = [8, 12, 34, 12, 7, 16, 40][i]; });

  const ef = wb.addWorksheet('Effectifs');
  ef.addRow(['TP', 'Postes', 'Élèves par poste', 'Capacité (élèves)']).font = { bold: true };
  plan.stations.forEach((s) => ef.addRow([s.name, s.postes, s.team, capacity(s)]));
  ef.addRow([]);
  ef.addRow(['Sous-groupe', 'Élèves']).font = { bold: true };
  plan.groups.forEach((g, i) => ef.addRow([`Groupe ${i + 1}`, g.join(', ')]));
  ef.columns.forEach((c, i) => { c.width = [34, 40, 16, 18][i] ?? 12; });

  return new Blob([(await wb.xlsx.writeBuffer()) as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
