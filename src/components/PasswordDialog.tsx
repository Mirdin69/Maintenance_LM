import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { friendlyError } from '@/state/toast';
import { Field } from '@/components/ui';

export const MIN_PASSWORD = 8;

/** Fenêtre de choix (ou de changement) du mot de passe du compte connecté */
export function PasswordDialog({ first, onClose }: { first: boolean; onClose: () => void }) {
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (pw.length < MIN_PASSWORD) return setError(`Le mot de passe doit contenir au moins ${MIN_PASSWORD} caractères.`);
    if (pw !== again) return setError('Les deux saisies ne sont pas identiques.');
    setBusy(true);
    try {
      await api.auth.setPassword(pw);
      setDone(true);
    } catch (err) {
      const m = friendlyError(err);
      setError(/same|different from the old/i.test(m) ? 'Choisissez un mot de passe différent de l’ancien.' : /weak|at least|short/i.test(m) ? `Mot de passe trop faible (au moins ${MIN_PASSWORD} caractères).` : m);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-back no-print" onClick={onClose}>
      <div className="modal panel stack" role="dialog" aria-modal="true" aria-label="Mot de passe" onClick={(e) => e.stopPropagation()}>
        <h2>{first ? 'Choisissez un mot de passe' : 'Changer mon mot de passe'}</h2>
        {done ? (
          <>
            <p>Mot de passe enregistré. Vous pourrez désormais vous connecter avec votre adresse e-mail et ce mot de passe.</p>
            <button className="btn" onClick={onClose}>Fermer</button>
          </>
        ) : (
          <form className="stack" onSubmit={submit}>
            {first && <p className="muted">Pour vous connecter plus vite la prochaine fois, sans attendre un e-mail.</p>}
            <Field label="Nouveau mot de passe">
              <input className="in" type="password" autoComplete="new-password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} />
            </Field>
            <Field label="Confirmer le mot de passe">
              <input className="in" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
            </Field>
            <p className="muted small">{MIN_PASSWORD} caractères minimum.</p>
            {error && <div className="alert" role="alert">{error}</div>}
            <div className="row">
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
              <button className="btn ghost" type="button" onClick={onClose}>{first ? 'Plus tard' : 'Annuler'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
