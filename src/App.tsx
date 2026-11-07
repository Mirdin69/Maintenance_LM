import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { AuthProvider, useAuth } from '@/state/auth';
import { StoreProvider, useStore } from '@/state/store';
import { ToastProvider, friendlyError } from '@/state/toast';
import { displayName, ROLES } from '@/lib/domain';
import { Chip, Field, Spinner } from '@/components/ui';
import Home from '@/pages/Home';
import Systems from '@/pages/Systems';
import Timetable from '@/pages/Timetable';
import Occupancy from '@/pages/Occupancy';
import Maintenance from '@/pages/Maintenance';
import Purchases from '@/pages/Purchases';
import Planning from '@/pages/Planning';
import Semainier from '@/pages/Semainier';
import Fiches from '@/pages/Fiches';
import { BrandingProvider, useBranding } from '@/state/branding';
import { Img } from '@/components/Img';
import Students from '@/pages/Students';
import Admin from '@/pages/Admin';

type TabId = 'accueil' | 'semainier' | 'systemes' | 'edt' | 'occupation' | 'maintenance' | 'achats' | 'planning' | 'fiches' | 'eleves' | 'admin';

const TABS: Array<[TabId, string]> = [
  ['accueil', 'Accueil'],
  ['semainier', 'Semainier'],
  ['systemes', 'Systèmes'],
  ['edt', 'Emploi du temps'],
  ['occupation', 'Occupation'],
  ['maintenance', 'Maintenance'],
  ['achats', 'Achats'],
  ['planning', 'Planning des TP'],
  ['fiches', 'Fiches'],
  ['eleves', 'Suivi des élèves'],
  ['admin', 'Administration'],
];

const fromHash = (): TabId => {
  const h = window.location.hash.slice(1);
  return TABS.some(([id]) => id === h) ? (h as TabId) : 'accueil';
};

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrandingProvider>
          <Gate />
        </BrandingProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

function Gate() {
  const { status, profile, signOut } = useAuth();
  if (status === 'loading')
    return (
      <div className="gate">
        <Spinner />
      </div>
    );
  if (status === 'misconfigured') return <Misconfigured />;
  if (status === 'signedOut') return <Login />;
  if (status === 'noProfile')
    return (
      <Message title="Compte introuvable">
        <p>Votre compte est connecté mais aucun profil n’a été créé. Contactez le gestionnaire du parc.</p>
        <button className="btn" onClick={() => void signOut()}>Se déconnecter</button>
      </Message>
    );
  if (status === 'pending')
    return (
      <Message title="Compte en attente de validation">
        <p>
          Votre compte <b>{profile?.email}</b> a bien été créé. Un gestionnaire doit le valider avant que vous puissiez
          consulter les données. Cette page se met à jour toute seule dès que c’est fait.
        </p>
        <button className="btn ghost" onClick={() => void signOut()}>Se déconnecter</button>
      </Message>
    );
  if (profile && !profile.active)
    return (
      <Message title="Accès désactivé">
        <p>Votre accès a été désactivé par un gestionnaire.</p>
      </Message>
    );
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}

