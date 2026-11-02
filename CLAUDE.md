# Kubi - gestion de budget

Le nom vient du dieu Kubera, un dieu de la richesse, traditionnellement gardien des trésors dans les traditions hindoues et bouddhiques. 

Il s'agit d'une application web fullstack (front React, API sur GCP) qui permet de gérer son budget : catégorisation des opérations, suivi de plusieurs lignes de budget, synthèse au changement de mois... 

# Fondations techniques

## Source de données

Les données (opérations, catégories, membres, configuration) sont stockées dans Firestore et servies par une API sur Cloud Run. Google Drive ne sert plus qu'à déposer les fichiers exportés de l'application bancaire de l'utilisateur, que le serveur lit pour en extraire les opérations.

## Authentification

L'utilisateur se connecte avec son compte Google (Firebase Auth). Le serveur vérifie l'ID token à chaque requête et n'accepte que les emails de la liste des membres, stockée en base. Le premier membre est fixé par la configuration du déploiement.

Un membre peut en inviter un autre en ajoutant son email à la liste, puis en lui envoyant l'adresse de l'application.

# Import des opérations

Toutes les 10 minutes (Cloud Scheduler), et à la demande depuis l'application, le dossier Google Drive configuré est scanné par le serveur pour vérifier la présence de nouveaux fichiers d'exports, sur le modèle de @export-operations-28-10-2026_13-31-55.csv (le modèle du nom de fichier et la structure interne de celui-ci sont à considérer). Les opérations sont importées dans la base de l'application. Chaque opération se verra attribuer un ID construit sur la base des colonnes suivantes : 
- Date Opération
- Date Valeur
- Libellé
- Solde (la première colonne Solde, il y en a deux; la première étant le montant de la transaction, la seconde étant le solde du compte après la transaction)

L'import est verrouillé pendant qu'il se fait, pour que deux exécutions ne se chevauchent pas. 

Comme plusieurs fichiers d'exports bancaires peuvent contenir la même opération, la détection dans un nouveau fichier d'un ID existant doit l'ignorer si l'opération est identique, et sinon afficher une alerte demandant à l'utilisateur quoi faire (garder l'ancienne ou garder la nouvelle).

# Représentation des opérations dans l'application

- Date : basé sur la colonne "Date Opération"
- Libellé : basé sur la colonne "Libellé"
- Montant : basé sur la colonne "Solde" (la première)
- Description : éditable par l'utilisateur
- Catégorie : selong une liste de catégories prédéfinies (voir plus bas)
- Mois : à quel mois appartient l'opération; par défaut le mois de la colonne Date, mais peut être amendé (voir plus bas)

# Gestion des mois

Le but de l'application est de gérer le budget du mois en cours (par défaut le plus récent, sélectionné au chargement de l'application, mais l'utilisateur peut basculer sur un autre mois). Or un mois ne démarre pas au 1er jour calendaire, mais au moment d'une opération que l'utilisateur marque d'un drapeau "Changement de mois". Lorsqu'il effectue cette action, toutes les opérations plus récentes, ainsi que toutes celles qui seront importées plus tard, seront classées dans le nouveau mois si leur date indiquait autrement un mois antérieur. Par exemple si on démarre le mois de novembre 2026, toutes les opérations après cette marque qui seraient datées d'octobre 2026 ou avant seront classifiées en novembre; par contre si leur date est en décembre 2026 ou après, elles conservent leur mois par défaut. 

# Catégories et budgets

L'utilisateur peut créer plusieurs catégories (nom + couleur, couleur automatiquement suggérée pour se distinguer des catégories existantes), et optionellement attribuer un budget maximum par mois pour la catégorie (par exemple : "Livres - 120 euros"). De plus certaines catégories peuvent être marquées comme participant au montant du budget total (voir ci dessous).

Dans la liste des opérations, il peut ensuite assigner une catégorie à chaque opération. 

Quand l'utilisateur sélectionne une description existante pour une opération, si cette opération n'a pas de catégorie, la même catégorie que la dernière opération qui portait cette description est assignée automatiquement. 

En regard de la liste des opérations, une synthèse des budgets est affichée pour le mois sélectionné : 
- pour chaque catégorie ayant un budget : 
  - nom de la catégorie
  - euros dépensés / budget total
  - consommation du budget en pourcentage
  - un statut Alerte (orange) si > 80% du budget, Dépassé si > 100%
- un budget total : même découpage, mais calculé dynamiquement; le montant du budget total étant la somme des opérations dans les catégories marquées comme participant au montant du budget total; toutes les autres opérations constituant les débits et crédits de ce budget total. Par exemple une catégorie Salaire est marquée, et 2 opérations de 2000 et 800 euros sont enregistrées -> budget total de 2800 euros; toutes les autres opérations d'autres catégories cumulent 1400 euros -> budget total 1400 / 2800, 50%.

# Renflouage

Certaines catégories peuvent être marquées comme catégories de renflouage, et la vue montrant la symthèse des budgets doit également afficher le montant total de renflouage (virements vers le compte pour éviter un découvert). 

# Statistiques et bilan de fin de mois

Une autre vue doit permettre d'afficher des statistiques sur le long terme : respect et dépassement des budgets au cours des mois, renflouages au cours des mois...

Quand un nouveau mois est démarré, chaque instance de l'application doit afficher une fois à l'utilisateur (statut lu stocké au niveau du navigateur) une synthèse du mois précédent, dans un dialogue au dessus du reste de l'interface. Quels budgets ont été respectés ou dépassés, le montant de renflouage, le budget total. 
# Décisions de conception

