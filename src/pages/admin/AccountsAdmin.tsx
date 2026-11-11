import { api } from '@/lib/api';
import { useAuth } from '@/state/auth';
import { useAct, useStore } from '@/state/store';
import { GROUP_CODES, ROLES, displayName } from '@/lib/domain';
import { fmtStamp } from '@/lib/dates';
import type { Role } from '@/lib/types';
import { Chip, Empty, Field, Options } from '@/components/ui';
import { useToast } from '@/state/toast';
import type { FormEvent } from 'react';

export default function AccountsAdmin() {
  const { data } = useStore();
  const { profile } = useAuth();
  const act = useAct();
  const toast = useToast();
  const pending = data.profiles.filter((p) => !p.active);
  const users = data.profiles.filter((p) => p.active);

  const patch = (id: string, p: Record<string, unknown>, ok?: string) => act(() => api.update('profiles', { id }, p), { ok, tables: ['profiles'] });
  const invite = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const email = String(f.get('email') ?? '').trim().toLowerCase();
    if (!/^[^@\s]+@lamache\.org$/.test(email)) { toast('Seules les adresses @lamache.org peuvent être invitées.'); return; }
    if (data.profiles.some((p) => p.email === email)) { toast('Ce compte existe déjà : utilisez « Envoyer un lien de connexion » dans la liste des utilisateurs.'); return; }
    const ok = await act(async () => {
      await api.upsert('invitations', [{ email, role: String(f.get('role')), group_codes: f.getAll('groups').map(String), invited_by: profile?.id ?? null }], 'email');
      await api.auth.sendInvite(email);
    }, { ok: `Invitation envoyée à ${email}.`, tables: ['invitations'] });
    if (ok) form.reset();
  };
  const toggleGroup = (pid: string, g: string, on: boolean) =>
    act(() => (on ? api.remove('teacher_groups', { profile_id: pid, group_code: g }) : api.insert('teacher_groups', { profile_id: pid, group_code: g })), { tables: ['teacher_groups'] });

  return (
    <>
      <p className="muted">Validation des comptes, rôles et groupes des enseignants. Seules les adresses @lamache.org peuvent créer un compte. « Envoyer un lien de connexion » envoie à l’enseignant un e-mail qui le connecte en un clic (valable une heure, un envoi par minute et par adresse).</p>
      <section className="panel stack">
        <h2>Inviter un enseignant</h2>
        <p className="muted small">L’invité reçoit un e-mail avec un lien de connexion ; son compte est créé déjà validé, avec le rôle et les groupes choisis ici. Adresse @lamache.org uniquement.</p>
        <form className="tools" aria-label="Inviter quelqu’un" onSubmit={(e) => void invite(e)}>
          <Field label="Adresse e-mail"><input className="in" name="email" type="email" required placeholder="prenom.nom@lamache.org" /></Field>
          <Field label="Rôle"><select className="in" name="role" defaultValue="prof"><Options items={Object.entries(ROLES)} /></select></Field>
          <fieldset className="picks" style={{ border: 0, padding: 0 }}><legend className="lab">Groupes suivis</legend>
            {GROUP_CODES.map((g) => <label key={g} className="pick"><input type="checkbox" name="groups" value={g} />{g}</label>)}</fieldset>
          <button className="btn" type="submit">Inviter</button>
        </form>
        {data.invitations.length > 0 && (
          <div className="stack"><h3>Invitations en attente ({data.invitations.length})</h3>
            {data.invitations.map((i) => (
              <div key={i.email} className="row between">
                <div><b>{i.email}</b><span className="muted small"> · {ROLES[i.role] ?? i.role}{i.group_codes.length ? ` · ${i.group_codes.join(', ')}` : ''} · invité le {fmtStamp(i.created_at)}</span></div>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn ghost sm" aria-label={`Renvoyer l’invitation à ${i.email}`} onClick={() => void act(() => api.auth.sendInvite(i.email), { ok: `Invitation renvoyée à ${i.email}.` })}>Renvoyer</button>
                  <button className="btn ghost sm" aria-label={`Annuler l’invitation de ${i.email}`} onClick={() => void act(() => api.remove('invitations', { email: i.email }), { ok: 'Invitation annulée.', tables: ['invitations'] })}>Annuler</button>
                </div>
              </div>))}
          </div>
        )}
      </section>
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
                <td><div className="row" style={{ gap: 6 }}>
                  <button className="btn ghost sm" aria-label={`Envoyer un lien de connexion à ${p.email}`} onClick={() => void act(() => api.auth.sendLoginLink(p.email), { ok: `Lien de connexion envoyé à ${p.email}.` })}>Envoyer un lien de connexion</button>
                  {self ? <Chip tone="info">Vous</Chip> : <button className="btn ghost sm" onClick={() => void patch(p.id, { active: false }, `${p.email} désactivé.`)}>Désactiver</button>}
                </div></td>
              </tr>);
          })}</tbody>
        </table></div>
      </section>
    </>
  );
}
