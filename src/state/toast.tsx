import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type Kind = 'ok' | 'bad';
export interface ToastAction { label: string; run: () => void | Promise<void> }
type Show = (msg: string, kind?: Kind, action?: ToastAction) => void;

const Ctx = createContext<Show>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; kind: Kind; action?: ToastAction } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback<Show>((msg, kind = 'ok', action) => {
    setToast({ msg, kind, action });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), action ? 9000 : kind === 'bad' ? 7000 : 3500);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <Ctx.Provider value={show}>
      {children}
      {toast && (
        <div className={'toast' + (toast.kind === 'bad' ? ' bad' : '')} role="status" aria-live="polite">
          {toast.msg}
          {toast.action && (
            <button type="button" className="btn sm toast-act" onClick={() => { const a = toast.action!; setToast(null); void a.run(); }}>{toast.action.label}</button>
          )}
        </div>
      )}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

/** Message lisible pour une erreur venue de la base ou du réseau */
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/row-level security|permission denied/i.test(msg)) return 'Votre rôle ne permet pas cette action.';
  if (/foreign key/i.test(msg)) return 'Impossible : cet élément est encore utilisé ailleurs (emploi du temps, séances, systèmes…).';
  if (/duplicate key/i.test(msg)) return 'Cet élément existe déjà.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Connexion impossible. Vérifiez votre réseau et réessayez.';
  if (/violates check constraint|invalid input/i.test(msg)) return 'Une valeur n’est pas acceptée (trop longue, vide ou hors limites). Vérifiez les champs et réessayez.';
  if (/not-null|null value/i.test(msg)) return 'Un champ obligatoire est vide.';
  if (/JWT|session|not authenticated/i.test(msg)) return 'Votre session a expiré. Rechargez la page et reconnectez-vous.';
  if (/exceeded the maximum|too large|payload/i.test(msg)) return 'Fichier trop volumineux.';
  if (/mime|not allowed/i.test(msg)) return 'Ce type de fichier n’est pas accepté.';
  if (/timeout|timed out/i.test(msg)) return 'Le serveur met trop de temps à répondre. Réessayez dans un instant.';
  return msg;
}
