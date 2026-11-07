import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/state/store';
import { DOMAINS } from '@/lib/domain';

interface Hit { id: string; label: string; sub: string; tab: string; kind: string }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Recherche dans toutes les listes ; « / » place le curseur dans la barre */
export function Search({ go }: { go: (tab: string) => void }) {
  const { data, roomById } = useStore();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(t?.tagName ?? '') && !t?.isContentEditable) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const index = useMemo<Hit[]>(() => [
    ...data.systems.map((s) => ({ id: s.id, label: s.name, sub: [s.ref, s.room_id ? roomById.get(s.room_id)?.name : null, DOMAINS[s.domain]].filter(Boolean).join(' · '), tab: 'systemes', kind: 'Système' })),
    ...data.tps.map((t) => ({ id: t.id, label: t.code ? `${t.code} · ${t.title}` : t.title, sub: `${t.level} · ${DOMAINS[t.domain]}`, tab: 'planning', kind: 'TP' })),
    ...data.fiches.map((f) => ({ id: f.id, label: f.title, sub: f.kind === 'sequence' ? 'Fiche séquence' : 'Fiche séance', tab: 'fiches', kind: 'Fiche' })),
    ...data.rooms.map((r) => ({ id: r.id, label: r.name, sub: r.building ?? '', tab: 'occupation', kind: 'Salle' })),
    ...data.tools.map((t) => ({ id: t.id, label: t.name, sub: t.category ?? '', tab: 'systemes', kind: 'Outil' })),
    ...data.purchases.map((p) => ({ id: p.id, label: p.item, sub: p.ref ?? '', tab: 'achats', kind: 'Achat' })),
    ...data.maintenance.map((m) => ({ id: m.id, label: m.title, sub: m.status === 'done' ? 'terminée' : 'ouverte', tab: 'maintenance', kind: 'Intervention' })),
    ...data.companies.map((c) => ({ id: c.id, label: c.name, sub: c.contact ?? '', tab: 'pfmp', kind: 'Entreprise' })),
    ...data.students.map((s) => ({ id: s.id, label: s.name, sub: s.group_code, tab: 'eleves', kind: 'Élève' })),
  ], [data, roomById]);

  const hits = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return index.filter((h) => { const t = norm(`${h.label} ${h.sub} ${h.kind}`); return words.every((w) => t.includes(w)); }).slice(0, 12);
  }, [q, index]);

  return (
    <div className="search no-print" role="search">
      <input ref={input} className="in" type="search" aria-label="Rechercher" placeholder="Rechercher…  ( / )" value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => { if (e.key === 'Escape') { setQ(''); input.current?.blur(); } }} />
      {open && q.trim() && (
        <ul className="search-res" role="listbox" aria-label="Résultats">
          {hits.length === 0 && <li className="muted">Aucun résultat.</li>}
          {hits.map((h) => (
            <li key={h.kind + h.id}>
              <button type="button" role="option" aria-selected="false" onMouseDown={(e) => e.preventDefault()} onClick={() => { go(h.tab); setQ(''); setOpen(false); }}>
                <b>{h.label}</b> <span className="chip idle">{h.kind}</span>{h.sub && <span className="muted small"> {h.sub}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
