import { useMemo } from 'react';
import { useStore } from '@/state/store';
import { TOOL_STATES, byText } from '@/lib/domain';
import { Chip, Empty } from '@/components/ui';
import { Img } from '@/components/Img';
import type { Tool } from '@/lib/types';

/** Liste des outils en lecture seule (la gestion se fait dans Administration) */
export function ToolsList({ actions }: { actions?: (t: Tool) => React.ReactNode }) {
  const { data, roomById } = useStore();
  const tools = useMemo(() => [...data.tools].sort(byText((t) => `${t.category ?? ''} ${t.name}`)), [data.tools]);
  if (!tools.length) return <Empty>Aucun outil dans la liste.</Empty>;
  return (
    <div className="scroll">
      <table className="tbl">
        <thead><tr><th>Outil</th><th>Catégorie</th><th className="num">Quantité</th><th>Rangement</th><th>État</th>{actions && <th />}</tr></thead>
        <tbody>
          {tools.map((t) => (
            <tr key={t.id}>
              <td>
                <div className="row">
                  <Img url={t.image_url} alt="" className="thumb sm" width={120} />
                  <div><b>{t.name}</b>{t.ref && <span className="sub">Réf. {t.ref}</span>}{t.notes && <span className="sub">{t.notes}</span>}</div>
                </div>
              </td>
              <td>{t.category ?? <span className="muted">—</span>}</td>
              <td className="num">{t.qty}</td>
              <td>{t.room_id ? roomById.get(t.room_id)?.name : <span className="muted">—</span>}</td>
              <td><Chip tone={TOOL_STATES[t.state].tone}>{TOOL_STATES[t.state].label}</Chip></td>
              {actions && <td>{actions(t)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
