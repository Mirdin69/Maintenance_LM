import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Tone } from '@/lib/domain';
import { useStore } from '@/state/store';
import { resolveIntro } from '@/lib/intros';

export const Chip = ({ tone = 'idle', children, title }: { tone?: Tone; children: ReactNode; title?: string }) => (
  <span className={`chip ${tone}`} title={title}>
    {children}
  </span>
);

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;

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

/** Panneau repliable pour les formulaires d'ajout */
export function AddPanel({ summary, open, children }: { summary: string; open?: boolean; children: ReactNode }) {
  const [isOpen, setOpen] = useState(!!open);
  useEffect(() => setOpen(!!open), [open]);
  return (
    <details className="add" open={isOpen} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>{summary}</summary>
      {isOpen && <div className="add-body">{children}</div>}
    </details>
  );
}

/** Bouton qui demande une seconde pression pour confirmer (aucune boîte de dialogue du navigateur) */
export function ConfirmButton({
  onConfirm, children, warn = 'Confirmer', className = 'btn del sm', disabled,
}: {
  onConfirm: () => void | Promise<void>;
  children: ReactNode;
  warn?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className={className + (armed ? ' armed' : '')}
      disabled={disabled}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          timer.current = window.setTimeout(() => setArmed(false), 4000);
          return;
        }
        window.clearTimeout(timer.current);
        setArmed(false);
        void onConfirm();
      }}
    >
      {armed ? warn : children}
    </button>
  );
}

export function Seg<T extends string>({
  items, value, onChange, label,
}: {
  items: Array<[T, string]>;
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {items.map(([k, l]) => (
        <button key={k} type="button" aria-pressed={k === value} onClick={() => onChange(k)}>
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
