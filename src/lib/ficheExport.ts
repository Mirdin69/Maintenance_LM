import { CC_LABELS, COMPETENCES, DOMAINS, ccToC } from './domain';
import { LEVEL_NOTE, ccPair, fmtMinutes, lines, totalMinutes, type SeanceData, type SequenceData } from './fiche';

/**
 * Export des fiches en Word et en PDF. Les deux formats partent du même modèle intermédiaire, construit par
 * `sequenceModel` / `seanceModel`, qui suit le plan des documents de l'équipe (charte La Mache : Arial, marine / orange).
 */
export type Block =
  | { t: 'title'; text: string }
  | { t: 'head'; cells: [string, string, string] }
  | { t: 'banner'; text: string; tone: 'cream' | 'orange'; more?: string }
  | { t: 'bar'; text: string }
  | { t: 'sub'; text: string }
  | { t: 'kv'; rows: Array<[string, string]> }
  | { t: 'table'; head: string[]; rows: string[][]; zebra?: boolean; widths?: number[]; foot?: string[] }
  | { t: 'text'; text: string; italic?: boolean }
  | { t: 'bullets'; items: string[] }
  | { t: 'callout'; tone: 'danger' | 'ok'; text: string };

export interface FicheModel { orientation: 'portrait' | 'landscape'; title: string; blocks: Block[] }

const COLORS = { navy: '1F3864', orange: 'C55A11', cream: 'FFF2CC', zebra: 'F2F2F2', line: 'BFBFBF', red: 'C00000', redBg: 'FDECEC', green: '548235', greenBg: 'EAF3E2' };

const filled = (rows: Array<[string, string]>) => rows.filter(([, v]) => v.trim());

export function sequenceModel(title: string, level: string, d: SequenceData): FicheModel {
  const blocks: Block[] = [{ t: 'title', text: 'FICHE DE SÉQUENCE' }];
  blocks.push({ t: 'bar', text: 'Identité de la séquence' });
  blocks.push({ t: 'kv', rows: filled([['Intitulé', title], ['Domaine', d.domaine], ['Niveau', level], ['Organisation', d.organisation], ['Prérequis', d.prerequis], ['Modalité', d.modalite], ['Objectif général', d.objectif]]) });
  const comp = d.cc.map((x) => [x, CC_LABELS[x] ?? '', ccToC(x) ?? '', ccToC(x) ? COMPETENCES[ccToC(x)!] : ''])
    .concat(d.competences.filter((c) => !d.cc.some((x) => ccToC(x) === c)).map((c) => ['', '', c, COMPETENCES[c] ?? '']));
  if (comp.length) {
    blocks.push({ t: 'bar', text: 'Compétences couvertes' });
    blocks.push({ t: 'table', head: ['Vademecum', 'Compétence détaillée (vademecum Seconde)', 'MELEC', 'Compétence du référentiel MELEC'], rows: comp, widths: [1, 5, 1, 4] });
  }
  if (d.parties.length) {
    const total = totalMinutes(d.parties.map((p) => p.duree));
    blocks.push({ t: 'bar', text: 'Récapitulatif du TP' });
    blocks.push({
      t: 'table', head: ['Partie', 'Intitulé / support', 'Nature', 'Durée', 'Supports', 'Compétences'], widths: [1, 6, 1.5, 1.2, 4, 2.3],
      rows: d.parties.map((p) => [p.partie, p.intitule, p.nature, p.duree, p.supports, p.competences]),
      foot: total !== null ? ['Total', '', '', fmtMinutes(total), '', ''] : undefined,
    });
  }
  const principe = filled(d.principe.map((p): [string, string] => [p.titre, p.texte]));
  if (principe.length) { blocks.push({ t: 'bar', text: 'Principe d’organisation' }); blocks.push({ t: 'kv', rows: principe }); }
  if (lines(d.coherence).length) { blocks.push({ t: 'bar', text: 'Cohérence pédagogique et fil rouge' }); blocks.push({ t: 'bullets', items: lines(d.coherence) }); }
  if (d.evaluation.length || d.autoeval.trim()) {
    blocks.push({ t: 'bar', text: 'Évaluation' });
    blocks.push({ t: 'text', text: LEVEL_NOTE, italic: true });
    if (d.evaluation.length) blocks.push({ t: 'table', head: ['CC / C', 'Indicateur observé', 'NA', 'ECA', 'PA', 'A'], widths: [1.3, 3, 2.6, 2.6, 2.6, 2.6], rows: d.evaluation.map((r) => [ccPair(r.cc), r.indicateur, r.na, r.eca, r.pa, r.a]) });
    if (d.autoeval.trim()) blocks.push({ t: 'text', text: d.autoeval });
  }
  return { orientation: 'landscape', title: `Fiche de séquence — ${title}`, blocks };
}

