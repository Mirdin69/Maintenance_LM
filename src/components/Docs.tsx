import { useState } from 'react';
import { DOC_LABEL, docKind, embedUrl, type Doc } from '@/lib/docs';
import { Chip } from '@/components/ui';

/** Saisie des documents joints : un titre et le lien de partage du fichier (Drive) */
export function DocsEditor({ value, onChange }: { value: Doc[]; onChange: (d: Doc[]) => void }) {
  const set = (i: number, patch: Partial<Doc>) => onChange(value.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  return (
    <div className="f wide">
      <span className="lab">Documents joints (Word, PDF, Excel)</span>
      {value.map((d, i) => (
        <div key={i} className="row docrow">
          <input className="in" aria-label={`Titre du document ${i + 1}`} placeholder="Titre (ex. Sujet TP.docx)" value={d.title} maxLength={120} onChange={(e) => set(i, { title: e.target.value })} />
          <input className="in" aria-label={`Lien du document ${i + 1}`} placeholder="https://drive.google.com/file/d/…/view" value={d.url} onChange={(e) => set(i, { url: e.target.value })} style={{ flex: 2 }} />
          <button type="button" className="btn ghost sm" onClick={() => onChange(value.filter((_, j) => j !== i))}>Retirer</button>
        </div>
      ))}
      {value.length < 20 && <button type="button" className="btn ghost sm" onClick={() => onChange([...value, { title: '', url: '' }])}>+ Ajouter un document</button>}
      <span className="muted small">Déposez le fichier dans le Drive partagé, réglé sur « Tous les utilisateurs disposant du lien », puis collez ici son lien de partage.</span>
    </div>
  );
}

/** Liste des documents avec aperçu intégré (Drive) ou simple lien */
export function DocsViewer({ docs, empty = 'Aucun document joint.' }: { docs: Doc[]; empty?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!docs.length) return <span className="muted">{empty}</span>;
  const current = open !== null ? docs[open] : undefined;
  const src = current ? embedUrl(current.url) : null;
  return (
    <div className="stack">
      <div className="docs">
        {docs.map((d, i) => {
          const k = docKind(d);
          const canEmbed = !!embedUrl(d.url);
          return (
            <div key={i} className="doc">
              <Chip tone={k === 'pdf' ? 'bad' : k === 'word' ? 'info' : k === 'excel' ? 'ok' : 'idle'}>{DOC_LABEL[k]}</Chip>
              <span className="doc-t">{d.title}</span>
              {canEmbed && <button type="button" className="btn ghost sm" aria-pressed={open === i} onClick={() => setOpen(open === i ? null : i)}>{open === i ? 'Masquer' : 'Aperçu'}</button>}
              <a className="btn ghost sm" href={d.url} target="_blank" rel="noopener noreferrer">Ouvrir</a>
            </div>
          );
        })}
      </div>
      {current && src && (
        <div className="preview no-print">
          <iframe title={`Aperçu de ${current.title}`} src={src} loading="lazy" referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-popups" allow="" />
          <p className="muted small">Si l’aperçu reste vide, le fichier n’est pas partagé avec « Tous les utilisateurs disposant du lien » : utilisez « Ouvrir ».</p>
        </div>
      )}
    </div>
  );
}
