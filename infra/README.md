# Infrastructure

Kubi tourne sur un projet GCP :

- **Firebase Hosting** sert le front (`web/dist`) et redirige `/api/**` vers Cloud Run (même origine, pas de CORS).
- **Cloud Run** `kubi-api` (image `server/Dockerfile`) expose l'API, avec le compte de service `kubi-api@`.
- **Firestore** (mode natif, `eur3`) stocke les données ; les règles refusent tout accès direct depuis le navigateur.
- **Firebase Auth** (fournisseur Google) gère la connexion ; le serveur vérifie l'ID token et la liste des membres.
- **Cloud Scheduler** `kubi-import` appelle `POST /internal/import` toutes les 10 min avec un token OIDC de `kubi-scheduler@`.
- **Google Drive** n'est plus utilisé que pour déposer les exports bancaires, dans un dossier partagé avec `kubi-api@`.

## Mise en place

1. Créer le projet GCP, puis l'ajouter à Firebase (console Firebase → Ajouter un projet → choisir le projet existant).
2. Lancer le script, qui active les APIs et crée Firestore, les comptes de service, le dépôt d'images et la fédération d'identité GitHub :
   ```bash
   PROJECT_ID=mon-projet GITHUB_REPO=ganlhi/kubi BOOTSTRAP_ADMIN_EMAIL=moi@gmail.com ./infra/setup.sh
   ```
3. Dans la console Firebase :
   - Authentication → Méthodes de connexion → activer **Google** ;
   - Paramètres du projet → Vos applications → ajouter une **application Web**, et noter `apiKey` et `appId`.
4. Créer les variables GitHub Actions affichées par le script.
5. Pousser sur `main` : la CI teste, construit et déploie l'API puis le front.
6. Relancer `infra/setup.sh` pour créer le job Cloud Scheduler. Il est créé **en pause** : on ne l'active qu'après la migration.
7. Partager le dossier Drive des exports **en éditeur** avec `kubi-api@<projet>.iam.gserviceaccount.com`. Le serveur doit pouvoir déplacer les fichiers importés dans `importés/` : créez ce sous-dossier vous-même si la création échoue.
8. Se connecter avec le compte `BOOTSTRAP_ADMIN_EMAIL` et choisir le dossier. Tant qu'il n'y a aucun membre, seul ce compte est accepté.

## Migration depuis la version Drive seule

1. Faire les étapes ci-dessus jusqu'au choix du dossier.
2. **Geler l'ancienne app** : désactiver GitHub Pages (Settings → Pages) ou y publier une page « Kubi a déménagé », et prévenir les utilisateurs. Sinon elle continue d'écrire `kubi-data.json` et d'importer les CSV vers `importés/`.
3. Dans l'app, « Analyser kubi-data.json » (`POST /api/admin/migrate?dryRun=1`, qui n'écrit rien) : vérifier les nombres d'opérations, catégories, doublons écartés et comptes de répartition.
4. Cocher les comptes qui gardent l'accès. La liste `authorizedEmails` du fichier n'est pas fiable : l'ancienne app y ajoutait toute personne ouvrant l'app avec accès au dossier. Puis « Lancer la reprise ». L'API accepte aussi `{ "exclude": [...] }` à la place de `{ "members": [...] }`.
5. Vérifier que les nombres et la synthèse du mois en cours sont identiques avant et après.
6. Dans Drive, renommer `kubi-data.json` en `kubi-data.migrated.json` (sauvegarde) et supprimer un éventuel `kubi.lock` restant.
7. Activer l'import planifié :
   ```bash
   gcloud scheduler jobs resume kubi-import --location europe-west1
   ```

Le bilan de fin de mois réapparaîtra une fois dans chaque navigateur : la nouvelle adresse a son propre stockage local.

## Retour arrière

Le bouton « Exporter les données » du dialogue Membres (`GET /api/admin/export`, réservé aux membres) télécharge toutes les données au format de l'ancien `kubi-data.json`, liste des membres comprise dans `authorizedEmails`. Pour revenir à la version Drive seule sans perdre les modifications faites entre-temps : mettre le job en pause, déposer cet export comme `kubi-data.json` dans le dossier, puis réactiver GitHub Pages.

## Optionnel : refuser les non-membres dès la connexion

Une blocking function Firebase `beforeSignIn` (nécessite Identity Platform) peut refuser la connexion des comptes absents de la collection `members`. Ce n'est qu'un confort : l'API reste le vrai contrôle d'accès, et n'est pas en place aujourd'hui.

## Développement local

Sans aucun service GCP : données en mémoire, connexion simulée, Drive remplacé par le dossier `dev-drive/` (chaque sous-dossier est un « dossier partagé »).

```bash
npm run dev:local -w server
```

```bash
npm run dev:local -w web
```
