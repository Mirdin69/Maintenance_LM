import type { Domain, Level, MarkLevel, Profile, RoomKind, Role, SystemState } from './types';

export const LEVELS: Level[] = ['Seconde', 'Première', 'Terminale'];
export const LCODE: Record<Level, string> = { Seconde: '2P', Première: '1P', Terminale: 'TP' };
export const SUBS = ['B1.1', 'B1.2', 'B2'] as const;

export const GROUP_CODES: string[] = LEVELS.flatMap((l) => SUBS.map((s) => LCODE[l] + s));

export const levelOfGroup = (code: string | null | undefined): Level | null => {
  const g = code ? parseGroup(code) : null;
  return g ? g.level : null;
};

/**
 * Reconnaît un groupe écrit de façon approximative : 2PB1.2, 2pb b1.2, 1P B2, TPB1,1, 2 pro B1.2...
 * Retourne null si le texte n'est pas un groupe valide.
 */
export function parseGroup(raw: unknown): { code: string; level: Level; sub: string } | null {
  const t = String(raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[\s_-]+/g, '')
    .replace(/,/g, '.');
  const m = t.match(/^(SECONDE|PREMIERE|TERMINALE|TLE|2NDE|2DE|2ND|1ERE|1RE|2|1|T)(?:PRO)?P?B?(1\.1|1\.2|2)$/);
  if (!m) return null;
  const key = m[1];
  const lv = key.startsWith('S') || key.startsWith('2') ? '2' : key.startsWith('P') || key.startsWith('1') ? '1' : 'T';
  const level: Level = ({ '2': 'Seconde', '1': 'Première', T: 'Terminale' } as const)[lv as '2' | '1' | 'T'];
  const sub = 'B' + m[2];
  return { code: LCODE[level] + sub, level, sub };
}

export const BUILTIN_DOMAINS: Record<string, string> = {
  ind: 'Industriel',
  ter: 'Tertiaire',
  bat: 'Bâtiment',
  tra: 'Transversal',
  ate: 'Atelier',
  ann: 'Annexe',
  pen: 'Production d’énergie',
  ten: 'Transport d’énergie',
  hab: 'Sécurité, habilitation',
  rem: 'Ressources essentielles au métier (REM)',
};

/** Liste courante : domaines prédéfinis + domaines ajoutés par un gestionnaire (voir registerDomains) */
export const DOMAINS: Record<Domain, string> = { ...BUILTIN_DOMAINS };

/** Couleurs proposées pour un domaine ajouté : clair (fond, texte) et sombre (fond, texte), contraste AA vérifié par les tests */
export const DOMAIN_PALETTE: Record<string, { name: string; bg: string; fg: string; dbg: string; dfg: string }> = {
  p1: { name: 'Cyan', bg: '#d3eef6', fg: '#0b3f52', dbg: '#17414f', dfg: '#cdeaf3' },
  p2: { name: 'Rose', bg: '#fadbea', fg: '#6e1342', dbg: '#582140', dfg: '#f8d5e6' },
  p3: { name: 'Citron', bg: '#e9f2c2', fg: '#3f4d0b', dbg: '#3e4a17', dfg: '#e6efbd' },
  p4: { name: 'Indigo', bg: '#dcdcf8', fg: '#25256b', dbg: '#2b2c5e', dfg: '#d9d9f6' },
  p5: { name: 'Brun', bg: '#eadccd', fg: '#503118', dbg: '#483322', dfg: '#e9dac9' },
  p6: { name: 'Menthe', bg: '#d0f0dd', fg: '#0f4a28', dbg: '#1b4630', dfg: '#cbeed9' },
  p7: { name: 'Orange vif', bg: '#fcd9b8', fg: '#6a2f00', dbg: '#5e3412', dfg: '#fbd5b0' },
  p8: { name: 'Ardoise', bg: '#d9dee8', fg: '#232c40', dbg: '#2c3548', dfg: '#d5dbe8' },
};

export interface CustomDomain { id: string; label: string; color: string }
export const MAX_CUSTOM_DOMAINS = 20;

export function parseCustomDomains(raw: string | undefined): CustomDomain[] {
  try {
    const v: unknown = JSON.parse(raw || '[]');
    if (!Array.isArray(v)) return [];
    return v
      .filter((d): d is CustomDomain => !!d && typeof d.id === 'string' && /^c-[a-z0-9-]{1,17}$/.test(d.id) && typeof d.label === 'string' && d.label.trim().length > 0)
      .map((d) => ({ id: d.id, label: d.label.trim().slice(0, 40), color: d.color in DOMAIN_PALETTE ? d.color : 'p8' }))
      .slice(0, MAX_CUSTOM_DOMAINS);
  } catch {
    return [];
  }
}

const customColor = new Map<string, string>();
/** Met à jour la liste courante des domaines (appelée par la base de données chargée) */
export function registerDomains(list: CustomDomain[]) {
  for (const k of Object.keys(DOMAINS)) if (!(k in BUILTIN_DOMAINS)) delete DOMAINS[k];
  customColor.clear();
  for (const d of list) { DOMAINS[d.id] = d.label; customColor.set(d.id, d.color); }
}
/** Classe CSS de couleur d'un domaine dans le semainier */
export const domainClass = (id: Domain) => `dom-${customColor.get(id) ?? id}`;
/** Nom d'un domaine, même si on ne le connaît plus */
export const domainLabel = (id: Domain) => DOMAINS[id] ?? id;

