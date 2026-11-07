import { useMemo, useState } from 'react';
import { parsePaste } from '@/lib/paste';

/** Coller plusieurs lignes depuis Excel : un aperçu, puis un seul clic pour tout ajouter */
export function PasteImport({ columns, summary, onImport, max = 200, notes }: {
  columns: string[];
  summary: string;
  onImport: (rows: string[][]) => Promise<boolean>;
  max?: number;
  /** Remarques sur les lignes collées (valeurs inconnues, lignes ignorées) */
  notes?: (rows: string[][]) => string[];
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => parsePaste(text, columns).slice(0, max), [text, columns, max]);
  const remarks = useMemo(() => (notes ? notes(rows) : []), [notes, rows]);
  return (
    <details className="add no-print">
      <summary>{summary}</summary>
      <div className="add-body stack">
        <p className="muted small">Collez des lignes copiées depuis Excel. Colonnes attendues, dans cet ordre : <b>{columns.join(' · ')}</b>. La première ligne est ignorée si c’est un en-tête. {max} lignes au plus.</p>
        <textarea className="in" rows={5} aria-label="Lignes à importer" value={text} onChange={(e) => setText(e.target.value)} placeholder={columns.join('\t')} />
        {rows.length > 0 && <p><b>{rows.length}</b> ligne{rows.length > 1 ? 's' : ''} prête{rows.length > 1 ? 's' : ''} : {rows.slice(0, 3).map((r) => r[0]).join(', ')}{rows.length > 3 ? '…' : ''}</p>}
        {remarks.length > 0 && (
          <div className="alert" role="status"><b>À vérifier</b><ul>{remarks.slice(0, 10).map((m) => <li key={m}>{m}</li>)}</ul>{remarks.length > 10 && <p className="small">… et {remarks.length - 10} autre(s).</p>}</div>
        )}
        <div className="actions">
          <button type="button" className="btn sm" disabled={!rows.length || busy} onClick={async () => { setBusy(true); const ok = await onImport(rows); setBusy(false); if (ok) setText(''); }}>
            {busy ? 'Import…' : `Importer ${rows.length || ''} ligne${rows.length > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </details>
  );
}