function Logos({ onDark = false }: { onDark?: boolean }) {
  const { title, siteLogo, schoolLogo } = useBranding();
  return (
    <div className="logos">
      <Img url={siteLogo} alt="Logo du site" width={240} />
      <div className="brand">
        <b>{title}</b>
        <span className={onDark ? '' : 'muted small'}>Lycée La Mâche · bac pro MELEC</span>
      </div>
      <Img url={schoolLogo} alt="Logo du lycée" width={240} />
    </div>
  );
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="gate stack">
      <Logos />
      <div className="panel stack">
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Misconfigured() {
  return (
    <Message title="Connexion à la base non configurée">
      <p>
        Les variables <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> sont absentes. Renseignez-les
        dans Vercel (Settings, Environment Variables), puis redéployez. Le guide <code>README.md</code> détaille les étapes.
      </p>
    </Message>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const mail = email.trim().toLowerCase();
  const send = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^[^@\s]+@lamache\.org$/.test(mail)) {
      setError('Utilisez votre adresse professionnelle en @lamache.org.');
      return;
    }
    setBusy(true);
    try {
      await api.auth.sendLink(mail);
      setSent(true);
    } catch (err) {
      const m = friendlyError(err);
      setError(
        /Database error saving new user/i.test(m)
          ? 'Cette adresse n’est pas autorisée. Utilisez votre adresse @lamache.org.'
          : /rate limit|too many/i.test(m)
            ? 'Trop de demandes. Patientez quelques minutes avant de réessayer.'
            : m,
      );
    } finally {
      setBusy(false);
    }
  };
  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.auth.verifyCode(mail, code.trim());
    } catch {
      setError('Code incorrect ou expiré. Demandez un nouveau lien.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Message title="Connexion">
      <p className="muted">Réservé aux enseignants du lycée. Un lien de connexion est envoyé à votre adresse @lamache.org.</p>
      {!sent ? (
        <form className="stack" onSubmit={send}>
          <Field label="Adresse e-mail">
            <input className="in" type="email" autoComplete="email" required placeholder="prenom.nom@lamache.org" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {error && <div className="alert" role="alert">{error}</div>}
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Envoi…' : 'Recevoir le lien de connexion'}</button>
        </form>
      ) : (
        <form className="stack" onSubmit={verify}>
          <p>
            Un e-mail vient d’être envoyé à <b>{mail}</b>. Ouvrez le lien qu’il contient pour vous connecter. Si le message
            contient un code, saisissez-le ici.
          </p>
          <Field label="Code reçu par e-mail (facultatif)">
            <input className="in" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          {error && <div className="alert" role="alert">{error}</div>}
          <div className="row">
            <button className="btn" type="submit" disabled={busy || code.trim().length < 6}>Valider le code</button>
            <button className="btn ghost" type="button" onClick={() => { setSent(false); setCode(''); setError(''); }}>Changer d’adresse</button>
          </div>
        </form>
      )}
    </Message>
  );
}

function Shell() {
  const { profile, isAdmin, signOut, refreshProfile } = useAuth();
  const { loading, error } = useStore();
  const [tab, setTab] = useState<TabId>(fromHash);
  const [editName, setEditName] = useState(false);

  useEffect(() => {
    const on = () => setTab(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (t: string) => {
    window.location.hash = t;
    setTab(t as TabId);
    window.scrollTo(0, 0);
  };
  const tabs = TABS.filter(([id]) => id !== 'admin' || isAdmin);
  const current: TabId = tab === 'admin' && !isAdmin ? 'accueil' : tab;

  const saveName = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get('name') ?? '');
    await api.rpc('set_my_name', { p_name: name });
    await refreshProfile();
    setEditName(false);
  };

  return (
    <>
      <header className="top">
        <div className="top-in">
          <Logos onDark />
          <div className="who">
            {editName ? (
              <form className="inline" onSubmit={saveName}>
                <input className="in" name="name" aria-label="Votre nom affiché" defaultValue={profile?.full_name ?? ''} placeholder={displayName(profile)} maxLength={60} />
                <button className="btn sm" type="submit">OK</button>
              </form>
            ) : (
              <button className="btn sm" onClick={() => setEditName(true)} title="Modifier le nom affiché">
                {displayName(profile)}
              </button>
            )}
            <Chip tone={isAdmin ? 'ok' : 'idle'}>{ROLES[profile!.role]}</Chip>
            <button className="btn sm" onClick={() => void signOut()}>Se déconnecter</button>
          </div>
        </div>
        <nav className="nav" aria-label="Sections">
          {tabs.map(([id, label]) => (
            <button key={id} aria-current={id === current ? 'page' : undefined} onClick={() => go(id)}>
              {label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {error && <div className="alert" role="alert">Chargement impossible : {error}</div>}
        {loading ? (
          <Spinner />
        ) : (
          <>
            {current === 'accueil' && <Home go={go} />}
            {current === 'semainier' && <Semainier />}
            {current === 'systemes' && <Systems />}
            {current === 'edt' && <Timetable />}
            {current === 'occupation' && <Occupancy />}
            {current === 'maintenance' && <Maintenance />}
            {current === 'achats' && <Purchases />}
            {current === 'planning' && <Planning />}
            {current === 'fiches' && <Fiches />}
            {current === 'eleves' && <Students />}
            {current === 'admin' && isAdmin && <Admin />}
          </>
        )}
      </main>
    </>
  );
}
