# Parc MELEC — Lycée La Mâche

Application web pour les enseignants du bac pro MELEC : parc de systèmes, **salles et occupation selon l'emploi du temps**, maintenance, achats, planning des TP, suivi des élèves, administration des comptes.

- Site : React + Vite + TypeScript, hébergé sur **Vercel**
- Données et comptes : **Supabase** (Postgres, règles RLS, connexion par e-mail)
- Code : **GitHub**
- Accès réservé aux adresses `@lamache.org` (contrôle côté base de données, pas seulement dans l'interface)

## Mise en ligne (environ 30 minutes)

### 1. GitHub
1. Créez un dépôt **privé** vide (par exemple `parc-melec`) sur github.com.
2. Dans ce dossier : `git remote add origin <url du dépôt>` puis `git push -u origin main`.

### 2. Supabase
> **Projet qui a servi à l'ancienne version (« La Mache · Atelier »)** : préférez un projet Supabase neuf. Sinon, dans *Authentication > Hooks*, désactivez le hook *Before User Created* (`public.lm_before_user_created`), qui refuserait les nouveaux comptes absents de l'ancienne liste. Les anciennes tables `lm_*` restent en place et ne gênent pas ; supprimez-les si vous n'en avez plus besoin.

1. Créez un projet sur supabase.com (région Europe).
2. **SQL Editor** : collez et exécutez `supabase/migrations/0001_init.sql`.
3. Facultatif : exécutez `supabase/seed.sql` (4 systèmes et quelques TP d'exemple).
4. **Authentication > URL Configuration** : *Site URL* = l'adresse Vercel (étape 3). Ajoutez-la aussi dans *Redirect URLs*.
> **Mot de passe** : *Authentication > Providers > Email* doit rester activé (mots de passe autorisés). Première connexion et mot de passe oublié passent par le code envoyé par e-mail ; l'application propose ensuite de choisir un mot de passe (8 caractères minimum, réglable dans *Authentication > Sign In / Providers*). Aucune migration SQL.
5. **Authentication > Email Templates > Magic Link** : ajoutez `{{ .Token }}` dans le message pour que le code à 6 chiffres soit aussi disponible.
6. **Authentication > SMTP** : configurez un serveur d'envoi (le service intégré est limité à quelques e-mails par heure, insuffisant pour un lycée).
7. **Project Settings > API** : notez l'URL du projet et la clé `anon` / publishable.
8. Facultatif, mises à jour en direct : *Database > Replication*, activer les tables utilisées (sinon la page se recharge au retour sur l'onglet).

### 3. Vercel
1. *Add New > Project*, importez le dépôt GitHub (Vite est détecté automatiquement).
2. Variables d'environnement : `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (voir `.env.example`).
3. Déployez, puis reportez l'adresse obtenue dans Supabase (étape 2.4).

### 4. Premier lancement
- **Le premier compte qui se connecte devient gestionnaire.** Connectez-vous donc en premier.
- Les comptes suivants (@lamache.org uniquement) restent « en attente » jusqu'à validation dans l'onglet **Administration**. Un élève disposant d'une adresse @lamache.org ne voit donc aucune donnée.
- Créez ensuite les salles, puis les créneaux de l'emploi du temps.

## Administration, semainier et fiches

- **Administration** (gestionnaire) : comptes, **élèves** (ajout, déplacement, import Excel), **salles**, **outils**, **calendrier** (année scolaire, jours affichés, vacances, jours fériés générés automatiquement) et **apparence** (titre et deux logos).
- **Semainier** : vue année (une case par groupe et par jour, choix du TP dans une liste), vue semaine (domaine, enseignant, TP, objectif, compétences), vue « Mes cours ». Export CSV et impression. Les TP se créent dans Planning des TP, Catalogue, avec leur domaine, enseignant et objectif.
- **Fiches** séquence et séance : saisie, partage entre collègues, impression.
- **Images** des systèmes, outils et logos : collez le lien de partage d'un fichier du Drive, réglé sur « Tous les utilisateurs disposant du lien ». Si votre Drive est limité à l'établissement, les images ne s'afficheront que pour les personnes connectées à leur compte Google du lycée dans le même navigateur.
- **Documents joints** (Word, PDF, Excel) sur les TP et les fiches : collez le lien de partage du fichier du Drive ; un bouton « Aperçu » l'affiche dans la page (aperçu limité à Google Drive/Docs, sinon lien « Ouvrir »). Une fiche séance se rattache à une fiche séquence.
- Appliquez dans l'ordre `0002_semainier.sql`, `0003_documents.sql`, `0004_stockage.sql` `0005_ameliorations.sql` `0006_domaines.sql` `0007_rgpd.sql` `0008_idees.sql` `0009_demi_journees.sql` puis **`0010_plusieurs_cours.sql`**, après `0001_init.sql`.
- `0005` ajoute : images déposées (espace public `images`, 5 Mo), historique des modifications (gestionnaires), contrôles préventifs récurrents, PFMP et entreprises, fournisseur et devis des achats, outils et « réutilisable » sur les TP et fiches. Elle peut être rejouée sans dommage. Tant qu'elle n'est pas appliquée, le reste du site fonctionne, mais l'enregistrement d'un TP, d'une fiche ou d'un achat avec ces nouveaux champs échoue.
- `0006` autorise des domaines personnalisés sur les TP et les systèmes (liste gérée dans *Administration > Domaines*) et corrige la contrainte des systèmes, qui n'acceptait que 4 domaines. Sans elle, ajouter un domaine ou choisir « Atelier », « Annexe », etc. pour un système échoue.
- `0007` (RGPD) ajoute la date de sortie des élèves, la purge selon les durées de conservation, l'export et l'effacement complet d'un élève (progression et traces dans l'historique comprises). Sans elle, les boutons Exporter, Effacer et Purge de l'administration échouent.
- `0010` ajoute le rang `seq` (1 à 4) aux cases du semainier : plusieurs cours dans une même demi-journée. À appliquer avant d'utiliser la nouvelle version du semainier.
- `0009` ajoute les demi-journées et la salle au semainier (colonnes `part` et `room_id`, clé primaire jour + groupe + partie). Les cases existantes deviennent des journées entières. À appliquer avant d'utiliser le semainier avec la nouvelle version, sinon l'enregistrement des cases échoue.
- `0008` ajoute la boîte à idées (table `ideas`, vote par fonction). Sans elle, la page *Aide > Idées d'amélioration* affiche une erreur de chargement.
- Documents : dépôt direct de PDF, Word, Excel, PowerPoint ou OpenDocument (10 Mo max, bucket privé `documents`, lecture réservée aux comptes actifs). Aperçu intégré des PDF, .docx et .xlsx ; les .doc, .xls et .ppt se téléchargent. Les liens Google Drive restent possibles.

### Catalogue des TP : recherche, sélection et tri
- **Recherche** : un champ cherche tous les mots saisis (sans accents ni majuscules) dans le code, le titre, l'objectif, l'enseignant, la séquence et les compétences.
- **Sélection** : niveau, enseignant (ceux qui ont des TP, avec ou sans compte), domaine, durée (2 h ou moins, 2 à 4 h, 4 à 7 h, plus de 7 h, non précisée) et compétences (le TP doit les travailler toutes). *Réinitialiser les filtres* remet tout à zéro.
- **Tri** : clic sur les en-têtes TP, Niveau, Enseignant, Durée, Compétences (aller-retour croissant/décroissant) ou liste « Trier par ». Les codes sont triés naturellement (TP2 avant TP10), les valeurs vides restent en bas.

### Couleurs des domaines
- **Administration > Domaines > Couleurs des domaines** : chaque domaine (prédéfini ou ajouté) a un sélecteur de couleur libre. La couleur remplit toute la case du cours dans le semainier (vues Année et Semaine). Le texte est calculé pour rester lisible (contraste AA) et une variante assombrie est générée pour le thème sombre. *Couleur d'origine* rétablit la couleur par défaut. Réglage `domain_colors`, sans migration.

### Horaires de TP et plusieurs cours par demi-journée
- **Administration > Horaires de TP** : pour chaque jour retenu dans *Calendrier*, début et fin du matin et de l'après-midi ; durée d'une séance et pauses communes. Les séances proposées s'affichent en aperçu. Ces horaires pilotent la vue Lundi, le générateur de demi-journée et l'occupation des salles déduite du semainier. *Rétablir la trame du lycée* remet 55 min, lundi 8h40, mardi à vendredi 7h45, après-midi 13h10-18h. Réglage `schedule`, sans migration.
- **Plusieurs cours dans une demi-journée** : dans le semainier, le bouton *+ cours* sous une case remplie ajoute un cours (jusqu'à 4) avec son TP et sa salle ; ✕ le retire. Les cours se partagent à parts égales le poids de la demi-journée (répartition annuelle) et sa durée (occupation des salles). La vue Semaine affiche une colonne par cours.
- **Matin et après-midi différents** : pour un jour, choisir *Matin et après-midi* dans Calendrier donne deux lignes, chacune avec ses cours.

### Planning du lundi, heure par heure
- **Semainier > Lundi** (à côté de *Semaine*) : un tableau comme le planning papier du lundi. Lignes = séances de 55 min (matin 8h40-11h40 ou après-midi), colonnes = groupes du niveau, case = enseignant + salle (+ TP ou activité). On choisit le lundi avec les flèches ou la date.
- Chaque case détaille, comme la vue *Semaine* : domaine, enseignant, salle, TP ou activité, objectif et compétences, sur fond de la couleur du domaine (écran et impression).
- **Proposition de base** : tant que rien n'est enregistré pour ce lundi, la première séance reprend le semainier de l'année (le TP de chaque groupe avec son enseignant, et la salle de la case) et le carrousel en découle. *Enregistrer cette proposition* la transforme en séances. *Imprimer le planning du lundi* sort un tableau propre, aux couleurs des domaines.
- **Mode Carrousel** : on renseigne la première séance (qui commence avec quel groupe) ; les séances suivantes tournent automatiquement (le groupe suivant reprend ce que le précédent faisait). Toute modification de la première séance réapplique la rotation.
- **Mode À construire** : chaque séance, chaque case, se règle séparément, y compris avec l'activité « À construire ».
- Les cases sont enregistrées comme des séances datées (table `sessions`) : les conflits de salle, de groupe et d'enseignant (avec l'emploi du temps récurrent) sont contrôlés avant l'enregistrement. Tout est annulable.

### Demi-journées, salle et carrousel
- **Administration > Calendrier** : pour chaque jour affiché d'un niveau, choisissez *Journée*, *Matin*, *Après-midi* ou *Matin et après-midi* (deux lignes séparées dans le semainier).
- **Semainier** : chaque case a une liste *Salle…* modifiable (annulable) ; la salle apparaît dans la vue Semaine, « Mes cours » et l'export CSV. Une demi-journée compte 0,5 jour dans la répartition annuelle.
- **Emploi du temps > Générer une demi-journée** : intitulé (REM), niveau, groupes, jour, matin ou après-midi, première séance, heures par séance et activités (TP, TD, cours, avec salle et enseignant). Chaque groupe passe successivement par toutes les activités (rotation). Les horaires suivent la trame du lycée (séances de 55 min ; matinée dès 8h40 le lundi et 7h45 du mardi au vendredi jusqu'à 11h40, pause 9h35-9h50 ; après-midi de 13h10 à 18h, pause 15h55-16h10) : on choisit la première séance et le nombre d'heures par séance (`src/lib/schedule.ts`). Un aperçu montre la rotation ; les créneaux en conflit (salle, groupe, enseignant) sont signalés et non créés. Le semainier reçoit une case sur la demi-journée de chaque semaine (hors vacances et jours fériés, sans écraser l'existant). Tout est annulable d'un clic.

## Import d'un planning Excel et plusieurs enseignants

- **Semainier, vue année : « Importer un planning depuis Excel »** (gestionnaires et enseignants). Deux formats sont reconnus automatiquement : un emploi du temps par groupe (blocs Domaine / Enseignant / TP-Activité / Objectif / Compétences sous des jours datés, comme dans le classeur du lycée) ou un tableau d'une ligne par cours (modèle téléchargeable : Date, Groupe, Partie, TP / Code, Activité / Titre, Enseignant(s), Salle, Domaine, Objectif, Compétences). Les .xlsx, .xlsm et .csv sont lus ; l'année des dates est déduite de l'année scolaire.
- Quand le fichier cite un **TP, un domaine, un enseignant ou une salle inconnus**, une fenêtre propose pour chacun de le créer ou de l'associer à un existant (pour un TP : créer, garder comme activité libre, ignorer ; pour un enseignant : compte existant ou nom tel quel). Créer un domaine ou une salle est réservé aux gestionnaires.
- Plusieurs cours sur une même demi-journée sont importés en cours 1, 2, 3… Les cases déjà remplies sont conservées sauf si « Remplacer » est coché. « Annuler » dans le message de confirmation rétablit les cases ; les TP, domaines et salles créés restent.
- **Plusieurs enseignants par cours** : dans chaque case de la vue année, « Enseignants » permet de cocher des comptes et d'ajouter des noms libres (jusqu'à 6). Sans enseignant sur la case, c'est celui du TP qui s'affiche. Quand une case précise ses enseignants, « Mes cours », « Mes cours seulement », le tableau de bord et les alertes ne comptent que les cases où vous figurez : vous pouvez ainsi faire le même TP le vendredi sans le lundi, un collègue prenant l'autre jour. Nécessite la migration `0011_enseignants_binomes.sql`.

## TP tournants et binômes

- **Planning des TP, Rotations des groupes** : choisissez le groupe, l'effectif (repris de la liste d'élèves si elle est activée, sinon à saisir) et les TP à faire tourner. Les **postes** d'un TP sont le plus petit nombre de systèmes en service qu'il utilise (modifiable), et le **travail en équipe** (individuel, binôme, trinôme, par 4) vient de la fiche du TP (champ « Travail en équipe » dans le catalogue). La capacité d'un TP = postes × élèves par poste.
- L'outil propose le nombre de sous-groupes (au moins un par TP, davantage si l'effectif dépasse la capacité du TP le plus contraint), les équipes de chaque sous-groupe et un planning où chaque sous-groupe passe une fois sur chaque TP. S'il y a plus de sous-groupes que de TP, certains attendent à chaque séance et le nombre de séances augmente.
- **Export Excel** (feuilles Rotation, Équipes, Effectifs), CSV et impression. Le fichier Excel s'ouvre dans Google Sheets (Drive, Nouveau, Importer le fichier).

## Salles multiples et séquences de Première

- **Plusieurs salles pour un cours** : une fois la salle principale choisie, « Autres salles » permet d'en cocher jusqu'à 3 de plus (rotations en ateliers). Toutes sont affichées (semainier, export CSV) et comptées dans l'occupation des salles. Nécessite la migration `0013_salles_multiples.sql`.
- **Première : des séquences plutôt que des TP.** Dans la vue année de la Première, la liste d'une case propose en tête les **séquences** créées dans Fiches (celles de Première ou sans niveau) ; le nom de la séquence est inscrit dans la case. Les TP restent disponibles, et la répartition des élèves sur les TP se fait dans « Rotations des groupes ».

## Sous-TP

- Dans le catalogue, le champ **« Sous-TP de (TP principal) »** rattache un TP à un principal (un seul niveau). Le semainier et le planning du lundi ne proposent que les **TP principaux** ; un principal regroupe les systèmes, outils et compétences de ses sous-TP (alertes, besoins matériel, vue semaine).
- Dans **Rotations des groupes**, cocher un principal coche tous ses sous-TP, qui deviennent les postes de la rotation (on peut décocher un sous-TP). Supprimer un principal libère ses sous-TP, qui redeviennent des TP principaux. Nécessite la migration `0014_sous_tp.sql`.

## Salles et occupation

- **Salles** (Administration, gestionnaire) : nom, bâtiment, type, places, option *partagée* (grand atelier : plusieurs groupes en même temps sans conflit).
- **Emploi du temps** : créneaux hebdomadaires (jour, horaire, salle, groupe, enseignant, TP, système) sur une période, avec vue par salle, groupe ou enseignant. Plusieurs jours peuvent être créés d'un coup.
- **Planning des TP** : exceptions d'un jour (annuler, déplacer de salle ou d'horaire, marquer réalisée) et réservations ponctuelles.
- **Occupation** : taux par salle et par jour (8 h – 18 h), détail hebdomadaire, recherche de salle libre avec réservation.
- **Conflits** refusés par la base : salle déjà occupée (sauf salle partagée), groupe ou enseignant déjà en cours. Un dépassement du nombre de postes d'un système est signalé sans bloquer.
- **Semainier de l'année** : une case avec une salle occupe cette salle sur sa demi-journée (matin 8h40 ou 7h45 à 11h40, après-midi 13h10 à 18h). Elle compte dans le taux d'occupation, le détail de la salle (marqué « semainier ») et la recherche de salle libre. Si le même groupe a déjà un créneau ou une séance détaillée à ces heures, le détail l'emporte (pas de double compte).

