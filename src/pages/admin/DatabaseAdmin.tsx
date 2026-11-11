import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { MIGRATIONS } from '@/lib/migrations';
import { Chip } from '@/components/ui';
import { useToast } from '@/state/toast';

type Status = 'ok' | 'missing' | 'error' | 'unknown' | 'checking';

const LABEL: Record<Status, [string, 'ok' | 'bad' | 'warn' | 'info']> = {
  ok: ['Appliquée', 'ok'], missing: ['À appliquer', 'bad'], error: ['Vérification impossible', 'warn'], unknown: ['Non vérifiable', 'info'], checking: ['Vérification…', 'info'],
};

/** Base de données : migrations appliquées ou manquantes, avec le SQL à copier dans l'éditeur SQL de Supabase */
export default function DatabaseAdmin() {
  const toast = useToast();
  const [status, setStatus] = useState<Record<string, Status>>({});

  const check = useCallback(async () => {
    setStatus(Object.fromEntries(MIGRATIONS.map((m) => [m.id, m.probe ? 'checking' : 'unknown'])));
    for (const m of MIGRATIONS) {
      if (!m.probe) continue;
      const r = await api.probe(m.probe.table, m.probe.columns);
      setStatus((s) => ({ ...s, [m.id]: r }));
    }
  }, []);
  useEffect(() => { void check(); }, [check]);

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast(`${what} copié : collez-le dans l’éditeur SQL de Supabase, puis cliquez sur Run.`); } catch { toast('Copie impossible : sélectionnez le texte à la main.'); }
  };
  const missing = MIGRATIONS.filter((m) => status[m.id] === 'missing');
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
  const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(url)?.[1];

  return (
    <section className="panel stack">
      <h2>Base de données</h2>
      <p className="muted">Chaque mise à jour de l’application peut s’accompagner d’une migration SQL. Cette page vérifie lesquelles sont appliquées sur votre base ; pour celles qui manquent, copiez le SQL et exécutez-le dans l’éditeur SQL de Supabase, dans l’ordre.</p>
      <div className="row">
        <button className="btn sm" onClick={() => void check()}>Revérifier</button>
        {missing.length > 0 && <button className="btn sm" onClick={() => void copy(missing.map((m) => `-- ${m.id}\n${m.sql}`).join('\n\n'), `${missing.length} migration${missing.length > 1 ? 's' : ''}`)}>Copier tout ce qui manque ({missing.length})</button>}
        {ref && <a className="btn ghost sm" href={`https://supabase.com/dashboard/project/${ref}/sql/new`} target="_blank" rel="noreferrer">Ouvrir l’éditeur SQL</a>}
      </div>
      {missing.length === 0 && Object.values(status).every((s) => s !== 'checking') && <p role="status"><Chip tone="ok">À jour</Chip> Toutes les migrations vérifiables sont appliquées.</p>}
      <div className="scroll"><table className="tbl">
        <thead><tr><th>Migration</th><th>Contenu</th><th>État</th><th /></tr></thead>
        <tbody>{MIGRATIONS.map((m) => {
          const st = status[m.id] ?? 'checking';
          return (
            <tr key={m.id}>
              <td><b>{m.id}</b></td><td>{m.title}</td>
              <td><Chip tone={LABEL[st][1]}>{LABEL[st][0]}</Chip></td>
              <td><button className="btn ghost sm" aria-label={`Copier le SQL de la migration ${m.id}`} onClick={() => void copy(m.sql, `SQL de la migration ${m.id}`)}>Copier le SQL</button></td>
            </tr>
          );
        })}</tbody>
      </table></div>
      <p className="muted small">« Non vérifiable » : la migration ne crée que des fonctions ou des règles. Si un message d’erreur évoque une fonction ou une règle manquante, rejouez-la : elles sont écrites pour pouvoir être relancées sans dommage.</p>
    </section>
  );
}