export function seanceModel(title: string, level: string, d: SeanceData, sequenceTitle = ''): FicheModel {
  const blocks: Block[] = [{ t: 'title', text: 'FICHE DE SÉANCE' }];
  blocks.push({ t: 'head', cells: [`Discipline : ${d.discipline}\nLycée La Mache`, d.numero ? `Thème ${d.numero}` : 'Séance', `Année ${d.annee}`] });
  const dom = d.domaine ? DOMAINS[d.domaine as keyof typeof DOMAINS] ?? d.domaine : '';
  blocks.push({ t: 'banner', tone: 'cream', text: `Séquence : ${sequenceTitle || '—'}${level ? ` — ${level}` : ''}${dom ? ` — ${dom}` : ''}` });
  blocks.push({ t: 'banner', tone: 'orange', text: `TP : ${title}`, more: d.objectif.trim() ? `Objectif : ${d.objectif}` : undefined });
  blocks.push({ t: 'bar', text: 'Activité en lien avec le référentiel MELEC' });
  const comps = d.cc.map((x) => `${x} — ${CC_LABELS[x] ?? ''}${ccToC(x) ? `\n→ Référentiel MELEC : ${ccToC(x)} — ${COMPETENCES[ccToC(x)!]}` : ''}`)
    .concat(d.competences.filter((c) => !d.cc.some((x) => ccToC(x) === c)).map((c) => `${c} — ${COMPETENCES[c] ?? ''}`));
  blocks.push({ t: 'kv', rows: filled([
    ['Contexte (fil rouge)', d.contexte], ['Compétences travaillées', comps.join('\n')], ['Position dans l’année', d.repere],
    ['Prérequis', lines(d.prerequis).map((x) => `• ${x}`).join('\n')], ['Organisation', d.organisation],
  ]) });
  blocks.push({ t: 'bar', text: 'Fiche de déroulement' });
  if (d.duree.trim()) blocks.push({ t: 'text', text: d.duree });
  for (const b of d.blocs.filter((x) => x.titre.trim() || x.lignes.length)) {
    if (b.titre.trim()) blocks.push({ t: 'sub', text: b.titre });
    const total = totalMinutes(b.lignes.map((l) => l.duree));
    blocks.push({
      t: 'table', zebra: true, head: ['Activité', 'Durée', 'Professeur', 'Élève', 'Outils et supports'], widths: [2.6, 1.2, 3.8, 3.8, 2.5],
      rows: b.lignes.map((l) => [l.activite, l.duree, l.professeur, l.eleve, l.outils]),
      foot: total !== null ? ['Total', fmtMinutes(total), '', '', ''] : undefined,
    });
  }
  const warns = d.vigilance.filter((w) => w.texte.trim());
  const diff = filled([['Guidé', d.guide], ['Autonome', d.autonome], ['Expert', d.expert]]);
  if (d.situation.trim() || lines(d.deroulement).length || warns.length || diff.length || d.annexe.trim()) blocks.push({ t: 'bar', text: 'Scénario' });
  if (d.situation.trim()) { blocks.push({ t: 'sub', text: 'Mise en situation' }); blocks.push({ t: 'text', text: d.situation }); }
  if (lines(d.deroulement).length) { blocks.push({ t: 'sub', text: 'Déroulement' }); blocks.push({ t: 'bullets', items: lines(d.deroulement) }); }
  if (warns.length) { blocks.push({ t: 'sub', text: 'Points de vigilance' }); for (const w of warns) blocks.push({ t: 'callout', tone: w.type, text: w.texte }); }
  if (diff.length) { blocks.push({ t: 'sub', text: 'Différenciation' }); blocks.push({ t: 'kv', rows: diff }); }
  if (d.annexe.trim()) blocks.push({ t: 'text', text: `Annexe – ${d.annexe}` });
  return { orientation: 'portrait', title: `Fiche de séance — ${title}`, blocks };
}

/** Nom de fichier sûr, sans accents ni caractères spéciaux */
export const fileName = (title: string, ext: string) => `${title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'fiche'}.${ext}`;

