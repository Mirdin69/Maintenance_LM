import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { ACCEPT, DOC_LABEL, checkFile, docKind, embedUrl, hasPreview, newStoragePath, type Doc } from '@/lib/docs';
import { docxToHtmlPage, xlsxToSheets, type SheetPreview } from '@/lib/preview';
import { friendlyError, useToast } from '@/state/toast';
import { Chip, Spinner, downloadBlob } from '@/components/ui';

/** Documents joints : fichiers déposés sur le site, ou liens (Drive…) */
export function DocsEditor({ value, onChange }: { value: Doc[]; onChange: (d: Doc[]) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const set = (i: number, patch: Partial<Doc>) => onChange(value.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    let list = value;
    for (const file of Array.from(files)) {
      const problem = checkFile(file);
      if (problem) { toast?.(problem, 'bad'); continue; }
      if (list.length >= 20) { toast?.('20 documents au maximum.', 'bad'); break; }
      try {
        setProgress(`${Array.from(files).indexOf(file) + 1}/${files.length} : ${file.name}`);
        const path = newStoragePath(file.name);
        await api.storage.upload(path, file);
        list = [...list, { title: file.name, path }];
        onChange(list);
      } catch (e) {
        toast?.(`${file.name} : ${friendlyError(e)}`, 'bad');
      }
    }
    setBusy(false);
    setProgress('');
    if (input.current) input.current.value = '';
  };

  return (
    <div className="f wide">
      <span className="lab">Documents joints (Word, PDF, Excel…)</span>
      {value.map((d, i) => (
        <div key={d.path ?? `u${i}`} className="row docrow">
          <input className="in" aria-label={`Titre du document ${i + 1}`} placeholder="Titre" value={d.title} maxLength={120} onChange={(e) => set(i, { title: e.target.value })} />
          {d.path ? (
            <span className="muted small" style={{ flex: 2 }}>Fichier déposé sur le site</span>
          ) : (
            <input className="in" aria-label={`Lien du document ${i + 1}`} placeholder="https://drive.google.com/file/d/…/view" value={d.url ?? ''} onChange={(e) => set(i, { url: e.target.value })} style={{ flex: 2 }} />
          )}
          <button type="button" className="btn ghost sm" onClick={() => onChange(value.filter((_, j) => j !== i))}>Retirer</button>
        </div>
      ))}
      <div
        className={'dropzone' + (over ? ' over' : '')}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!busy) void upload(e.dataTransfer.files); }}
      >
        <span className="muted small">{busy ? `Dépôt en cours… ${progress}` : 'Glissez des fichiers ici, ou :'}</span>
        <label className="btn sm" style={{ cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Dépôt en cours…' : '+ Déposer un fichier'}
          <input ref={input} type="file" multiple accept={ACCEPT} disabled={busy || value.length >= 20} aria-label="Déposer un fichier"
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }} onChange={(e) => void upload(e.target.files)} />
        </label>
        <button type="button" className="btn ghost sm" disabled={value.length >= 20} onClick={() => onChange([...value, { title: '', url: '' }])}>+ Ajouter un lien</button>
      </div>
      <span className="muted small">PDF, Word, Excel, PowerPoint ou OpenDocument, 10 Mo au plus. L’aperçu s’affiche pour les PDF, .docx et .xlsx déposés, et pour les liens Google Drive.</span>
    </div>
  );
}

type Loaded =
  | { kind: 'pdf'; url: string }
  | { kind: 'html'; html: string }
  | { kind: 'sheets'; sheets: SheetPreview[] }
  | { kind: 'error'; message: string };

