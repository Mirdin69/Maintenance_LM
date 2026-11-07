import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAct, useStore } from '@/state/store';
import { fmtStamp } from '@/lib/dates';
import { TABLE_LABEL, entryLabel, undoPlan } from '@/lib/restore';
import { friendlyError } from '@/state/toast';
import type { AuditEntry, TableName } from '@/lib/types';
import { ConfirmButton, Empty, Options, Spinner } from '@/components/ui';

const OP = { INSERT: 'Ajout', UPDATE: 'Modification', DELETE: 'Suppression' } as const;

/** Journal des modifications des 400 derniers jours, avec retour en arrière pour un gestionnaire */
export default function History() {
  const { who } = useStore();
  const act = useAct();
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState('');
  const [table, setTable] = useState('');

  const load = useCallback(() => {
    api.select<AuditEntry>('audit_log', { order: [['id', 'desc']], limit: 200 }).then(setRows).catch((e) => setError(friendlyError(e)));
  }, []);
  useEffect(load, [load]);

  const restore = async (e: AuditEntry) => {
    const plan = undoPlan(e);
    const ok = await act(async () => {
      if (plan.kind === 'remove') await api.remove(e.table_name, plan.match);
      else if (plan.kind === 'insert') await api.insert(e.table_name, plan.row);
      else await api.update(e.table_name, plan.match, plan.patch);
    }, { ok: 'Modification annulée.', tables: [e.table_name as TableName] });
    if (ok) load();
  };

  if (error) return <div className="alert" role="alert">{error}</div>;
  if (!rows) return <Spinner />;
  const list = rows.filter((r) => !table || r.table_name === table);
  return (
    <section className="panel stack">
      <div className="row between">
        <h2>Historique ({list.length})</h2>
        <select className="in" aria-label="Filtrer par rubrique" value={table} onChange={(e) => setTable(e.target.value)}><Options placeholder="Toutes les rubriques" items={Object.entries(TABLE_LABEL)} /></select>
      </div>
      <p className="muted small">Les 200 dernières modifications. « Annuler » remet la valeur précédente, recrée un élément supprimé ou supprime un ajout. Un élément recréé retrouve ses données, pas ses fichiers déposés supprimés.</p>
      {list.length === 0 ? <Empty>Aucune modification enregistrée.</Empty> : (
        <div className="scroll"><table className="tbl">
          <thead><tr><th>Quand</th><th>Qui</th><th>Rubrique</th><th>Action</th><th>Élément</th><th /></tr></thead>
          <tbody>{list.map((r) => (
            <tr key={r.id}>
              <td>{fmtStamp(r.at)}</td><td>{who(r.user_id)}</td><td>{TABLE_LABEL[r.table_name] ?? r.table_name}</td><td>{OP[r.op]}</td><td>{entryLabel(r)}</td>
              <td><ConfirmButton className="btn ghost sm" warn="Confirmer" onConfirm={() => restore(r)}>Annuler</ConfirmButton></td>
            </tr>))}</tbody>
        </table></div>
      )}
    </section>
  );
}
