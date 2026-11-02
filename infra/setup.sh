#!/usr/bin/env bash
# One-time (and re-runnable) setup of the GCP project behind Kubi.
#
#   PROJECT_ID=mon-projet GITHUB_REPO=ganlhi/kubi BOOTSTRAP_ADMIN_EMAIL=moi@gmail.com ./infra/setup.sh
#
# Run it once before the first deploy, then once more after it: the Cloud
# Scheduler job needs the Cloud Run service's URL, which only exists then.
# The job is created paused, so it cannot import while the old app still
# does: resume it once the migration is done (see infra/README.md).
# Steps that need the Firebase console are listed in infra/README.md.
set -euo pipefail

: "${PROJECT_ID:?PROJECT_ID manquant}"
: "${GITHUB_REPO:?GITHUB_REPO manquant (ex. ganlhi/kubi)}"
: "${BOOTSTRAP_ADMIN_EMAIL:?BOOTSTRAP_ADMIN_EMAIL manquant}"
REGION="${REGION:-europe-west1}"
FIRESTORE_LOCATION="${FIRESTORE_LOCATION:-eur3}"
SERVICE=kubi-api
SCHEDULER_AUDIENCE=kubi-api-import

API_SA="kubi-api@${PROJECT_ID}.iam.gserviceaccount.com"
SCHEDULER_SA="kubi-scheduler@${PROJECT_ID}.iam.gserviceaccount.com"
DEPLOY_SA="kubi-deployer@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')

exists() { "$@" >/dev/null 2>&1; }
service_account() {
  exists gcloud iam service-accounts describe "$1@${PROJECT_ID}.iam.gserviceaccount.com" ||
    gcloud iam service-accounts create "$1" --display-name "$2"
}
project_role() {
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:$1" --role "$2" --condition None >/dev/null
}

echo "→ APIs"
gcloud services enable \
  run.googleapis.com firestore.googleapis.com drive.googleapis.com cloudscheduler.googleapis.com \
  artifactregistry.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  firebase.googleapis.com firebasehosting.googleapis.com firebaserules.googleapis.com identitytoolkit.googleapis.com

echo "→ Firestore ($FIRESTORE_LOCATION)"
exists gcloud firestore databases describe --database='(default)' ||
  gcloud firestore databases create --location="$FIRESTORE_LOCATION" --type=firestore-native

echo "→ Dépôt d'images"
exists gcloud artifacts repositories describe kubi --location "$REGION" ||
  gcloud artifacts repositories create kubi --repository-format docker --location "$REGION"
# Every deploy pushes an image; keep the last few, so storage stays in the free tier.
CLEANUP_POLICY=$(mktemp)
cat >"$CLEANUP_POLICY" <<'JSON'
[
  { "name": "keep-recent", "action": { "type": "Keep" }, "mostRecentVersions": { "keepCount": 3 } },
  { "name": "delete-older", "action": { "type": "Delete" }, "condition": { "tagState": "any" } }
]
JSON
gcloud artifacts repositories set-cleanup-policies kubi --location "$REGION" --policy "$CLEANUP_POLICY" --no-dry-run >/dev/null
rm -f "$CLEANUP_POLICY"

echo "→ Comptes de service"
service_account kubi-api "Kubi API (Firestore, Drive)"
service_account kubi-scheduler "Kubi : déclencheur des imports"
service_account kubi-deployer "Kubi : déploiement depuis GitHub Actions"
project_role "$API_SA" roles/datastore.user
for role in roles/run.admin roles/artifactregistry.writer roles/firebasehosting.admin roles/firebaserules.admin roles/datastore.indexAdmin roles/serviceusage.serviceUsageConsumer; do
  project_role "$DEPLOY_SA" "$role"
done
# The deployer runs the service as kubi-api.
gcloud iam service-accounts add-iam-policy-binding "$API_SA" \
  --member "serviceAccount:$DEPLOY_SA" --role roles/iam.serviceAccountUser >/dev/null

echo "→ Workload Identity Federation pour $GITHUB_REPO"
exists gcloud iam workload-identity-pools describe github --location global ||
  gcloud iam workload-identity-pools create github --location global --display-name GitHub
exists gcloud iam workload-identity-pools providers describe github --workload-identity-pool github --location global ||
  gcloud iam workload-identity-pools providers create-oidc github \
    --workload-identity-pool github --location global \
    --issuer-uri https://token.actions.githubusercontent.com \
    --attribute-mapping 'google.subject=assertion.sub,attribute.repository=assertion.repository' \
    --attribute-condition "assertion.repository == '${GITHUB_REPO}'"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/attribute.repository/${GITHUB_REPO}" >/dev/null

echo "→ Import planifié"
URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)' 2>/dev/null || true)
if [ -z "$URL" ]; then
  echo "  Service $SERVICE pas encore déployé : relancez ce script après le premier déploiement."
else
  JOB=(--schedule '*/10 * * * *' --time-zone Europe/Paris --location "$REGION" --uri "$URL/internal/import" --http-method POST
    --oidc-service-account-email "$SCHEDULER_SA" --oidc-token-audience "$SCHEDULER_AUDIENCE")
  if exists gcloud scheduler jobs describe kubi-import --location "$REGION"; then
    # Leaves the job paused or running, as it was.
    gcloud scheduler jobs update http kubi-import "${JOB[@]}"
  else
    gcloud scheduler jobs create http kubi-import "${JOB[@]}"
    gcloud scheduler jobs pause kubi-import --location "$REGION"
    echo "  Job kubi-import créé en pause. Après la migration :"
    echo "    gcloud scheduler jobs resume kubi-import --location $REGION"
  fi
fi

cat <<EOF

Variables GitHub Actions à créer (Settings → Secrets and variables → Actions → Variables) :
  GCP_PROJECT_ID            $PROJECT_ID
  GCP_REGION                $REGION
  GCP_WIF_PROVIDER          projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/providers/github
  GCP_DEPLOY_SA             $DEPLOY_SA
  KUBI_API_SA               $API_SA
  KUBI_SCHEDULER_SA         $SCHEDULER_SA
  BOOTSTRAP_ADMIN_EMAIL     $BOOTSTRAP_ADMIN_EMAIL
  VITE_FIREBASE_API_KEY     (console Firebase → Paramètres du projet → Vos applications)
  VITE_FIREBASE_APP_ID      (idem)

Dossier Drive : à partager en éditeur avec $API_SA
EOF
