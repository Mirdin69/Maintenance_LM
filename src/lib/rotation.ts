export interface RotationPlan {
  /** Sous-groupes d'élèves, répartis à parts égales */
  subgroups: string[][];
  /** rounds[r][i] = indice de la station occupée par le sous-groupe i à la séance r */
  rounds: number[][];
}

/** Répartit les élèves en autant de sous-groupes que de stations et fait tourner les sous-groupes d'une station à la suivante. */
export function buildRotation(students: string[], stations: number, rounds = stations): RotationPlan {
  if (stations < 1) return { subgroups: [], rounds: [] };
  const subgroups: string[][] = Array.from({ length: stations }, () => []);
  students.forEach((s, i) => subgroups[i % stations].push(s));
  const n = Math.min(Math.max(1, rounds), stations);
  return { subgroups, rounds: Array.from({ length: n }, (_, r) => subgroups.map((_, i) => (i + r) % stations)) };
}

/* ───────────── Proposition de TP tournants selon l'effectif et les postes ───────────── */

export interface RotationStation {
  id: string;
  name: string;
  /** Postes disponibles (le plus petit nombre de systèmes en service parmi ceux du TP) */
  postes: number;
  /** Élèves par poste : 1 individuel, 2 binôme… */
  team: number;
}

export interface RotationProposal {
  stations: RotationStation[];
  /** Sous-groupes d'élèves (noms), de tailles égales à un près */
  groups: string[][];
  /** rounds[r][g] = indice de la station du sous-groupe g à la séance r, ou -1 s'il attend (reste en classe, autre activité) */
  rounds: number[][];
  /** Élèves que peut accueillir le TP le plus contraint */
  limit: number;
  /** Plus grand sous-groupe ne rentrant pas : toujours vide si la proposition est valide */
  problems: string[];
}

export const capacity = (s: RotationStation) => Math.max(0, s.postes) * Math.max(1, s.team);

/** Équipes (binômes…) d'un sous-groupe sur un TP donné : les élèves sont pris dans l'ordre, par paquets de la taille d'équipe. */
export function teamsOf(group: string[], team: number): string[][] {
  const size = Math.max(1, team);
  const out: string[][] = [];
  for (let i = 0; i < group.length; i += size) out.push(group.slice(i, i + size));
  // Un élève seul à la fin rejoint la dernière équipe plutôt que de rester isolé (trinôme au lieu d'un binôme + un seul)
  if (size > 1 && out.length > 1 && out[out.length - 1].length === 1) {
    const last = out.pop()!;
    out[out.length - 1].push(...last);
  }
  return out;
}

/**
 * Propose une rotation : autant de sous-groupes que nécessaire pour que chacun tienne sur le TP le plus petit
 * (au moins autant que de TP), puis chaque sous-groupe passe une fois sur chaque TP. S'il y a plus de sous-groupes
 * que de TP, certains attendent à chaque séance : il y a alors autant de séances que de sous-groupes.
 */
export function proposeRotation(students: string[], stations: RotationStation[]): RotationProposal {
  const problems: string[] = [];
  const T = stations.length;
  if (T === 0 || students.length === 0) return { stations, groups: [], rounds: [], limit: 0, problems };
  const caps = stations.map(capacity);
  const limit = Math.min(...caps);
  if (limit < 1) {
    problems.push(`« ${stations[caps.indexOf(limit)].name} » n’a aucun poste disponible.`);
    return { stations, groups: [], rounds: [], limit, problems };
  }
  const m = Math.max(T, Math.ceil(students.length / limit));
  const groups: string[][] = Array.from({ length: m }, () => []);
  students.forEach((s, i) => groups[i % m].push(s));
  const rounds = Array.from({ length: m }, (_, r) => groups.map((_, g) => { const j = (((g - r) % m) + m) % m; return j < T ? j : -1; }));
  if (groups.some((g) => !g.length)) problems.push(`Seulement ${students.length} élève(s) pour ${T} TP : certains sous-groupes seraient vides.`);
  return { stations, groups, rounds, limit, problems };
}
