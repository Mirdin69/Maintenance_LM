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