## Élèves par fichier

Onglet Élèves > *Ajouter ou mettre à jour des élèves* : fichier `.xlsx` ou `.csv` avec Nom, Prénom, Groupe (`2PB1.1`, `1PB2`, `TPB1.2`…). Un aperçu indique ajouts, déplacements et absents avant toute écriture. Les noms sont réduits à « Prénom N. » par défaut. Le format `.xls` ancien n'est pas lu : enregistrez-le en `.xlsx`.

## Développement

```bash
npm install
npm run demo      # données fictives en mémoire, sans Supabase (?as=admin|prof|lecture|pending|signedout)
npm run dev       # avec un fichier .env
npm test          # tests SQL (PGlite), logique, interface
npm run build
```

## Points d'attention

- Supprimer une salle qui a des créneaux est refusé : désactivez-la.
- `exceljs` signale un avis npm modéré sur `uuid`, sans effet ici (la fonction concernée n'est pas utilisée).
- La clé `anon` est publique par conception ; la protection repose sur les règles RLS du fichier SQL. Ne mettez jamais la clé `service_role` dans Vercel.


## Fonctions ajoutées

- **Recherche** (touche `/`), **alertes** (comptes à valider, urgences, retards, systèmes hors service, cours du jour touchés) et **signalement de panne** avec photo dans l'en-tête. Les alertes sont affichées dans le site : aucun e-mail n'est envoyé.
- **Annuler** après un changement du semainier ; **Historique** (Administration) avec retour en arrière.
- **Semainier** : copie d'une semaine, glisser-déposer d'une case (Maj pour déplacer), avertissements (système hors service, même système demandé par deux groupes), vue **Besoins matériel**, jours affichés par niveau.
- **Planning** : rotations des groupes sur les postes ; duplication des TP ; outils nécessaires.
- **Suivi des élèves** : vue par compétence. **PFMP** : entreprises, périodes, visites. **Banque** de ressources réutilisables.
- **Achats** : fournisseur, devis, budget de l'année (Administration, Budget). **Maintenance** : contrôles récurrents créés automatiquement à l'échéance.
- **Bilan** de l'année (Administration, Bilan) : export CSV et impression.

## Interface

- Barre d'onglets en rubriques (Planifier, Pédagogie, Atelier, Aide, Administration) avec fil d'Ariane et bouton « Imprimer cette page » (en-tête avec le logo du lycée et la date).
- Formulaires dans un panneau latéral ; suppressions avec une fenêtre qui détaille les conséquences ; indicateur « Enregistré » dans l'en-tête.
- Modification directe dans les listes (postes, quantités, échéances), collage de listes depuis Excel (systèmes, achats), brouillons des fiches conservés sur l'appareil.
- Page Aide et à propos : guide, questions fréquentes, thème (automatique, clair, sombre) et taille du texte.
- Téléphone et tablette : semaine du semainier jour par jour, grandes zones à toucher. Un test vérifie le contraste (WCAG AA) des couleurs du thème clair et sombre.

## Changement d'année scolaire

*Administration > Calendrier* :
- **Vacances officielles** : « Importer les vacances (zone A) » interroge les données ouvertes du ministère (data.education.gouv.fr, jeu `fr-en-calendrier-scolaire`) depuis le navigateur, affiche les périodes trouvées, puis les ajoute après confirmation. Si le site est injoignable ou si le calendrier n'est pas publié, un message l'indique et la saisie manuelle reste possible.
- **Préparer la nouvelle année scolaire** : reporte le semainier de l'année en cours sur la nouvelle (même jour de la même semaine depuis la rentrée), sauf sur les vacances et jours fériés de la nouvelle année. Une fenêtre liste les vacances qui ne tombent plus aux mêmes semaines et les cases non reportées. Annulable.

## Données personnelles (RGPD)

- Les élèves sont enregistrés sous la forme **« Prénom + 2 premières lettres du nom »** (ex. Emma LA) ; le nom complet n'est jamais envoyé ni conservé (formulaire et import Excel). Les anciens noms « Emma L. » sont convertis à l'import suivant sans perdre la progression.
- Page **Aide > Confidentialité** (aussi visible avant connexion) : responsable, contact du DPD et durées, réglables dans *Administration > Confidentialité*.
- *Administration > Élèves* : date de sortie, « Marquer la classe comme sortie », **Exporter** (droit d'accès, JSON) et **Effacer** (droit à l'effacement, irréversible).
- *Administration > Confidentialité* : durées de conservation (élèves sortis, historique) et bouton **Lancer la purge**, à utiliser à chaque rentrée.
- Reste à faire hors du code : inscrire le traitement au registre du lycée, informer le DPD, choisir une région européenne dans Supabase et vérifier les accords de traitement (DPA) de Vercel et Supabase.
- **Fonctions élèves désactivées par défaut** (Suivi des élèves, PFMP, section Élèves de l'administration, répartition en sous-groupes, élèves et entreprises dans la recherche) : menus grisés avec l'info-bulle « Désactivé en attente validation RGPD ». Un gestionnaire les réactive dans *Administration > Confidentialité* (réglage `students_enabled`). Dans la démo, `?students=on` les active.
- **Idées d'amélioration** (Aide, ou « Proposer une idée » dans le menu du compte) : tout compte actif propose et soutient ; les gestionnaires changent le statut, répondent et suppriment.
