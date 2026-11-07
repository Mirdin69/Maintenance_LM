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
- Appliquez dans l'ordre `0002_semainier.sql`, `0003_documents.sql` puis **`0004_stockage.sql`**, après `0001_init.sql`.
- Documents : dépôt direct de PDF, Word, Excel, PowerPoint ou OpenDocument (10 Mo max, bucket privé `documents`, lecture réservée aux comptes actifs). Aperçu intégré des PDF, .docx et .xlsx ; les .doc, .xls et .ppt se téléchargent. Les liens Google Drive restent possibles.

## Salles et occupation

- **Salles** (Administration, gestionnaire) : nom, bâtiment, type, places, option *partagée* (grand atelier : plusieurs groupes en même temps sans conflit).
- **Emploi du temps** : créneaux hebdomadaires (jour, horaire, salle, groupe, enseignant, TP, système) sur une période, avec vue par salle, groupe ou enseignant. Plusieurs jours peuvent être créés d'un coup.
- **Planning des TP** : exceptions d'un jour (annuler, déplacer de salle ou d'horaire, marquer réalisée) et réservations ponctuelles.
- **Occupation** : taux par salle et par jour (8 h – 18 h), détail hebdomadaire, recherche de salle libre avec réservation.
- **Conflits** refusés par la base : salle déjà occupée (sauf salle partagée), groupe ou enseignant déjà en cours. Un dépassement du nombre de postes d'un système est signalé sans bloquer.

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
