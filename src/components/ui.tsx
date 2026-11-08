import { useEffect, useState, type ReactNode } from 'react';
import type { Tone } from '@/lib/domain';
import { useStore } from '@/state/store';
import { resolveIntro } from '@/lib/intros';

export const Chip = ({ tone = 'idle', children, title }: { tone?: Tone; children: ReactNode; title?: string }) => (
  <span className={`chip ${tone}`} title={title}>
    {children}
  </span>
);

export const Empty = ({ children, to }: { children: ReactNode; to?: { href: string; label: string } }) => (
  <div className="empty">
    {children}
    {to && <div><a className="btn sm" href={to.href}>{to.label}</a></div>}
  </div>
);

export function PageHead({ title, tab, children }: { title: string; tab?: string; children?: ReactNode }) {
  const { settings } = useStore();
  const intro = tab ? resolveIntro(tab, settings) : null;
  const body = intro ? intro.text : children;
  return (
    <div className="head">
      <h1>{title}</h1>
      {body && <p className={intro && !intro.print ? 'no-print' : undefined}>{body}</p>}
    </div>
  );
}

/** Champ de formulaire : l'étiquette entoure le contrôle, ce qui les associe sans identifiant */
export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={'f' + (wide ? ' wide' : '')}>
      <span className="lab">{label}</span>
      {children}
    </label>
  );
}

/** Formulaire d'ajout ou de modification dans un panneau latéral : la liste reste visible à côté */
export function AddPanel({ summary, open, onClose, children }: { summary: string; open?: boolean; onClose?: () => void; children: ReactNode }) {
  const [isOpen, setOpen] = useState(!!open);
  useEffect(() => setOpen(!!open), [open]);
  const close = () => { setOpen(false); onClose?.(); };
  useEffect(() => {
    if (!isOpen) return;
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });
  return (
    <>
      <div className="no-print"><button type="button" className="btn add-open" aria-haspopup="dialog" aria-expanded={isOpen} onClick={() => setOpen(true)}>{summary}</button></div>
      {isOpen && (
        <div className="drawer-back no-print" onClick={close}>
          <aside className="drawer" role="dialog" aria-modal="true" aria-label={summary} onClick={(e) => e.stopPropagation()}>
            <div className="row between drawer-head">
              <b>{summary}</b>
              <button type="button" className="btn ghost sm" aria-label="Fermer le formulaire" onClick={close}>✕</button>
            </div>
            <div className="add-body">{children}</div>
          </aside>
        </div>
      )}
    </>
  );
}

/** Suppression en deux temps : une fenêtre dit ce qui sera perdu, puis demande confirmation */
export function ConfirmButton({
  onConfirm, children, warn = 'Confirmer', className = 'btn del sm', disabled, detail, irreversible,
}: {
  onConfirm: () => void | Promise<void>;
  children: ReactNode;
  warn?: string;
  className?: string;
  disabled?: boolean;
  detail?: string;
  /** Pas de retour possible depuis l'historique (effacement RGPD) */
  irreversible?: boolean;
}) {
  const [ask, setAsk] = useState(false);
  useEffect(() => {
    if (!ask) return;
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') setAsk(false); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [ask]);
  return (
    <>
      <button type="button" className={className} disabled={disabled} aria-haspopup="dialog" onClick={() => setAsk(true)}>{children}</button>
      {ask && (
        <div className="modal-back no-print" onClick={() => setAsk(false)}>
          <div className="modal panel" role="alertdialog" aria-modal="true" aria-label="Confirmation" onClick={(e) => e.stopPropagation()}>
            <h2>Confirmer l’action ?</h2>
            <p>{detail ?? 'Cette action est définitive pour l’élément concerné.'}</p>
            {!irreversible && <p className="muted small">Un gestionnaire peut retrouver la plupart des suppressions dans Administration, Historique.</p>}
            <div className="actions">
              <button type="button" className="btn del" autoFocus onClick={() => { setAsk(false); void onConfirm(); }}>{warn}</button>
              <button type="button" className="btn ghost" onClick={() => setAsk(false)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function Seg<T extends string>({
  items, value, onChange, label,
}: {
  items: Array<[T, string] | [T, string, { off?: string }]>;
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {items.map(([k, l, o]) => (
        <button key={k} type="button" aria-pressed={k === value} aria-disabled={o?.off ? true : undefined} className={o?.off ? 'off' : undefined} title={o?.off} onClick={() => !o?.off && onChange(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export const Options = ({ items, placeholder }: { items: Array<[string, string]>; placeholder?: string }) => (
  <>
    {placeholder !== undefined && <option value="">{placeholder}</option>}
    {items.map(([v, l]) => (
      <option key={v} value={v}>
        {l}
      </option>
    ))}
  </>
);

export const Spinner = ({ label = 'Chargement…' }: { label?: string }) => <p className="muted">{label}</p>;

/** Télécharge un fichier généré dans le navigateur */
export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function toCsv(rows: Array<Array<string | number | null | undefined>>): Blob {
  const body = rows
    .map((r) =>
      r
        .map((c) => {
          const t = String(c ?? '');
          return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
        })
        .join(';'),
    )
    .join('\r\n');
  return new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' });
}

/** Nombre modifiable directement dans un tableau : enregistré en quittant le champ */
export function InlineNumber({ value, min = 0, max = 9999, label, onSave, step = 1 }: { value: number; min?: number; max?: number; label: string; onSave: (v: number) => void | Promise<void>; step?: number }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const commit = () => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) { setV(String(value)); return; }
    if (n !== value) void onSave(n);
  };
  return <input className="in inline-num" type="number" inputMode="decimal" min={min} max={max} step={step} aria-label={label} value={v}
    onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
}