const A4 = { w: 11906, h: 16838, margin: 850 };

/** Fiche au format Word (.docx), Arial, A4, séquence en paysage et séance en portrait comme les documents de l'équipe */
export async function toDocx(m: FicheModel): Promise<Blob> {
  const { AlignmentType, BorderStyle, Document, Footer, Header, Packer, PageNumber, PageOrientation, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } = await import('docx');
  const landscape = m.orientation === 'landscape';
  const width = (landscape ? A4.h : A4.w) - 2 * A4.margin;
  const font = 'Arial';
  const border = { style: BorderStyle.SINGLE, size: 4, color: COLORS.line };
  const borders = { top: border, bottom: border, left: border, right: border };
  const runs = (text: string, o: { bold?: boolean; italics?: boolean; color?: string; size?: number } = {}) =>
    text.split('\n').map((line, i) => new TextRun({ text: line, break: i ? 1 : 0, font, size: o.size ?? 19, bold: o.bold, italics: o.italics, color: o.color }));
  const para = (text: string, o: { bold?: boolean; italics?: boolean; color?: string; size?: number; after?: number; before?: number; center?: boolean; keepNext?: boolean } = {}) =>
    new Paragraph({ children: runs(text, o), keepNext: o.keepNext, spacing: { before: o.before ?? 0, after: o.after ?? 60 }, alignment: o.center ? AlignmentType.CENTER : undefined });
  const cell = (text: string, w: number, o: { fill?: string; bold?: boolean; color?: string; span?: number; size?: number } = {}) =>
    new TableCell({ width: { size: w, type: WidthType.DXA }, columnSpan: o.span, borders, margins: { top: 50, bottom: 50, left: 90, right: 90 },
      shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: 'auto' } : undefined, children: [para(text, { bold: o.bold, color: o.color, size: o.size, after: 0 })] });
  const grid = (ws: number[]) => { const s = ws.reduce((a, b) => a + b, 0); const out = ws.map((x) => Math.floor((x / s) * width)); out[out.length - 1] += width - out.reduce((a, b) => a + b, 0); return out; };
  const box = (rows: InstanceType<typeof TableRow>[], cols: number[]) => new Table({ width: { size: width, type: WidthType.DXA }, columnWidths: cols, rows });
  const spacer = (keepNext = false) => new Paragraph({ children: [], keepNext, run: { size: 8 }, spacing: { after: 60 } });
  const oneCell = (text: string, o: { fill: string; color?: string; bold?: boolean; more?: string; borderColor?: string; keepNext?: boolean }) =>
    new Table({ width: { size: width, type: WidthType.DXA }, columnWidths: [width], rows: [new TableRow({ children: [new TableCell({
      width: { size: width, type: WidthType.DXA }, margins: { top: 70, bottom: 70, left: 120, right: 120 }, borders: o.borderColor ? { ...borders, left: { style: BorderStyle.SINGLE, size: 24, color: o.borderColor } } : borders,
      shading: { type: ShadingType.CLEAR, fill: o.fill, color: 'auto' },
      children: [para(text, { bold: o.bold, color: o.color, after: o.more ? 40 : 0, keepNext: o.keepNext }), ...(o.more ? [para(o.more, { color: o.color, after: 0 })] : [])],
    })] })] });

  const children: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = [];
  for (const b of m.blocks) {
    if (b.t === 'title') children.push(para(b.text, { bold: true, size: 32, color: COLORS.navy, center: true, after: 160 }));
    else if (b.t === 'head') {
      const w = grid([1, 1, 1]);
      children.push(box([new TableRow({ children: b.cells.map((c, i) => cell(c, w[i], { bold: i === 1 })) })], w), spacer());
    } else if (b.t === 'banner') children.push(oneCell(b.text, b.tone === 'cream' ? { fill: COLORS.cream, bold: true } : { fill: COLORS.orange, color: 'FFFFFF', bold: true, more: b.more }), spacer());
    else if (b.t === 'bar') children.push(spacer(), oneCell(b.text, { fill: COLORS.navy, color: 'FFFFFF', bold: true, keepNext: true }), spacer(true));
    else if (b.t === 'sub') children.push(para(b.text, { bold: true, color: COLORS.navy, size: 21, before: 100, after: 60, keepNext: true }));
    else if (b.t === 'kv') {
      const w = grid([1, 4]);
      children.push(box(b.rows.map(([k, v]) => new TableRow({ children: [cell(k, w[0], { bold: true, fill: 'E8EDF5' }), cell(v, w[1])] })), w), spacer());
    } else if (b.t === 'table') {
      const w = grid(b.widths ?? b.head.map(() => 1));
      const head = new TableRow({ tableHeader: true, children: b.head.map((h, i) => cell(h, w[i], { fill: COLORS.navy, color: 'FFFFFF', bold: true })) });
      const body = b.rows.map((r, ri) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, w[i], { fill: b.zebra && ri % 2 ? COLORS.zebra : undefined, bold: i === 0 && b.zebra })) }));
      const foot = b.foot ? [new TableRow({ children: b.foot.map((c, i) => cell(c, w[i], { bold: true, fill: COLORS.zebra })) })] : [];
      children.push(box([head, ...body, ...foot], w), spacer());
    } else if (b.t === 'text') children.push(para(b.text, { italics: b.italic, size: b.italic ? 17 : 19, after: 100 }));
    else if (b.t === 'bullets') for (const it of b.items) children.push(new Paragraph({ children: runs(it), bullet: { level: 0 }, spacing: { after: 40 } }));
    else if (b.t === 'callout') children.push(oneCell(`${b.tone === 'danger' ? '⚠' : '✔'} ${b.text}`, b.tone === 'danger' ? { fill: COLORS.redBg, color: '5C0000', borderColor: COLORS.red } : { fill: COLORS.greenBg, color: '1E3A0E', borderColor: COLORS.green }), spacer());
  }

  const doc = new Document({
    creator: 'Parc MELEC', title: m.title,
    styles: { default: { document: { run: { font, size: 19 } } } },
    sections: [{
      properties: { page: { size: { width: A4.w, height: A4.h, orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT }, margin: { top: A4.margin, bottom: A4.margin, left: A4.margin, right: A4.margin } } },
      headers: { default: new Header({ children: [new Paragraph({ children: runs('Lycée La Mache · Bac Pro MELEC', { color: '595959', size: 16 }), border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLORS.navy, space: 2 } } })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Page ', font, size: 16, color: '595959' }), new TextRun({ children: [PageNumber.CURRENT], font, size: 16, color: '595959' }), new TextRun({ text: ' / ', font, size: 16, color: '595959' }), new TextRun({ children: [PageNumber.TOTAL_PAGES], font, size: 16, color: '595959' })] })] }) },
      children,
    }],
  });
  return Packer.toBlob(doc);
}

/** jsPDF n'embarque que les polices standard : on remplace les symboles qu'elles n'ont pas */
export const pdfText = (s: string) => s.replace(/→|↳/g, '->').replace(/Ω/g, 'ohm').replace(/[⚠✔]/g, '').replace(/[^\u0000-ÿ’‘“”–—…€•]/g, '').replace(/ | /g, ' ');

/** Fiche au format PDF (A4) */
export async function toPdf(m: FicheModel): Promise<Blob> {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = (autoTableMod as unknown as { default: (d: unknown, o: Record<string, unknown>) => void }).default;
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: m.orientation });
  const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight();
  const mx = 42; const top = 50; const bottom = 44; const cw = W - 2 * mx;
  const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  let y = top;
  const ensure = (h: number) => { if (y + h > H - bottom) { doc.addPage(); y = top; } };
  const last = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const base = { theme: 'grid', margin: { left: mx, right: mx, top, bottom }, styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 4, lineColor: rgb(COLORS.line), lineWidth: 0.5, textColor: [0, 0, 0], overflow: 'linebreak' } };
  const total = (w: number[] | undefined, n: number) => { const ws = w ?? Array.from({ length: n }, () => 1); const s = ws.reduce((a, b) => a + b, 0); return ws.map((x) => (x / s) * cw); };
  const colStyles = (ws: number[]) => Object.fromEntries(ws.map((x, i) => [i, { cellWidth: x }]));
  const band = (text: string, fill: string, color = 'FFFFFF', more?: string, left?: string) => {
    ensure(30);
    autoTable(doc, { ...base, startY: y, body: [[{ content: pdfText(more ? `${text}\n${more}` : text), styles: { fillColor: rgb(fill), textColor: rgb(color), fontStyle: 'bold', fontSize: 9.5, cellPadding: 6, lineWidth: left ? { left: 3, top: 0.5, right: 0.5, bottom: 0.5 } : 0.5, lineColor: left ? rgb(left) : rgb(fill) } }]] });
    y = last() + 6;
  };
  const para = (text: string, o: { italic?: boolean; bold?: boolean; color?: string; size?: number; indent?: number } = {}) => {
    doc.setFont('helvetica', o.bold ? 'bold' : o.italic ? 'italic' : 'normal'); doc.setFontSize(o.size ?? 9.5); doc.setTextColor(...rgb(o.color ?? '000000'));
    const ls = doc.splitTextToSize(pdfText(text), cw - (o.indent ?? 0)) as string[];
    for (const l of ls) { ensure(13); doc.text(l, mx + (o.indent ?? 0), y + 9); y += 13; }
    y += 3;
  };

  for (const b of m.blocks) {
    if (b.t === 'title') { doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(...rgb(COLORS.navy)); doc.text(pdfText(b.text), W / 2, y + 14, { align: 'center' }); y += 30; }
    else if (b.t === 'head') {
      autoTable(doc, { ...base, startY: y, body: [b.cells.map((c, i) => ({ content: pdfText(c), styles: { fontStyle: i === 1 ? 'bold' : 'normal', valign: 'middle' } }))] });
      y = last() + 6;
    } else if (b.t === 'banner') b.tone === 'cream' ? band(b.text, COLORS.cream, '3A2E00') : band(b.text, COLORS.orange, 'FFFFFF', b.more);
    else if (b.t === 'bar') { y += 4; ensure(90); band(b.text, COLORS.navy); }
    else if (b.t === 'sub') { y += 3; ensure(60); para(b.text, { bold: true, color: COLORS.navy, size: 10.5 }); }
    else if (b.t === 'kv') {
      const ws = total([1, 4], 2);
      ensure(30);
      autoTable(doc, { ...base, startY: y, body: b.rows.map(([k, v]) => [{ content: pdfText(k), styles: { fontStyle: 'bold', fillColor: rgb('E8EDF5') } }, pdfText(v)]), columnStyles: colStyles(ws) });
      y = last() + 8;
    } else if (b.t === 'table') {
      const ws = total(b.widths, b.head.length);
      ensure(40);
      autoTable(doc, {
        ...base, startY: y, columnStyles: colStyles(ws),
        head: [b.head.map(pdfText)], headStyles: { fillColor: rgb(COLORS.navy), textColor: 255, fontStyle: 'bold' },
        body: b.rows.map((r) => r.map((c, i) => ({ content: pdfText(c), styles: { fontStyle: i === 0 && b.zebra ? 'bold' : 'normal' } }))),
        foot: b.foot ? [b.foot.map(pdfText)] : undefined, footStyles: { fillColor: rgb(COLORS.zebra), textColor: 0, fontStyle: 'bold' },
        alternateRowStyles: b.zebra ? { fillColor: rgb(COLORS.zebra) } : undefined,
        showHead: 'everyPage', rowPageBreak: 'avoid',
      });
      y = last() + 8;
    } else if (b.t === 'text') para(b.text, { italic: b.italic, size: b.italic ? 8.5 : 9.5 });
    else if (b.t === 'bullets') for (const it of b.items) { const before = y; para(it, { indent: 12 }); doc.setFillColor(0, 0, 0); doc.circle(mx + 4, before + 6, 1.3, 'F'); }
    else if (b.t === 'callout') { ensure(30); autoTable(doc, { ...base, startY: y, body: [[{ content: pdfText(`${b.tone === 'danger' ? 'ATTENTION : ' : 'Bonne pratique : '}${b.text}`), styles: { fillColor: rgb(b.tone === 'danger' ? COLORS.redBg : COLORS.greenBg), textColor: rgb(b.tone === 'danger' ? '5C0000' : '1E3A0E'), lineColor: rgb(b.tone === 'danger' ? COLORS.red : COLORS.green), lineWidth: { left: 3, top: 0, right: 0, bottom: 0 }, cellPadding: 6 } }]] }); y = last() + 6; }
  }

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(89, 89, 89);
    doc.text('Lycée La Mache · Bac Pro MELEC', mx, 28); doc.setDrawColor(...rgb(COLORS.navy)); doc.line(mx, 33, W - mx, 33);
    doc.text(`Page ${i} / ${n}`, W - mx, H - 22, { align: 'right' });
  }
  return doc.output('blob');
}
