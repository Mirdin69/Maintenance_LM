# La Mache · Atelier

Application destinée aux enseignants du lycée La Mache : parc de systèmes pédagogiques, maintenance, demandes d’achat de matériel et consommables, planning des TP par année scolaire.

- React + TypeScript + Vite, hébergés sur **Cloudflare Pages**.
- Supabase : PostgreSQL, authentification Google et règles d’accès.
- Accès aux données réservé à un compte Google vérifié `@lamache.org`.
- L’aperçu public contient uniquement des exemples, non enregistrables.
- Historique des interventions et demandes d’achat conservé dans `lm_history`.
- Les réservations simultanées d’un même système sont bloquées dans une transaction PostgreSQL.
- Un système utilisé dans un suivi doit être archivé plutôt que supprimé.
- Tous les enseignants autorisés peuvent gérer les systèmes et les statuts des demandes ; aucun circuit d’approbation par rôle n’est encore défini.

## Installation, dans cet ordre

### 1. Préparer Supabase

Projet : `https://dzktjhiosaypezrvhhjw.supabase.co`.

Utiliser un projet dédié à cette application. Dans **SQL Editor**, ouvrir une nouvelle requête, copier le contenu de [`supabase/01_schema.sql`](supabase/01_schema.sql) et cliquer sur **Run**. Ce script initial s’exécute une seule fois ; il ne supprime pas de données existantes et ne crée aucun exemple.

Faire ensuite de même avec [`supabase/02_signup_hook.sql`](supabase/02_signup_hook.sql). Dans **Authentication → Hooks → Before User Created**, sélectionner la fonction PostgreSQL `public.lm_before_user_created`, puis activer le hook. Il refuse les nouvelles inscriptions hors Google `@lamache.org` pour tout le projet Supabase. Les protections des données restent actives même si ce hook n’est pas activé.

Dans **Authentication → Sign In / Providers**, activer Google. Désactiver les connexions par email et les inscriptions anonymes si elles ne sont pas nécessaires dans ce projet dédié.

### 2. Configurer Google

Dans Google Cloud Console, créer ou choisir un projet. Configurer Google Auth Platform / l’écran de consentement OAuth, puis créer un client OAuth de type **Web application**.

Avec l’administrateur Google Workspace du lycée, utiliser une audience **Internal / Interne** lorsque le projet appartient à l’organisation La Mache. Sinon, configurer l’audience et les utilisateurs de test autorisés pendant les essais, puis la publication de l’application selon les règles Google. L’administrateur du lycée peut avoir à autoriser l’application.

URI de redirection autorisé :

```
https://dzktjhiosaypezrvhhjw.supabase.co/auth/v1/callback
```

Coller le client ID et le client secret dans le fournisseur Google de Supabase. Le client secret reste dans Supabase : ne pas le mettre dans GitHub, Cloudflare ou le navigateur.

La connexion demande à Google de proposer le domaine `lamache.org`. Ce paramètre facilite le choix du compte ; il ne constitue pas une protection. L’accès est contrôlé côté Supabase à partir de l’email confirmé et de l’identité Google du compte.

### 3. Relier Cloudflare à GitHub

Dans Cloudflare, ouvrir **Workers & Pages**, choisir la création d’un projet **Pages** et l’import d’un dépôt Git existant. Autoriser GitHub pour le dépôt `Mirdin69/Maintenance_LM`.

| Réglage | Valeur |
|---|---|
| Branche de production | `main` |
| Framework | React / Vite |
| Commande de compilation | `npm run build` |
| Dossier de sortie | `dist` |
| Dossier racine | racine du dépôt |
| Version Node | `22` ou plus (`NODE_VERSION=22` si nécessaire) |

Ajouter les variables de compilation pour la production :

```
VITE_SUPABASE_URL=https://dzktjhiosaypezrvhhjw.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=la_cle_publishable_de_ton_projet
```

La clé **publishable**, préfixe `sb_publishable_…`, est disponible dans les réglages des clés API de Supabase. La clé historique **anon** peut aussi être utilisée. Cette clé publique est incluse dans le navigateur ; la protection repose sur les règles d’accès. Ne jamais utiliser une clé **secret**, **service_role**, un mot de passe PostgreSQL ou un jeton d’administration à sa place.

Si aucune variable n’est renseignée, l’application propose seulement son aperçu : elle ne simule pas une connexion fonctionnelle. Après toute modification de variable, relancer un déploiement.

### 4. Autoriser l’adresse du site

Après le premier déploiement Cloudflare, copier l’adresse exacte `https://nom-du-projet.pages.dev` fournie par Cloudflare.

Dans Supabase **Authentication → URL Configuration** :

- **Site URL** : cette adresse.
- **Redirect URLs** : cette même adresse avec `/` à la fin.

Si un domaine du lycée est ajouté ultérieurement, ajouter sa redirection exacte et actualiser la Site URL. Les previews Cloudflare ne sont pas automatiquement autorisées pour Google ; ne pas ajouter de wildcard large sans nécessité.

### 5. Vérifier avant l’ouverture aux enseignants

1. Se connecter avec un compte Google `@lamache.org` : accès au tableau de bord vide.
2. Essayer un compte Google extérieur : inscription refusée ou aucun accès aux données.
3. Ajouter un système puis une intervention. Recharger : données conservées.
4. Modifier l’intervention : l’historique affiche les mises à jour et leurs auteurs.
5. Planifier un TP ; tenter un second TP sur le même système avec un créneau qui chevauche le premier : refus.
6. Tester deux réservations simultanées depuis deux navigateurs.
7. Passer le système en maintenance : toute nouvelle réservation est refusée.
8. Vérifier qu’un système lié à un historique ne peut être supprimé, mais peut être archivé.
9. Se déconnecter : les données du lycée ne sont plus visibles.

Le code peut être public sans rendre les données publiques. Pour un dépôt privé, modifier sa visibilité dans GitHub et conserver l’autorisation de l’intégration Cloudflare.

## Développement et vérifications

```
npm ci
cp .env.example .env
# Renseigner la clé publique dans .env
npm run dev
npm test
npm run build
```

Pour une connexion OAuth locale, autoriser explicitement `http://localhost:5173/` dans les redirections Supabase. Ne pas réutiliser une clé secrète.

Les tests utilisent un PostgreSQL embarqué pour vérifier le SQL réel, les règles d’accès, les contrôles des achats, les réservations et l’archivage. Ils n’accèdent pas au projet Supabase réel. La connexion Google réelle et le déploiement doivent être vérifiés après configuration des comptes.

## Références officielles

- [Cloudflare Pages : React](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/)
- [Supabase : connexion Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase : restriction des inscriptions](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook)
