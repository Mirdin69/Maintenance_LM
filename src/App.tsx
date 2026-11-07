import { useEffect, useRef, useState, type FormEvent } from 'react';
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
import Pfmp from '@/pages/Pfmp';
import Bank from '@/pages/Bank';
import Catalogue from '@/pages/Catalogue';
import Help from '@/pages/Help';
import { useSaveState } from '@/state/saving';
import { Search } from '@/components/Search';
import { Notifications } from '@/components/Notifications';
import { ReportFault } from '@/components/ReportFault';
import { PasswordDialog } from '@/components/PasswordDialog';

type TabId = 'accueil' | 'semainier' | 'systemes' | 'edt' | 'occupation' | 'maintenance' | 'achats' | 'planning' | 'fiches' | 'eleves' | 'pfmp' | 'banque' | 'catalogue' | 'aide' | 'admin';

/** Rubriques de la barre d'onglets ; chaque rubrique regroupe des pages */
const FAMILIES: Array<{ id: string; label: string; tabs: Array<[TabId, string]>; admin?: boolean }> = [
  { id: 'accueil', label: 'Accueil', tabs: [['accueil', 'Accueil']] },
  { id: 'planifier', label: 'Planifier', tabs: [['semainier', 'Semainier'], ['edt', 'Emploi du temps'], ['occupation', 'Occupation'], ['planning', 'Planning des TP']] },
  { id: 'pedagogie', label: 'Pédagogie', tabs: [['fiches', 'Fiches'], ['catalogue', 'Catalogue des TP'], ['banque', 'Banque'], ['eleves', 'Suivi des élèves'], ['pfmp', 'PFMP']] },
  { id: 'atelier', label: 'Atelier', tabs: [['maintenance', 'Maintenance'], ['achats', 'Achats']] },
  { id: 'aide', label: 'Aide', tabs: [['aide', 'Aide et à propos']] },
  { id: 'admin', label: 'Administration', tabs: [['admin', 'Administration']], admin: true },
];
const TABS: Array<[TabId, string]> = FAMILIES.flatMap((f) => f.tabs);
const familyOf = (t: TabId) => FAMILIES.find((f) => f.tabs.some(([id]) => id === t));
const lastIn = (famId: string, fallback: TabId): TabId => {
  try { const v = window.localStorage.getItem(`parc:fam-${famId}`); if (v && TABS.some(([id]) => id === v)) return v as TabId; } catch { /* ignoré */ }
  return fallback;
};

const fromHash = (): TabId => {
  const h = window.location.hash.slice(1);
  return h === 'systemes' || TABS.some(([id]) => id === h) ? (h as TabId) : 'accueil';
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
  const [byCode, setByCode] = useState(false);
  const [password, setPassword] = useState('');
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
  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.auth.signInPassword(mail, password);
    } catch (err) {
      const m = friendlyError(err);
      setError(/rate limit|too many/i.test(m) ? 'Trop de tentatives. Patientez quelques minutes avant de réessayer.' : 'Adresse ou mot de passe incorrect. Première connexion ou mot de passe oublié ? Recevez un code par e-mail.');
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
      <p className="muted">Réservé aux enseignants du lycée. Connectez-vous avec votre adresse @lamache.org.</p>
      {!sent && !byCode ? (
        <form className="stack" onSubmit={signIn}>
          <Field label="Adresse e-mail">
            <input className="in" type="email" autoComplete="username" required placeholder="prenom.nom@lamache.org" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Mot de passe">
            <input className="in" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error && <div className="alert" role="alert">{error}</div>}
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
          <button className="btn ghost" type="button" onClick={() => { setByCode(true); setError(''); }}>Première connexion ou mot de passe oublié</button>
        </form>
      ) : !sent ? (
        <form className="stack" onSubmit={send}>
          <Field label="Adresse e-mail">
            <input className="in" type="email" autoComplete="email" required placeholder="prenom.nom@lamache.org" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {error && <div className="alert" role="alert">{error}</div>}
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Envoi…' : 'Recevoir le lien de connexion'}</button>
          <button className="btn ghost" type="button" onClick={() => { setByCode(false); setError(''); }}>J’ai un mot de passe</button>
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
            <button className="btn ghost" type="button" onClick={() => { setSent(false); setByCode(false); setCode(''); setError(''); }}>Changer d’adresse</button>
          </div>
        </form>
      )}
    </Message>
  );
}

/** En-tête des impressions : titre du site, logo du lycée et date */
function PrintHead() {
  const { title, schoolLogo } = useBranding();
  return (
    <div className="print-head" aria-hidden="true">
      <b>{title}</b>
      <span><Img url={schoolLogo} alt="" width={200} /> Imprimé le {new Date().toLocaleDateString('fr-FR')}</span>
    </div>
  );
}

