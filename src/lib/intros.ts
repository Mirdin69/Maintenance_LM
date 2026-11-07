/** Commentaires affichés sous le titre de chaque onglet (modifiables dans Administration, Textes) */
export interface TabIntro { id: string; label: string; title: string; text: string }
export const TAB_INTROS: TabIntro[] = [
  { id: "accueil", label: "Accueil", title: "Tableau de bord", text: "L’état du parc, les salles utilisées aujourd’hui, les interventions et les achats en cours." },
  { id: "systemes", label: "Systèmes", title: "Systèmes pédagogiques", text: "Le parc des systèmes, maquettes et bancs utilisés en TP, avec la salle où ils se trouvent. Ajoutez un système avant de lui rattacher une intervention, un achat ou une séance." },
  { id: "edt", label: "Emploi du temps", title: "Emploi du temps", text: "Les créneaux hebdomadaires qui se répètent sur une période (l’année par défaut). Les exceptions d’un jour précis (déplacement, annulation, réservation) se font dans « Planning des TP »." },
  { id: "occupation", label: "Occupation", title: "Occupation des salles", text: "Taux d’occupation de la semaine (8 h – 18 h) calculé à partir de l’emploi du temps et des séances ponctuelles, avec recherche d’une salle libre." },
  { id: "maintenance", label: "Maintenance", title: "Maintenance des systèmes", text: "Interventions préventives et correctives, avec priorité, échéance et suivi." },
  { id: "achats", label: "Achats", title: "Demandes d’achat", text: "Matériel et consommables. Un enseignant peut modifier sa demande tant qu’elle n’est pas traitée ; un gestionnaire la valide, la commande puis la réceptionne." },
  { id: "planning", label: "Planning des TP", title: "Planning des TP", text: "Les séances de la semaine, le catalogue des TP et l’utilisation annuelle des systèmes." },
  { id: "eleves", label: "Élèves", title: "Suivi des élèves", text: "Cliquez sur une case pour faire évoluer la validation : non acquis, en cours, partiellement acquis, acquis, puis vide." },
  { id: "semainier", label: "Semainier", title: "Semainier", text: "Ce que fait chaque groupe, jour par jour, sur l’année. Choisissez un TP dans la case pour l’affecter ; les vacances et jours fériés se règlent dans Administration, Calendrier." },
  { id: "admin", label: "Administration", title: "Administration", text: "Comptes, élèves, salles, outils, calendrier, apparence et textes du site." },
  { id: "fiches", label: "Fiches", title: "Fiches de séquence et de séance", text: "Préparez vos fiches (modèles issus de votre semainier), partagées avec les collègues et imprimables." },
];

export const introOf = (id: string) => TAB_INTROS.find((t) => t.id === id);

/** Texte à afficher et impression : réglages `intro_<onglet>` et `intro_<onglet>_print` (imprimé par défaut) */
export function resolveIntro(id: string, settings: Record<string, string>) {
  const key = `intro_${id}`;
  const text = key in settings ? settings[key] : introOf(id)?.text ?? '';
  return { text, print: settings[`${key}_print`] !== '0' };
}
