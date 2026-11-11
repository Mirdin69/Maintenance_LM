/** Migrations SQL du dépôt (texte brut) et de quoi vérifier, depuis l'application, si elles sont appliquées */
const files = import.meta.glob('../../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export interface MigrationInfo {
  id: string;
  title: string;
  sql: string;
  /** Une colonne ou une table qui n'existe qu'après la migration ; absent quand elle ne crée que des fonctions ou des règles */
  probe?: { table: string; columns: string[] };
}

const PROBES: Record<string, { title: string; probe?: { table: string; columns: string[] } }> = {
  '0001': { title: 'Base : comptes, groupes, salles, systèmes, TP, maintenance, achats', probe: { table: 'profiles', columns: ['id'] } },
  '0002': { title: 'Semainier, calendrier, réglages, fiches', probe: { table: 'planning_cells', columns: ['day'] } },
  '0003': { title: 'Documents joints aux TP et aux fiches', probe: { table: 'tps', columns: ['documents'] } },
  '0004': { title: 'Dépôt de fichiers (Storage)' },
  '0005': { title: 'Améliorations : historique, maintenance préventive, PFMP, devis', probe: { table: 'maintenance_plans', columns: ['id'] } },
  '0006': { title: 'Domaines personnalisés' },
  '0007': { title: 'RGPD : sortie des élèves, purge, export', probe: { table: 'students', columns: ['left_at'] } },
  '0008': { title: 'Boîte à idées', probe: { table: 'ideas', columns: ['id'] } },
  '0009': { title: 'Demi-journées et salle par case', probe: { table: 'planning_cells', columns: ['part', 'room_id'] } },
  '0010': { title: 'Plusieurs cours par demi-journée', probe: { table: 'planning_cells', columns: ['seq'] } },
  '0011': { title: 'Plusieurs enseignants par cours, TP en binôme', probe: { table: 'planning_cells', columns: ['teacher_ids', 'teacher_labels'] } },
  '0012': { title: 'Suppression d’un TP utilisé dans le semainier' },
  '0013': { title: 'Plusieurs salles par cours', probe: { table: 'planning_cells', columns: ['extra_room_ids'] } },
  '0014': { title: 'Sous-TP', probe: { table: 'tps', columns: ['parent_id'] } },
  '0015': { title: 'Effectifs par groupe', probe: { table: 'headcounts', columns: ['id'] } },
};

export const MIGRATIONS: MigrationInfo[] = Object.entries(files)
  .map(([path, sql]) => {
    const id = /(\d{4})_/.exec(path)?.[1] ?? path;
    return { id, title: PROBES[id]?.title ?? id, sql, probe: PROBES[id]?.probe };
  })
  .sort((a, b) => a.id.localeCompare(b.id));
