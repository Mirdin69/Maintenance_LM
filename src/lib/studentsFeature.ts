/** Tout ce qui touche aux élèves (suivi, PFMP, liste en administration) est coupé tant que la validation RGPD n'est pas faite. */
export const STUDENTS_OFF_TIP = 'Désactivé en attente validation RGPD';
export const STUDENT_TABS: ReadonlySet<string> = new Set(['eleves', 'pfmp']);
export const studentsEnabled = (settings: Record<string, string>) => settings.students_enabled === '1';
