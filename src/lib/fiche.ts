import { schoolYearOf } from './dates';
import { CC_LABELS, ccToC } from './domain';

/** Ligne du récapitulatif d'une séquence (parties du TP) */
export interface Part { partie: string; intitule: string; nature: string; duree: string; supports: string; competences: string }
/** Rubrique du principe d'organisation */
export interface Principle { titre: string; texte: string }
/** Ligne de la grille d'évaluation : un indicateur et ses niveaux */
export interface EvalRow { cc: string; indicateur: string; na: string; eca: string; pa: string; a: string }
/** Ligne du tableau de déroulement d'une séance */
export interface Activity { activite: string; duree: string; professeur: string; eleve: string; outils: string }
/** Bloc du déroulement : une journée ou une demi-journée avec son tableau */
export interface Block { titre: string; lignes: Activity[] }
export interface Warning { type: 'danger' | 'ok'; texte: string }

export interface SequenceData {
  /** Identité */
  domaine: string; organisation: string; prerequis: string; modalite: string; objectif: string;
  /** Compétences communes du vademecum (CC) et compétences du référentiel (C) */
  cc: string[]; competences: string[];
  parties: Part[]; principe: Principle[]; coherence: string;
  evaluation: EvalRow[]; autoeval: string;
}

export interface SeanceData {
  discipline: string; annee: string; numero: string; domaine: string;
  /** TP : objectif, contexte (fil rouge), position dans l'année, prérequis (un par ligne), organisation */
  objectif: string; contexte: string; repere: string; prerequis: string; organisation: string;
  cc: string[]; competences: string[];
  /** Durée totale et parcours */
  duree: string; blocs: Block[];
  /** Scénario */
  situation: string; deroulement: string; vigilance: Warning[];
  guide: string; autonome: string; expert: string; annexe: string;
}

export const NATURES = ['Étude', 'Réalisation', 'Mesures', 'Bilan', 'Cours', 'Évaluation'];
export const LEVEL_NOTE = 'Niveaux : NE (non évalué), NA (non acquis), ECA (en cours d’acquisition), PA (partiellement acquis), A (acquis). Les critères sont donnés à titre de proposition.';

export const DEFAULT_PRINCIPLES: Principle[] = [
  { titre: 'Répartition en séances', texte: '' },
  { titre: 'Occupation des postes', texte: '' },
  { titre: 'Arrêts de validation', texte: '' },
  { titre: 'Rotation', texte: '' },
];
export const emptyActivity = (): Activity => ({ activite: '', duree: '', professeur: '', eleve: '', outils: '' });
export const emptyPart = (): Part => ({ partie: '', intitule: '', nature: '', duree: '', supports: '', competences: '' });
export const emptyEval = (cc = ''): EvalRow => ({ cc, indicateur: '', na: '', eca: '', pa: '', a: '' });

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const strs = (v: unknown) => list<unknown>(v).filter((x): x is string => typeof x === 'string');

/** Année scolaire en cours, au format « 2026-2027 » */
export const schoolYearLabel = (d = new Date()) => { const y = schoolYearOf(d); return `${y}-${y + 1}`; };

/** « CC11 / C1 » : une compétence commune et la compétence du référentiel qui lui correspond */
export const ccPair = (cc: string) => { const c = ccToC(cc); return c ? `${cc} / ${c}` : cc; };

/** Codes CC connus, dans l'ordre */
export const ccCodes = () => Object.keys(CC_LABELS);

/** Lit les données d'une fiche séquence, y compris celles saisies avec l'ancien modèle */
export function sequenceData(raw: unknown): SequenceData {
  const d = (raw ?? {}) as Record<string, unknown>;
  const legacySeances = strs(d.seances).filter(Boolean);
  const parties = list<Part>(d.parties).length ? list<Part>(d.parties).map((p) => ({ ...emptyPart(), ...p }))
    : legacySeances.map((s, i) => ({ ...emptyPart(), partie: String(i + 1), intitule: s }));
  return {
    domaine: str(d.domaine),
    organisation: str(d.organisation) || [str(d.duree), str(d.effectif) && `Effectif : ${str(d.effectif)}`].filter(Boolean).join(' · '),
    prerequis: str(d.prerequis), modalite: str(d.modalite), objectif: str(d.objectif),
    cc: strs(d.cc), competences: strs(d.competences),
    parties,
    principe: list<Principle>(d.principe).length ? list<Principle>(d.principe) : DEFAULT_PRINCIPLES.map((p) => ({ ...p })),
    coherence: str(d.coherence) || str(d.contexte),
    evaluation: list<EvalRow>(d.evaluation).map((e) => ({ ...emptyEval(), ...e })),
    autoeval: str(d.autoeval),
  };
}

/** Lit les données d'une fiche séance, y compris celles saisies avec l'ancien modèle (tableau unique) */
export function seanceData(raw: unknown, now = new Date()): SeanceData {
  const d = (raw ?? {}) as Record<string, unknown>;
  const blocs = list<Block>(d.blocs).length ? list<Block>(d.blocs).map((b) => ({ titre: str(b.titre), lignes: list<Activity>(b.lignes).map((l) => ({ ...emptyActivity(), ...l })) }))
    : [{ titre: '', lignes: list<Activity>(d.activites).map((l) => ({ ...emptyActivity(), ...l })) }];
  return {
    discipline: str(d.discipline) || 'Bac Pro MELEC', annee: str(d.annee) || schoolYearLabel(now), numero: str(d.numero), domaine: str(d.domaine),
    objectif: str(d.objectif) || str(d.objectifs), contexte: str(d.contexte), repere: str(d.repere), prerequis: str(d.prerequis), organisation: str(d.organisation),
    cc: strs(d.cc), competences: strs(d.competences),
    duree: str(d.duree), blocs,
    situation: str(d.situation), deroulement: str(d.deroulement),
    vigilance: list<Warning>(d.vigilance).filter((w) => w && (w.type === 'danger' || w.type === 'ok')),
    guide: str(d.guide), autonome: str(d.autonome), expert: str(d.expert), annexe: str(d.annexe),
  };
}

/** Une ligne de texte par élément de liste (puces) */
export const lines = (s: string) => s.split('\n').map((x) => x.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean);

/** Durée écrite par l'utilisateur (« 35 min », « 1 h 05 », « 1h30 », « 65 ») en minutes ; null si illisible */
export function minutesOf(s: string): number | null {
  const t = s.trim().toLowerCase().replace(/\s+/g, '');
  let m = /^(\d+)h(\d{1,2})?(min)?$/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2] ?? 0);
  m = /^(\d+)(min)?$/.exec(t);
  return m ? Number(m[1]) : null;
}
/** Total en minutes d'un ensemble de durées, ou null si l'une est illisible ou si la liste est vide */
export function totalMinutes(durations: string[]): number | null {
  const v = durations.filter((x) => x.trim()).map(minutesOf);
  return v.length && v.every((x) => x !== null) ? (v as number[]).reduce((a, b) => a + b, 0) : null;
}
export const fmtMinutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}` : `${m} min`);

/** Lignes d'évaluation à ajouter pour les compétences communes choisies qui n'ont pas encore de ligne */
export const missingEvalRows = (cc: string[], rows: EvalRow[]): EvalRow[] => cc.filter((c) => !rows.some((r) => r.cc === c)).map((c) => emptyEval(c));
