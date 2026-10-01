# La Mache · Atelier

Maintenance des systèmes pédagogiques, demandes d’achat, planning des TP et gestion des enseignants autorisés. React + TypeScript + Vite, Cloudflare Pages et Supabase. Connexion par lien email : aucun identifiant Google requis.

## Installer ou mettre à jour Supabase

Projet : `https://dzktjhiosaypezrvhhjw.supabase.co`.

- Installation neuve : exécuter `supabase/01_schema.sql` une fois dans **SQL Editor**, puis `supabase/03_email_allowlist.sql`.
- Si les scripts 01 et 02 ont déjà été exécutés : exécuter seulement **03_email_allowlist.sql**. Les systèmes, interventions, demandes et réservations sont conservés. Ne pas relancer 01.
- Le script 02 est l’ancienne configuration Google : ne pas le réexécuter après 03.

Dans **Authentication → Hooks → Before User Created**, activer la fonction PostgreSQL **public.lm_before_user_created**. Si elle est déjà active, 03 remplace sa définition sans changer son nom. Ce hook refuse les inscriptions hors liste et s’applique à tout le projet : utiliser un projet dédié.

### Premier enseignant

La liste est vide après installation. Ajouter votre propre adresse dans **SQL Editor**, en remplaçant le texte d’exemple ci-dessous :

```sql
insert into public.lm_allowed_teachers(email)
values ('votre.adresse@lamache.org')
on conflict (email) do update set enabled = true;
```

Ne pas enregistrer les adresses réelles dans GitHub. Les prochains enseignants sont ajoutés et retirés via la page **Utilisateurs**. Chaque enseignant autorisé a ce droit. Retirer une adresse coupe immédiatement son accès aux données, y compris si une session est encore ouverte. La suppression du dernier accès est bloquée. Un enseignant peut se retirer si un autre accès actif subsiste. Le retrait supprime l’autorisation, pas le compte Supabase Auth ni l’historique des interventions.

Dans **Authentication → Sign In / Providers**, activer **Email**, conserver la confirmation des emails, désactiver Google si inutilisé et ne pas activer les inscriptions anonymes. Conserver les modèles email comportant le lien `{{ .ConfirmationURL }}` pour **Confirm signup** et **Magic link**. L’enseignant saisit son adresse puis ouvre le lien dans le même navigateur.

### Envoi des emails

Le service email par défaut de Supabase est destiné aux essais et n’envoie qu’aux adresses de l’équipe du projet. Pour les enseignants, configurer un serveur **SMTP** dans les réglages d’envoi d’emails de Supabase (service du lycée ou prestataire d’envoi).

Les identifiants SMTP restent dans Supabase. Ne pas les mettre dans GitHub ou dans les variables VITE. Il n’est pas nécessaire de donner aux enseignants un accès administrateur au projet Supabase.

## Héberger sur Cloudflare Pages via GitHub

Dans Cloudflare **Workers & Pages**, créer un projet **Pages** depuis le dépôt `Mirdin69/Maintenance_LM`.

| Réglage | Valeur |
|---|---|
| Branche de production | `main` |
| Framework | React / Vite |
| Commande de compilation | `npm run build` |
| Dossier de sortie | `dist` |
| Dossier racine | racine du dépôt |
| Version Node | `22` ou plus |

Variables de compilation :

```
VITE_SUPABASE_URL=https://dzktjhiosaypezrvhhjw.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=la_cle_publishable_du_projet
```

Utiliser la clé **publishable** (`sb_publishable_…`) disponible dans les réglages API Supabase, ou la clé historique **anon**. Jamais de clé **secret**, **service_role** ou de mot de passe PostgreSQL : ces variables sont publiques dans le navigateur. Les droits sont contrôlés dans la base, pas par le secret de cette clé. Si les variables sont absentes, seul l’aperçu fonctionne. Redéployer après une modification des variables.

Après publication, dans Supabase **Authentication → URL Configuration**, renseigner l’adresse Cloudflare comme **Site URL**, et cette même adresse avec `/` final dans **Redirect URLs**. Ne pas inventer l’adresse Cloudflare : utiliser celle fournie après déploiement. Faire de même pour un éventuel domaine du lycée.

## Protections et fonctionnement

- Les enseignants autorisés partagent les données ; aucun circuit d’approbation par rôle n’est défini.
- RLS refuse les lectures aux comptes hors liste. Les mutations PostgreSQL vérifient à nouveau le compte, son email confirmé et son autorisation.
- La liste des enseignants est visible seulement aux enseignants autorisés. Aucun visiteur public ne peut la lire ou la modifier.
- Les réservations se chevauchant sur un même système sont refusées dans une transaction avec verrouillage.
- Une nouvelle réservation est refusée pour un système indisponible. Un changement de statut d’un système ne supprime pas les réservations déjà enregistrées.
- Un système lié à un suivi doit être archivé plutôt que supprimé.
- Les mises à jour des interventions et achats conservent leur auteur et leurs remarques dans l’historique.
- L’aperçu public utilise uniquement des exemples non enregistrables.

## Vérifier avant ouverture

Tester la connexion email réelle, la persistance après rechargement, le refus d’un compte hors liste, l’ajout d’un collègue, puis le retrait de son accès alors qu’il est connecté. Vérifier également les réservations concurrentes depuis deux navigateurs. L’envoi d’email et l’hébergement réels nécessitent les réglages des comptes et ne sont pas simulés par les tests.

## Développement

```
npm ci
cp .env.example .env
# Renseigner la clé publique dans .env
npm run dev
npm test
npm run build
```

Pour un test local, autoriser explicitement `http://localhost:5173/` dans les redirections Supabase. Les tests PostgreSQL embarqués couvrent les protections, l’historique, les réservations, la migration et la gestion des enseignants, sans accéder au projet réel.

## Documentation officielle

- [Cloudflare Pages : React](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/)
- [Supabase : connexion par email](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Supabase : SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase : restrictions d’inscription](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook)
