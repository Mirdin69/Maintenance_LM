export const PRIVACY_DEFAULTS = {
  controller: 'Lycée La Mâche (représenté par le chef d’établissement)',
  dpo: 'le délégué à la protection des données de l’académie, joignable via le secrétariat du lycée',
  studentsMonths: 12,
  auditMonths: 12,
};

/** Texte d'information sur les données personnelles. `settings` vient des réglages du site (vide avant la connexion). */
export function PrivacyText({ settings = {} }: { settings?: Record<string, string> }) {
  const controller = settings.privacy_controller?.trim() || PRIVACY_DEFAULTS.controller;
  const dpo = settings.privacy_dpo?.trim() || PRIVACY_DEFAULTS.dpo;
  const sm = Number(settings.retention_students_months) || PRIVACY_DEFAULTS.studentsMonths;
  const am = Number(settings.retention_audit_months) || PRIVACY_DEFAULTS.auditMonths;
  return (
    <div className="stack">
      <h3>Qui est responsable ?</h3>
      <p>Le responsable du traitement est <b>{controller}</b>. Ce site est un outil interne réservé aux enseignants du lycée pour organiser les TP, le parc de matériel et le suivi pédagogique.</p>
      <h3>Quelles données ?</h3>
      <ul>
        <li><b>Enseignants</b> : adresse e-mail professionnelle, nom affiché, rôle, dates de connexion, modifications effectuées (historique).</li>
        <li><b>Élèves</b> : uniquement le prénom et les 2 premières lettres du nom (exemple : « Emma LA »), le groupe et le niveau d’acquisition de chaque TP. Le nom complet, la date de naissance, l’adresse et les photos ne sont jamais enregistrés.</li>
        <li><b>Entreprises d’accueil</b> (PFMP) : nom, contact du tuteur, dates de période.</li>
      </ul>
      <h3>Pourquoi, et sur quelle base ?</h3>
      <p>Mission d’enseignement et de suivi des acquis de la formation (mission d’intérêt public) ; gestion du matériel de l’atelier. Les données ne servent à aucun autre usage et ne sont ni vendues ni utilisées pour de la publicité ou du profilage. Le site n’utilise aucun traceur ni statistique de fréquentation.</p>
      <h3>Qui y a accès ?</h3>
      <p>Les enseignants dont le compte a été validé. Les élèves n’ont pas accès au site. L’hébergement est assuré par des sous-traitants (site : Vercel ; base de données : Supabase) liés au lycée par un contrat de traitement des données.</p>
      <h3>Combien de temps ?</h3>
      <ul>
        <li>Élèves : effacés <b>{sm} mois</b> après leur date de sortie.</li>
        <li>Historique des modifications : <b>{am} mois</b>.</li>
        <li>Comptes enseignants : supprimés sur demande ou au départ de l’enseignant.</li>
      </ul>
      <h3>Vos droits</h3>
      <p>Vous pouvez demander l’accès à vos données, leur rectification, leur effacement ou vous opposer à leur traitement. Les gestionnaires du site peuvent exporter et effacer définitivement toutes les données d’un élève (Administration, Élèves). Pour toute question ou réclamation : {dpo}. Vous pouvez aussi saisir la CNIL (cnil.fr).</p>
    </div>
  );
}
