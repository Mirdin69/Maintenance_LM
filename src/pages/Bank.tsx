import { useMemo, useState } from 'react';
import { useStore } from '@/state/store';
import { DOMAINS, LEVELS } from '@/lib/domain';
import { fmtStamp } from '@/lib/dates';
import { asDocs } from '@/lib/docs';
import { usePersisted } from '@/hooks/usePersisted';
import type { Level } from '@/lib/types';
import { DocsViewer } from '@/components/Docs';
import { Chip, Empty, PageHead, Seg } from '@/components/ui';

interface Item { id: string; kind: 'TP' | 'Séquence' | 'Séance'; title: string; level: Level | null; domain?: string; comps: string[]; docs: ReturnType<typeof asDocs>; reusable: boolean; who: string; stamp: string }

/** Tous les TP et fiches avec documents, filtrables ; le marquage « réutilisable » met en avant ce qui est prêt à être repris */
export default function Bank() {
  const { data, who } = useStore();
  const [q, setQ] = useState('');
  const [level, setLevel] = usePersisted<Level | ''>('bank-level', '', ['', ...LEVELS]);
  const [only, setOnly] = usePersisted<'all' | 'reusable'>('bank-only', 'reusable', ['all', 'reusable']);
  const [open, setOpen] = useState<string | null>(null);

  const items = useMemo<Item[]>(() => [
    ...data.tps.map((t): Item => ({ id: t.id, kind: 'TP', title: t.code ? `${t.code} · ${t.title}` : t.title, level: t.level, domain: DOMAINS[t.domain], comps: t.competences, docs: asDocs(t.documents), reusable: !!t.reusable, who: t.teacher_id ? who(t.teacher_id) : t.teacher_label ?? '', stamp: t.created_at })),
    ...data.fiches.map((f): Item => ({ id: f.id, kind: f.kind === 'sequence' ? 'Séquence' : 'Séance', title: f.title, level: f.level, comps: Array.isArray((f.data as { competences?: string[] }).competences) ? (f.data as { competences: string[] }).competences : [], docs: asDocs(f.documents), reusable: !!f.reusable, who: who(f.created_by), stamp: f.updated_at })),
  ], [data.tps, data.fiches, who]);

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = items
    .filter((i) => (only === 'all' || i.reusable) && (only === 'reusable' || i.docs.length > 0 || i.reusable) && (!level || i.level === level))
    .filter((i) => words.every((w) => `${i.title} ${i.kind} ${i.domain ?? ''} ${i.comps.join(' ')} ${i.who}`.toLowerCase().includes(w)))
    .sort((a, b) => Number(b.reusable) - Number(a.reusable) || b.stamp.localeCompare(a.stamp));

  return (
    <>
      <PageHead tab="banque" title="Banque de ressources" />
      <div className="tools">
        <input className="in" type="search" aria-label="Filtrer la banque" placeholder="Titre, compétence, enseignant…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Seg<Level | ''> label="Niveau" value={level} onChange={setLevel} items={[['', 'Tous'], ...LEVELS.map((l) => [l, l] as [Level, string])]} />
        <Seg<'all' | 'reusable'> label="Contenu" value={only} onChange={setOnly} items={[['reusable', 'Réutilisables'], ['all', 'Tout avec documents']]} />
      </div>
      <section className="panel stack">
        <h2>{list.length} ressource{list.length > 1 ? 's' : ''}</h2>
        {list.length === 0 ? <Empty to={{ href: '#fiches', label: 'Aller aux fiches' }}>Rien à afficher. Cochez « Ressource réutilisable » sur un TP ou une fiche pour l’ajouter ici.</Empty> : list.map((i) => (
          <article key={i.kind + i.id} className="card">
            <div className="row between">
              <h3>{i.title}</h3>
              <div className="row"><Chip tone="idle">{i.kind}</Chip>{i.level && <Chip tone="idle">{i.level}</Chip>}{i.reusable && <Chip tone="ok">Réutilisable</Chip>}</div>
            </div>
            <p className="muted small">{[i.domain, i.who, i.comps.length ? i.comps.join(' · ') : null, `mis à jour ${fmtStamp(i.stamp)}`].filter(Boolean).join(' · ')}</p>
            {i.docs.length > 0 ? (
              <>
                <button className="btn ghost sm" aria-pressed={open === i.kind + i.id} onClick={() => setOpen(open === i.kind + i.id ? null : i.kind + i.id)}>{i.docs.length} document{i.docs.length > 1 ? 's' : ''}</button>
                {open === i.kind + i.id && <DocsViewer docs={i.docs} />}
              </>
            ) : <span className="muted small">Sans document joint.</span>}
          </article>
        ))}
      </section>
    </>
  );
}
