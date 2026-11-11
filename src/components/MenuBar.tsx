import { useEffect, useRef, useState } from 'react';

export interface MenuGroup<T extends string> {
  id: string;
  label: string;
  /** Un seul élément : simple bouton, sans liste déroulante */
  items: Array<{ id: T; label: string; off?: string }>;
}

/** Barre de sections : chaque groupe est une liste déroulante, un groupe à un seul élément reste un bouton */
export function MenuBar<T extends string>({ groups, value, onChange, label }: { groups: Array<MenuGroup<T>>; value: T; onChange: (v: T) => void; label: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="menubar" role="group" aria-label={label} ref={ref}>
      {groups.map((g) => {
        const current = g.items.find((i) => i.id === value);
        if (g.items.length === 1) {
          const it = g.items[0];
          return <button key={g.id} type="button" className="menu-trigger" aria-pressed={!!current} aria-disabled={it.off ? true : undefined} title={it.off} onClick={() => { if (!it.off) { setOpen(null); onChange(it.id); } }}>{it.label}</button>;
        }
        return (
          <div key={g.id} className="menu-group">
            <button type="button" className="menu-trigger" aria-pressed={!!current} aria-haspopup="true" aria-expanded={open === g.id} onClick={() => setOpen(open === g.id ? null : g.id)}>
              {g.label}{current ? <span className="menu-current"> · {current.label}</span> : null} <span aria-hidden="true">▾</span>
            </button>
            {open === g.id && (
              <div className="menu-list" role="group" aria-label={g.label}>
                {g.items.map((it) => (
                  <button key={it.id} type="button" aria-current={it.id === value ? 'true' : undefined} aria-disabled={it.off ? true : undefined} className={it.off ? 'off' : undefined} title={it.off}
                    onClick={() => { if (!it.off) { setOpen(null); onChange(it.id); } }}>{it.label}</button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
