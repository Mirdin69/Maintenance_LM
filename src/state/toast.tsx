import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type Kind = 'ok' | 'bad';
type Show = (msg: string, kind?: Kind) => void;

const Ctx = createContext<Show>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; kind: Kind } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback<Show>((msg, kind = 'ok') => {
    setToast({ msg, kind });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), kind === 'bad' ? 7000 : 3500);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <Ctx.Provider value={show}>
      {children}
      {toast && (
        <div className={'toast' + (toast.kind === 'bad' ? ' bad' : '')} role="status" aria-live="polite">
          {toast.msg}
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
  return msg;
}
