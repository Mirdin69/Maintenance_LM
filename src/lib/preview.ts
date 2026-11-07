import { cellText } from './importStudents';

export interface SheetPreview {
  name: string;
  rows: string[][];
  truncated: boolean;
}

const MAX_ROWS = 300;
const MAX_COLS = 40;

/** Excel (.xlsx) vers tableaux affichables : texte uniquement, rien d'exécutable */
export async function xlsxToSheets(blob: Blob): Promise<SheetPreview[]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await blob.arrayBuffer());
  const out: SheetPreview[] = [];
  wb.eachSheet((ws) => {
    if (ws.state && ws.state !== 'visible') return;
    const rows: string[][] = [];
    let truncated = false;
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (rows.length >= MAX_ROWS) { truncated = true; return; }
      const cells: string[] = [];
      const width = Math.min(row.cellCount, MAX_COLS);
      for (let c = 1; c <= width; c++) cells.push(cellText(row.getCell(c).value));
      rows.push(cells);
      void n;
    });
    out.push({ name: ws.name, rows, truncated: truncated || ws.columnCount > MAX_COLS });
  });
  return out;
}

const escapeCss = 'body{font:14px/1.5 Arial,Helvetica,sans-serif;margin:16px;color:#18213a;background:#fff}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}';

/** Word (.docx) vers une page HTML isolée (sans script, sans accès réseau) pour un iframe sandbox */
export async function docxToHtmlPage(blob: Blob): Promise<string> {
  const mammoth = (await import('mammoth/mammoth.browser')).default as { convertToHtml: (i: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> };
  const { value } = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<style>${escapeCss}</style></head><body>${value}</body></html>`;
}