/** Couleurs des domaines prédéfinis dans le semainier : fond, texte (contraste AA vérifié en clair et en sombre) */
export const DOMAIN_COLORS: Record<string, { bg: string; fg: string; dbg: string; dfg: string }> = {
  ind: { bg: '#dbe7f7', fg: '#14305c', dbg: '#243a5e', dfg: '#d6e4fa' },
  ter: { bg: '#e6e0f3', fg: '#33225e', dbg: '#35294f', dfg: '#e0d8f5' },
  bat: { bg: '#fbe3cf', fg: '#6b3410', dbg: '#5a3820', dfg: '#fbe0cb' },
  tra: { bg: '#e6e8ec', fg: '#2c3440', dbg: '#343a45', dfg: '#e2e5ea' },
  ate: { bg: '#dcefd9', fg: '#1d4a1a', dbg: '#27442a', dfg: '#d8efd5' },
  ann: { bg: '#f6e9b8', fg: '#5a4500', dbg: '#524512', dfg: '#f6e8b4' },
  pen: { bg: '#cfeee9', fg: '#0d4a42', dbg: '#1f4a45', dfg: '#cdeee9' },
  ten: { bg: '#f6d9e0', fg: '#6a1630', dbg: '#552334', dfg: '#f6d6de' },
  hab: { bg: '#f8d4d0', fg: '#7a1a12', dbg: '#5a2622', dfg: '#f8d2cd' },
  rem: { bg: '#e8e1d2', fg: '#4a3d1f', dbg: '#40392a', dfg: '#e8e0d0' },
};


export const ROOM_KINDS: Record<RoomKind, string> = {
  atelier: 'Atelier',
  salle: 'Salle de cours',
  labo: 'Laboratoire',
  info: 'Salle informatique',
  autre: 'Autre',
};

export const SYSTEM_STATES: Record<SystemState, { label: string; tone: Tone }> = {
  service: { label: 'En service', tone: 'ok' },
  maint: { label: 'En maintenance', tone: 'warn' },
  hs: { label: 'Hors service', tone: 'bad' },
};

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'idle' | 'pa';

export const PRIORITIES = {
  n: { label: 'Normale', tone: 'idle' as Tone, rank: 1 },
  h: { label: 'Haute', tone: 'warn' as Tone, rank: 2 },
  u: { label: 'Urgente', tone: 'bad' as Tone, rank: 3 },
};

export const MAINT_STATUS = {
  open: { label: 'Ouverte', tone: 'info' as Tone },
  wip: { label: 'En cours', tone: 'warn' as Tone },
  done: { label: 'Terminée', tone: 'ok' as Tone },
};

export const TOOL_STATES = {
  ok: { label: 'Disponible', tone: 'ok' as Tone },
  usage: { label: 'À contrôler', tone: 'warn' as Tone },
  hs: { label: 'Hors service', tone: 'bad' as Tone },
};

export const PERIOD_KINDS = { vacances: 'Vacances', ferie: 'Jour férié', autre: 'Autre période' };

export const MAINT_KIND = { prev: 'Préventive', corr: 'Corrective' };

export const PURCHASE_STATUS = {
  req: { label: 'Demandée', tone: 'info' as Tone },
  ok: { label: 'Validée', tone: 'ok' as Tone },
  ord: { label: 'Commandée', tone: 'warn' as Tone },
  recv: { label: 'Reçue', tone: 'ok' as Tone },
  no: { label: 'Refusée', tone: 'bad' as Tone },
};

export const ROLES: Record<Role, string> = { admin: 'Gestionnaire', prof: 'Enseignant', lecture: 'Lecture seule' };

export const COMPETENCES: Record<string, string> = {
  C1: 'Analyser les conditions de l’opération et son contexte',
  C2: 'Organiser l’opération dans son contexte',
  C3: 'Définir une installation à l’aide de solutions préétablies',
  C4: 'Réaliser une installation de manière éco-responsable',
  C5: 'Contrôler les grandeurs caractéristiques de l’installation',
  C6: 'Régler, paramétrer les matériels de l’installation',
  C7: 'Valider le fonctionnement de l’installation',
  C8: 'Diagnostiquer un dysfonctionnement',
  C9: 'Remplacer un matériel électrique',
  C10: 'Exploiter les outils numériques dans le contexte professionnel',
  C11: 'Compléter les documents liés aux opérations',
  C12: 'Communiquer entre professionnels sur l’opération',
  C13: 'Communiquer avec le client/usager sur l’opération',
};

export const MARKS: MarkLevel[] = ['NA', 'ECA', 'PA', 'A'];
export const MARK_LABEL: Record<MarkLevel, string> = {
  NA: 'Non acquis',
  ECA: 'En cours d’acquisition',
  PA: 'Partiellement acquis',
  A: 'Acquis',
};
export const MARK_TONE: Record<MarkLevel, Tone> = { NA: 'bad', ECA: 'warn', PA: 'pa', A: 'ok' };

/** Plage horaire affichée par défaut et horaires d'ouverture pour le taux d'occupation */
export const DAY_START = 8 * 60;
export const DAY_END = 18 * 60;

/** Nom affiché d'un utilisateur : nom saisi, sinon prenom.nom de l'adresse mail */
export function displayName(p: Pick<Profile, 'full_name' | 'email'> | undefined | null): string {
  if (!p) return 'Inconnu';
  if (p.full_name && p.full_name.trim()) return p.full_name.trim();
  const local = p.email.split('@')[0] ?? p.email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export const eur = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

export const normalize = (x: unknown) =>
  String(x ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export const byText = <T,>(f: (x: T) => string) => (a: T, b: T) => f(a).localeCompare(f(b), 'fr', { numeric: true });