/** Compte : nom, rôle, changement du nom affiché et déconnexion, regroupés dans un menu */
function UserMenu({ onPassword }: { onPassword: () => void }) {
  const { profile, isAdmin, signOut, refreshProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc); };
  }, [open]);
  const saveName = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await api.rpc('set_my_name', { p_name: String(new FormData(e.currentTarget).get('name') ?? '') });
    await refreshProfile();
    setEdit(false);
  };
  return (
    <div className="usermenu" ref={ref}>
      <button type="button" className="btn sm user-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="avatar" aria-hidden="true">{displayName(profile).trim().charAt(0).toUpperCase()}</span>
        <span className="user-name">{displayName(profile)}</span> <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="user-pop" role="menu">
          <div className="user-id"><b>{displayName(profile)}</b><span className="muted small">{profile?.email}</span><Chip tone={isAdmin ? 'ok' : 'idle'}>{ROLES[profile!.role]}</Chip></div>
          {edit ? (
            <form className="stack" onSubmit={saveName}>
              <input className="in" name="name" aria-label="Votre nom affiché" autoFocus defaultValue={profile?.full_name ?? ''} placeholder={displayName(profile)} maxLength={60} />
              <div className="row"><button className="btn sm" type="submit">Enregistrer</button><button className="btn ghost sm" type="button" onClick={() => setEdit(false)}>Annuler</button></div>
            </form>
          ) : (
            <button type="button" role="menuitem" className="menu-item" onClick={() => setEdit(true)}>Modifier mon nom affiché</button>
          )}
          <button type="button" role="menuitem" className="menu-item" onClick={() => { setOpen(false); onPassword(); }}>Mot de passe</button>
          <button type="button" role="menuitem" className="menu-item" onClick={() => void signOut()}>Se déconnecter</button>
        </div>
      )}
    </div>
  );
}

function Shell() {
  const { isAdmin, canWrite, user } = useAuth();
  const { loading, error } = useStore();
  const [fault, setFault] = useState(false);
  const [pwd, setPwd] = useState(false);
  const [pwdLater, setPwdLater] = useState(false);
  const [tab, setTab] = useState<TabId>(fromHash);

  useEffect(() => {
    const on = () => setTab(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (t: string) => {
    // Les systèmes se gèrent dans Administration ; les autres comptes y accèdent encore par les liens de l'application
    if (t === 'systemes' && isAdmin) {
      try { window.localStorage.setItem('parc:admin-sec', 'systemes'); } catch { /* ignoré */ }
      t = 'admin';
    }
    window.location.hash = t;
    setTab(t as TabId);
    window.scrollTo(0, 0);
  };
  const current: TabId = tab === 'admin' && !isAdmin ? 'accueil' : tab;
  const families = FAMILIES.filter((f) => !f.admin || isAdmin);
  const fam = familyOf(current);
  useEffect(() => {
    if (!fam) return;
    try { window.localStorage.setItem(`parc:fam-${fam.id}`, current); } catch { /* ignoré */ }
  }, [fam, current]);
  const pageLabel = TABS.find(([id]) => id === current)?.[1] ?? 'Systèmes';
  const saveState = useSaveState();
  const crumbs = [fam && fam.id !== 'accueil' ? fam.label : null, current !== 'accueil' && pageLabel !== fam?.label ? pageLabel : null].filter((x): x is string => !!x);


  return (
    <>
      <header className="top">
        <div className="top-in">
          <Logos onDark />
          <div className="userbar">
            {!loading && <Search go={go} />}
            {!loading && canWrite && <button className="btn sm fault-btn" onClick={() => setFault(true)}><span aria-hidden="true">⚠</span> Signaler une panne</button>}
            {!loading && <Notifications go={go} />}
            <span className={'save-ind ' + saveState} aria-live="polite">{saveState === 'saving' ? 'Enregistrement…' : saveState === 'saved' ? '✓ Enregistré' : saveState === 'failed' ? '⚠ Échec de l’enregistrement' : ''}</span>
            <UserMenu onPassword={() => setPwd(true)} />
          </div>
        </div>
        <nav className="nav" aria-label="Sections">
          {families.map((f) => (
            <button key={f.id} aria-current={f === fam ? 'page' : undefined} onClick={() => go(f.tabs.length === 1 ? f.tabs[0][0] : lastIn(f.id, f.tabs[0][0]))}>
              {f.label}
            </button>
          ))}
        </nav>
        {fam && fam.tabs.length > 1 && (
          <div className="subnav"><div className="subnav-in" role="navigation" aria-label="Pages de la rubrique">
            {fam.tabs.map(([id, label]) => (
              <button key={id} aria-current={id === current ? 'page' : undefined} onClick={() => go(id)}>{label}</button>
            ))}
          </div></div>
        )}
      </header>
      <div className="crumbs no-print" aria-label="Fil d’Ariane">
        <a href="#accueil">Parc MELEC</a>
        {crumbs.map((c, i) => <span key={c} className="row" style={{ gap: 6 }}><span aria-hidden="true">›</span><span aria-current={i === crumbs.length - 1 ? 'page' : undefined}>{c}</span></span>)}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn ghost sm" onClick={() => window.print()}>Imprimer cette page</button>
      </div>
      <PrintHead />
      {user && !user.hasPassword && !pwdLater && (
        <div className="notice no-print" role="note">
          <span>Choisissez un mot de passe pour vous connecter plus vite la prochaine fois.</span>
          <button type="button" className="btn sm" onClick={() => setPwd(true)}>Choisir un mot de passe</button>
          <button type="button" className="btn ghost sm" onClick={() => setPwdLater(true)}>Plus tard</button>
        </div>
      )}
      {pwd && <PasswordDialog first={!user?.hasPassword} onClose={() => setPwd(false)} />}
      {fault && <ReportFault onClose={() => setFault(false)} />}
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
            {current === 'pfmp' && <Pfmp />}
            {current === 'catalogue' && <Catalogue />}
            {current === 'banque' && <Bank />}
            {current === 'aide' && <Help />}
            {current === 'admin' && isAdmin && <Admin />}
          </>
        )}
      </main>
    </>
  );
}