function StoredPreview({ doc }: { doc: Doc }) {
  const [state, setState] = useState<Loaded | null>(null);
  const [sheet, setSheet] = useState(0);
  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    setState(null);
    setSheet(0);
    (async () => {
      try {
        const blob = await api.storage.download(doc.path!);
        const k = docKind(doc);
        const ext = (doc.path ?? '').split('.').pop()?.toLowerCase();
        if (k === 'pdf') {
          // Type imposé : le contenu est toujours affiché comme un PDF, jamais comme une page web
          objectUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
          if (alive) setState({ kind: 'pdf', url: objectUrl });
        } else if (ext === 'docx') {
          const html = await docxToHtmlPage(blob);
          if (alive) setState({ kind: 'html', html });
        } else if (ext === 'xlsx') {
          const sheets = await xlsxToSheets(blob);
          if (alive) setState({ kind: 'sheets', sheets });
        }
      } catch (e) {
        if (alive) setState({ kind: 'error', message: friendlyError(e) });
      }
    })();
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc]);

  if (!state) return <Spinner label="Chargement de l’aperçu…" />;
  if (state.kind === 'error') return <div className="alert soft">Aperçu impossible : {state.message}. Utilisez « Télécharger ».</div>;
  if (state.kind === 'pdf') return <iframe title={`Aperçu de ${doc.title}`} src={state.url} />;
  if (state.kind === 'html') return <iframe title={`Aperçu de ${doc.title}`} srcDoc={state.html} sandbox="" />;
  const s = state.sheets[sheet];
  return (
    <div className="stack">
      {state.sheets.length > 1 && (
        <div className="seg" role="group" aria-label="Feuilles">
          {state.sheets.map((x, i) => <button key={x.name} type="button" aria-pressed={i === sheet} onClick={() => setSheet(i)}>{x.name}</button>)}
        </div>
      )}
      {!s || s.rows.length === 0 ? <span className="muted">Feuille vide.</span> : (
        <div className="scroll sheet"><table className="tbl"><tbody>
          {s.rows.map((r, i) => <tr key={i}>{r.map((c, j) => (i === 0 ? <th key={j}>{c}</th> : <td key={j}>{c}</td>))}</tr>)}
        </tbody></table></div>
      )}
      {s?.truncated && <span className="muted small">Aperçu limité aux 300 premières lignes et 40 colonnes : téléchargez le fichier pour tout voir.</span>}
    </div>
  );
}

/** Liste des documents avec aperçu intégré ou lien */
export function DocsViewer({ docs, empty = 'Aucun document joint.' }: { docs: Doc[]; empty?: string }) {
  const toast = useToast();
  const [open, setOpen] = useState<number | null>(null);
  if (!docs.length) return <span className="muted">{empty}</span>;
  const current = open !== null ? docs[open] : undefined;

  const download = async (d: Doc) => {
    try {
      downloadBlob(d.path!.split('/').pop() ?? d.title, await api.storage.download(d.path!));
    } catch (e) {
      toast?.(friendlyError(e), 'bad');
    }
  };

  return (
    <div className="stack">
      <div className="docs">
        {docs.map((d, i) => {
          const k = docKind(d);
          return (
            <div key={d.path ?? d.url ?? i} className="doc">
              <Chip tone={k === 'pdf' ? 'bad' : k === 'word' ? 'info' : k === 'excel' ? 'ok' : 'idle'}>{DOC_LABEL[k]}</Chip>
              <span className="doc-t">{d.title}</span>
              {hasPreview(d) && <button type="button" className="btn ghost sm" aria-pressed={open === i} onClick={() => setOpen(open === i ? null : i)}>{open === i ? 'Masquer' : 'Aperçu'}</button>}
              {d.path ? (
                <button type="button" className="btn ghost sm" onClick={() => void download(d)}>Télécharger</button>
              ) : (
                <a className="btn ghost sm" href={d.url} target="_blank" rel="noopener noreferrer">Ouvrir</a>
              )}
            </div>
          );
        })}
      </div>
      {current && (
        <div className="preview no-print">
          {current.path ? <StoredPreview doc={current} /> : (
            <>
              <iframe title={`Aperçu de ${current.title}`} src={embedUrl(current.url)!} loading="lazy" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups" />
              <p className="muted small">Si l’aperçu reste vide, le fichier n’est pas partagé avec « Tous les utilisateurs disposant du lien » : utilisez « Ouvrir ».</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