## Stack
- npm workspaces : `packages/domain` (logique métier pure, partagée), `web` (Vite + React + TypeScript), `server` (Node, Hono, firebase-admin).
- Hébergement : Firebase Hosting pour le front, avec `/api/**` redirigé vers Cloud Run `kubi-api` ; Firestore ; Cloud Scheduler pour l'import. Mise en place décrite dans `infra/README.md`, déploiement par GitHub Actions (fédération d'identité, pas de clé).
- Recharts pour les graphiques, Vitest pour la logique métier et le serveur (store en mémoire et faux Drive, pas d'émulateur).
- Interface en français uniquement, euros uniquement, mise en page responsive (sur mobile, la synthèse passe au-dessus de la liste).

## Accès Google Drive et utilisateurs
- Drive est lu par le compte de service de l'API (`kubi-api@`), avec lequel l'utilisateur partage le dossier des exports en éditeur. Plus de Client ID OAuth, ni d'utilisateurs de test.
- La configuration (dossier choisi) est en base, commune à tous les membres. Choix du dossier via un navigateur interne, parmi les dossiers partagés avec le compte de service.
- Membres : collection Firestore ; tout membre peut en ajouter ou en retirer (sauf lui-même).
- Développement local sans GCP : `KUBI_DEV_EMAIL` (connexion simulée, store en mémoire) et `KUBI_DEV_DRIVE_DIR` (un dossier local tient lieu de Drive).

## Concurrence et synchronisation
- Toute modification passe par une commande (`packages/domain/src/commands.ts`) : le front l'applique aussitôt pour l'affichage, le serveur l'applique sur ses données dans une transaction Firestore.
- Un compteur de version unique (`meta/config.version`) est relu dans chaque transaction et incrémenté à chaque écriture : une écriture faite sur des données périmées est refusée et rejouée. Le serveur garde les données en mémoire tant que la version ne bouge pas.
- Le serveur écrit seulement les documents modifiés (diff de deux `DataFile`) ; l'ID de document d'une opération est un hash de son ID métier.
- L'import prend un verrou `locks/import` avec expiration (~2 min).
- Le front relit les données (si la version a changé) toutes les 10 min et au retour du focus. Sans accès au serveur, l'app est en lecture seule.

## Import
- Seuls les fichiers `export-operations-DD-MM-YYYY_HH-MM-SS.csv` sont importés, dans l'ordre chronologique du timestamp du nom. Fichier à l'en-tête invalide : alerte (stockée en base, levée une seule fois même après avoir été fermée), laissé en place.
- Format : UTF-8 avec BOM, séparateur `;`, montant (premier `Solde`) avec virgule décimale. Le second `Solde` est un solde de fin de journée (identique pour toutes les opérations d'un même jour), il n'ordonne rien.
- Une fois importé, le fichier est déplacé dans un sous-dossier `importés/`.
- Un seul compte bancaire : le premier `Numéro Compte` rencontré est mémorisé ; un fichier contenant un autre numéro déclenche une alerte.
- ID = Date Opération + Date Valeur + Libellé + montant + indice d'occurrence (rang parmi les lignes ayant ces 4 champs identiques **dans un même fichier** ; 0 pour une opération unique, donc stable d'un export à l'autre).
- Un ID déjà présent est ignoré silencieusement (pas d'alerte : tous les champs affichés font partie de l'ID).
- Doublons manuels : l'utilisateur sélectionne deux opérations et choisit celle à garder ; l'autre est supprimée, son ID est ajouté à `ignoredIds` (jamais réimporté), et sa description / catégorie / drapeau de changement de mois sont reportés sur celle gardée si elle n'en a pas.
- L'ordre d'apparition dans l'export est mémorisé à l'import.
- Pas de catégorisation automatique à l'import en v1.

## Mois
- Ordre total des opérations : date d'opération, puis ordre d'import.
- En posant le drapeau « Changement de mois », l'utilisateur choisit le mois qui démarre ; défaut = mois de l'opération + 1 si elle tombe après le 15, sinon le mois de l'opération.
- Le mois de chaque opération est aussi éditable à la main ; ce choix l'emporte sur la règle du drapeau.
- Le drapeau ne reclasse que les opérations qui le suivent : une opération placée avant lui garde son mois calendaire, même si elle tombe dans le mois qu'il démarre (ex. une opération du 1er novembre avant un drapeau posé le 2 novembre reste en novembre). La correction se fait à la main.

## Catégories et budgets
- Calculs en net : un remboursement réduit la consommation du budget de sa catégorie.
- « Participe au budget total » (revenus) et « renflouage » sont exclusifs ; une catégorie de revenus n'a pas de plafond.
- Les plafonds sont historisés : une modification prend effet à partir d'un mois donné ; les mois passés gardent leur valeur d'alors.
- Suppression d'une catégorie utilisée : interdite tant que ses opérations ne sont pas réassignées (ou laissées sans catégorie).
- Les catégories de renflouage sont exclues du calcul du budget total et affichées séparément.
- Les opérations sans catégorie comptent dans la consommation du budget total ; la synthèse affiche « N opérations non catégorisées ».

## Statistiques et bilan
- Vue Statistiques : tableau catégorie × mois (% consommé, statut OK/Alerte/Dépassé) sur 12 mois glissants ; graphique budget total (revenus vs consommé) par mois ; histogramme des renflouages par mois.
- Bilan : affiché dès qu'une instance détecte un mois plus récent que le dernier bilan vu dans ce navigateur ; ne présente que le dernier mois terminé (les mois sautés restent consultables dans les Statistiques).
