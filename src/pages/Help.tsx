import { useState } from 'react';
import { useAuth } from '@/state/auth';
import { PageHead } from '@/components/ui';
import { getSize, getTheme, setSize, setTheme, type TextSize, type Theme } from '@/lib/prefs';
import { ROLES } from '@/lib/domain';

const GUIDE: Array<{ title: string; body: string[] }> = [
  { title: 'Planifier', body: [
    'Semainier : une ligne par jour, une colonne par groupe. Choisissez un TP ou une activité dans la case ; l’enregistrement est immédiat et « Annuler » apparaît juste après. Glissez la poignée ⠿ pour copier une case (avec Maj : la déplacer) ; « Copier une semaine » recopie toute une semaine vers une autre.',
    'Les ⚠ signalent un système hors service ou demandé par deux groupes le même jour. « Besoins matériel » liste, pour une semaine, les systèmes et outils à préparer.',
    'Emploi du temps et Occupation : les créneaux par salle et les conflits. Planning des TP : séances, utilisation des systèmes et rotations des groupes.',
  ] },
  { title: 'Pédagogie', body: [
    'Catalogue des TP : tous les TP par niveau, avec objectif, enseignant, systèmes, outils, compétences et documents. Fiches : fiches séquence et séance, avec documents joints. Une séance se rattache à sa séquence. « Dupliquer » repart d’une fiche existante.',
    'Banque : les TP et fiches cochés « Ressource réutilisable ». Suivi des élèves : acquisition par TP ou par compétence. PFMP : entreprises, périodes, visites.',
    'Documents : déposez des PDF, Word, Excel, PowerPoint ou OpenDocument (10 Mo au plus) ou collez un lien Drive. L’aperçu s’affiche pour les PDF, .docx et .xlsx.',
  ] },
  { title: 'Atelier', body: [
    'Maintenance : déclarez une intervention, suivez son état, ajoutez des notes. L’onglet « Contrôles récurrents » crée tout seul les interventions préventives à l’échéance.',
    'Achats : une demande, un devis, une validation par un gestionnaire, puis commande et réception. Le budget de l’année s’affiche en haut.',
    'Le bouton « Signaler une panne » de l’en-tête crée l’intervention en quelques secondes, avec une photo si besoin.',
  ] },
  { title: 'Administration (gestionnaires)', body: [
    'Comptes (validation des @lamache.org), systèmes, élèves, salles, outils, calendrier (vacances, jours affichés par niveau), apparence (titre, logos), textes des onglets, budget, historique et bilan de l’année.',
    'L’historique garde les modifications des 400 derniers jours et permet de revenir en arrière.',
  ] },
];

const FAQ: Array<[string, string]> = [
  ['Je ne vois pas le bouton pour modifier.', 'Votre compte est en lecture seule ou en attente de validation. Un gestionnaire peut changer votre rôle dans Administration, Comptes.'],
  ['J’ai supprimé quelque chose par erreur.', 'Demandez à un gestionnaire : Administration, Historique, « Annuler » sur la ligne concernée. Pour une case du semainier, utilisez « Annuler » dans le message qui s’affiche juste après.'],
  ['Mon fichier est refusé.', 'Les formats acceptés sont PDF, Word, Excel, PowerPoint et OpenDocument, 10 Mo au plus. Les images (systèmes, outils, logos) : PNG, JPEG, WebP ou GIF, 5 Mo au plus.'],
  ['Mes cours n’apparaissent pas dans « Mes cours ».', 'Le semainier reconnaît votre nom dans le champ enseignant des TP. Vérifiez votre nom affiché (bouton avec votre nom, en haut) et l’enseignant du TP dans le Catalogue.'],
  ['Les alertes sont-elles envoyées par mail ?', 'Non. Elles s’affichent dans le bouton « Alertes » de l’en-tête.'],
];

export default function Help() {
  const { profile } = useAuth();
  const [theme, setT] = useState<Theme>(getTheme);
  const [size, setS] = useState<TextSize>(getSize);
  return (
    <>
      <PageHead tab="aide" title="Aide et à propos" />
      <section className="panel stack">
        <h2>Affichage</h2>
        <div className="tools">
          <label className="f"><span className="lab">Thème</span>
            <select className="in" value={theme} onChange={(e) => { setT(e.target.value as Theme); setTheme(e.target.value as Theme); }}>
              <option value="auto">Automatique (réglage de l’appareil)</option><option value="light">Clair</option><option value="dark">Sombre</option>
            </select></label>
          <label className="f"><span className="lab">Taille du texte</span>
            <select className="in" value={size} onChange={(e) => { setS(e.target.value as TextSize); setSize(e.target.value as TextSize); }}>
              <option value="normal">Normale</option><option value="large">Grande</option>
            </select></label>
        </div>
        <p className="muted small">Ces choix sont mémorisés sur cet appareil.</p>
      </section>
      <section className="panel stack">
        <h2>Guide</h2>
        {GUIDE.map((g) => (
          <details key={g.title} className="faq">
            <summary>{g.title}</summary>
            <div className="stack">{g.body.map((t) => <p key={t}>{t}</p>)}</div>
          </details>
        ))}
      </section>
      <section className="panel stack">
        <h2>Questions fréquentes</h2>
        {FAQ.map(([q, a]) => (
          <details key={q} className="faq"><summary>{q}</summary><p>{a}</p></details>
        ))}
      </section>
      <section className="panel stack">
        <h2>À propos</h2>
        <p><b>Parc MELEC</b> : outil des enseignants du bac pro MELEC du lycée La Mache pour le parc de systèmes, les salles, le semainier, les TP, les fiches, la maintenance, les achats et le suivi des élèves.</p>
        <p className="muted small">Accès réservé aux adresses @lamache.org. Votre compte : {profile?.email} ({profile ? ROLES[profile.role] : ''}). Les données sont stockées dans une base privée ; les images déposées (systèmes, outils, logos, photos de panne) sont publiques, les documents ne le sont pas.</p>
        <p className="muted small">Un problème ou une idée ? Contactez le gestionnaire du parc.</p>
      </section>
    </>
  );
}
