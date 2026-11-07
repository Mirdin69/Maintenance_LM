import { api } from '@/lib/api';
import { useAuth } from '@/state/auth';
import { useAct, useStore } from '@/state/store';
import { GROUP_CODES, ROLES, displayName } from '@/lib/domain';
import { fmtStamp } from '@/lib/dates';
import type { Role } from '@/lib/types';
import { Chip, Empty, Options } from '@/components/ui';

export default function AccountsAdmin() {
  const { data } = useStore();
  const { profile } = useAuth();
  const act = useAct();
  const pending = data.profiles.filter((p) => !p.active);
  const users = data.profiles.filter((p) => p.active);

  const patch = (id: string, p: Record<string, unknown>, ok?: string) => act(() => api.update('profiles', { id }, p), { ok, tables: ['profiles'] });
  const toggleGroup = (pid: string, g: string, on: boolean) =>
    act(() => (on ? api.remove('teacher_groups', { profile_id: pid, group_code: g }) : api.insert('teacher_groups', { profile_id: pid, group_code: g })), { tables: ['teacher_groups'] });

  return (
    <>
      <p className="muted">Validation des comptes, rôles et groupes des enseignants. Seules les adresses @lamache.org peuvent créer un compte.</p>
      <section className="panel">
        <h2>Comptes à valider ({pending.length})</h2>
        {pending.length === 0 ? <Empty>Aucun compte en attente.</Empty> : (
          <div className="stack">{pending.map((p) => (
            <div key={p.id} className="row between">
              <div><b>{p.email}</b><span className="muted small"> · créé le {fmtStamp(p.created_at)}</span></div>
              <button className="btn sm" onClick={() => void patch(p.id, { active: true, role: 'prof' }, `${p.email} validé.`)}>Valider comme enseignant</button>
            </div>))}</div>
        )}
      </section>
      <section className="panel">
        <h2>Utilisateurs ({users.length})</h2>
        <div className="scroll"><table className="tbl">
          <thead><tr><th>Utilisateur</th><th>Rôle</th><th>Groupes suivis</th><th>Dernière visite</th><th /></tr></thead>
          <tbody>{users.map((p) => {
            const mine = data.teacher_groups.filter((t) => t.profile_id === p.id).map((t) => t.group_code);
            const self = p.id === profile?.id;
            return (
              <tr key={p.id}>
                <td><b>{displayName(p)}</b><span className="sub">{p.email}</span></td>
                <td><select className="in" aria-label={`Rôle de ${p.email}`} value={p.role} disabled={self} onChange={(e) => void patch(p.id, { role: e.target.value as Role })}><Options items={Object.entries(ROLES)} /></select></td>
                <td><div className="picks">{GROUP_CODES.map((g) => <label key={g} className="pick"><input type="checkbox" checked={mine.includes(g)} onChange={() => void toggleGroup(p.id, g, mine.includes(g))} />{g}</label>)}</div></td>
                <td className="small">{fmtStamp(p.last_seen) || '—'}</td>
                <td>{self ? <Chip tone="info">Vous</Chip> : <button className="btn ghost sm" onClick={() => void patch(p.id, { active: false }, `${p.email} désactivé.`)}>Désactiver</button>}</td>
              </tr>);
          })}</tbody>
        </table></div>
      </section>
    </>
  );
}
