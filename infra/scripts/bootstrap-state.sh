#!/usr/bin/env bash
set -euo pipefail

project="${GCP_PROJECT_ID:-proxus-v2}"
region="${GCP_REGION:-europe-southwest1}"
bucket="${PULUMI_STATE_BUCKET:-proxus-v2-pulumi-state}"
keyring="${PULUMI_KMS_KEYRING:-pulumi-state}"
key="${PULUMI_KMS_KEY:-pulumi-secrets}"

if [[ ! "$project" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]]; then
  echo "Invalid GCP project ID" >&2
  exit 2
fi
if [[ "$region" != "europe-southwest1" ]]; then
  echo "Bootstrap is pinned to europe-southwest1" >&2
  exit 2
fi

gcloud services enable storage.googleapis.com cloudkms.googleapis.com --project "$project"

if ! gcloud storage buckets describe "gs://${bucket}" --project "$project" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${bucket}" \
    --project "$project" \
    --location "$region" \
    --uniform-bucket-level-access \
    --public-access-prevention
fi

gcloud storage buckets update "gs://${bucket}" \
  --project "$project" \
  --versioning \
  --uniform-bucket-level-access \
  --public-access-prevention

gcloud storage buckets update "gs://${bucket}" \
  --project "$project" \
  --update-labels=system=proxus-v2,managed-by=bootstrap,purpose=pulumi-state

if ! gcloud kms keyrings describe "$keyring" --project "$project" --location "$region" >/dev/null 2>&1; then
  gcloud kms keyrings create "$keyring" --project "$project" --location "$region"
fi
if ! gcloud kms keys describe "$key" --project "$project" --location "$region" --keyring "$keyring" >/dev/null 2>&1; then
  gcloud kms keys create "$key" \
    --project "$project" \
    --location "$region" \
    --keyring "$keyring" \
    --purpose=encryption \
    --rotation-period=90d \
    --next-rotation-time="$(date -u -d '+90 days' +%Y-%m-%dT%H:%M:%SZ)"
fi

cat <<EOF
State bootstrap ready.
Backend: gs://${bucket}
Secrets provider: gcpkms://projects/${project}/locations/${region}/keyRings/${keyring}/cryptoKeys/${key}
EOF
