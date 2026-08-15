#!/usr/bin/env bash
set -euo pipefail

normalize_service_account() {
  local project_id="$1"
  local configured="$2"
  local email="$configured"
  local prefix="projects/${project_id}/serviceAccounts/"

  if [[ "$configured" == projects/* ]]; then
    if [[ "$configured" != "${prefix}"* ]]; then
      return 1
    fi
    email="${configured#"$prefix"}"
    # Reject resource names with extra path components or any non-canonical spelling.
    if [[ "${prefix}${email}" != "$configured" ]]; then
      return 1
    fi
  fi

  if [[ ! "$email" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]@([a-z][a-z0-9-]{4,28}[a-z0-9])\.iam\.gserviceaccount\.com$ ]] ||
    [[ "${BASH_REMATCH[1]}" != "$project_id" ]]; then
    return 1
  fi
  printf 'projects/%s/serviceAccounts/%s\n' "$project_id" "$email"
}

run_service_account_tests() {
  local project="proxus-v2"
  local email="proxus-cloud-build@${project}.iam.gserviceaccount.com"
  local resource="projects/${project}/serviceAccounts/${email}"
  [[ "$(normalize_service_account "$project" "$email")" == "$resource" ]]
  [[ "$(normalize_service_account "$project" "$resource")" == "$resource" ]]
  for invalid in \
    "serviceAccount:${email}" \
    "proxus-cloud-build@other-project.iam.gserviceaccount.com" \
    "projects/other-project/serviceAccounts/${email}" \
    "projects/${project}/serviceAccounts/${email}/keys/key" \
    "${email} "; do
    if normalize_service_account "$project" "$invalid" >/dev/null 2>&1; then
      echo "service account test unexpectedly accepted: ${invalid}" >&2
      return 1
    fi
  done
  echo "service account normalization tests passed"
}

if [[ "${1:-}" == "--test" ]]; then
  run_service_account_tests
  exit
fi

: "${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
: "${SOURCE_SHA:?SOURCE_SHA is required}"
: "${IMAGE_TAG_SUFFIX:?IMAGE_TAG_SUFFIX is required}"

manual_context_tar="${SOURCE_CONTEXT_TAR:-}"
manual_context_uri="${SOURCE_CONTEXT_GCS_URI:-}"
if [[ -n "$manual_context_tar" ]]; then
  : "${SOURCE_CONTEXT_GCS_URI:?SOURCE_CONTEXT_GCS_URI is required with SOURCE_CONTEXT_TAR}"
  if [[ ! -f "$manual_context_tar" ]] || [[ "$manual_context_uri" != gs://*/*.tar.gz ]]; then
    echo "Manual context must be an existing .tar.gz and SOURCE_CONTEXT_GCS_URI must be a gs://.../*.tar.gz URI" >&2
    exit 2
  fi
else
  : "${SOURCE_REVISION:?SOURCE_REVISION is required for Git source}"
  : "${SOURCE_URL:?SOURCE_URL is required for Git source}"
fi

if [[ ! "$GCP_PROJECT_ID" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]]; then
  echo "Invalid GCP_PROJECT_ID" >&2
  exit 2
fi
if [[ ! "$SOURCE_SHA" =~ ^[a-f0-9]{40}$ ]]; then
  echo "SOURCE_SHA must be a complete 40-character Git commit SHA" >&2
  exit 2
fi
if [[ -z "$manual_context_tar" ]]; then
  if [[ "$SOURCE_REVISION" != "$SOURCE_SHA" ]]; then
    echo "SOURCE_REVISION must equal the reviewed SOURCE_SHA" >&2
    exit 2
  fi
  if [[ ! "$SOURCE_URL" =~ ^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(\.git)?$ ]]; then
    echo "SOURCE_URL must be an HTTPS GitHub repository URL" >&2
    exit 2
  fi
fi
if [[ ! "$IMAGE_TAG_SUFFIX" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$ ]]; then
  echo "IMAGE_TAG_SUFFIX contains invalid Docker tag characters" >&2
  exit 2
fi

configured_service_account="${GCP_CLOUD_BUILD_SERVICE_ACCOUNT:-proxus-cloud-build@${GCP_PROJECT_ID}.iam.gserviceaccount.com}"
if ! build_service_account="$(normalize_service_account "$GCP_PROJECT_ID" "$configured_service_account")"; then
  echo "GCP_CLOUD_BUILD_SERVICE_ACCOUNT must be an email in ${GCP_PROJECT_ID} or its exact full resource name" >&2
  exit 2
fi

region="europe-southwest1"
image_prefix="${region}-docker.pkg.dev/${GCP_PROJECT_ID}/proxus"
tag="sha-${SOURCE_SHA}-${IMAGE_TAG_SUFFIX}"
source_url=""
source_hash_base64=""
cloudbuild_config="infra/cloudbuild/images.yaml"
if [[ -n "$manual_context_tar" ]]; then
  # Upload and submit the exact same archive bytes. The build config is read from
  # that archive too, never from the ambient checkout.
  source_context_sha256="$(sha256sum "$manual_context_tar" | cut -d ' ' -f 1)"
  source_hash_base64="$(openssl dgst -sha256 -binary "$manual_context_tar" | base64 -w0 | tr '+/' '-_')"
  cloudbuild_config="$(mktemp)"
  trap 'rm -f "$cloudbuild_config"' EXIT
  tar -xOzf "$manual_context_tar" infra/cloudbuild/images.yaml > "$cloudbuild_config"
  gcloud storage cp --no-clobber "$manual_context_tar" "$manual_context_uri" --project "$GCP_PROJECT_ID"
  source_argument="$manual_context_uri"
  source_args=()
else
  source_url="${SOURCE_URL%.git}.git"
  source_context_sha256="$(printf '%s\n%s\n' "$source_url" "$SOURCE_SHA" | sha256sum | cut -d ' ' -f 1)"
  source_argument="$source_url"
  source_args=(--git-source-revision "$SOURCE_REVISION")
fi
args=(
  builds submit "$source_argument"
  --project "$GCP_PROJECT_ID"
  --region "$region"
  --config "$cloudbuild_config"
  --service-account "$build_service_account"
  "${source_args[@]}"
  --substitutions "_IMAGE_PREFIX=${image_prefix},_IMAGE_TAG=${tag},_SOURCE_SHA=${SOURCE_SHA},_SOURCE_CONTEXT_SHA256=${source_context_sha256}"
  --async
  --format=value\(id\)
)

build_id="$(gcloud "${args[@]}")"
if [[ ! "$build_id" =~ ^[A-Za-z0-9-]{8,}$ ]]; then
  echo "Cloud Build did not return a valid build ID" >&2
  exit 1
fi
printf 'cloud_build_id=%s\n' "$build_id"
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  printf 'cloud_build_id=%s\n' "$build_id" >> "$GITHUB_OUTPUT"
fi

deadline=$((SECONDS + 1800))
while true; do
  status="$(gcloud builds describe "$build_id" \
    --project "$GCP_PROJECT_ID" \
    --region "$region" \
    --format='value(status)')"
  case "$status" in
    SUCCESS)
      break
      ;;
    FAILURE|INTERNAL_ERROR|TIMEOUT|CANCELLED|EXPIRED)
      echo "Cloud Build ${build_id} finished with status ${status}" >&2
      exit 1
      ;;
    QUEUED|PENDING|WORKING)
      if (( SECONDS >= deadline )); then
        echo "Timed out waiting for Cloud Build ${build_id}" >&2
        exit 1
      fi
      sleep 10
      ;;
    *)
      echo "Cloud Build ${build_id} returned unexpected status ${status}" >&2
      exit 1
      ;;
  esac
done

if ! command -v jq >/dev/null; then
  echo "jq is required to validate Cloud Build results" >&2
  exit 2
fi
build_result="$(gcloud builds describe "$build_id" \
  --project "$GCP_PROJECT_ID" \
  --region "$region" \
  --format=json)"
# Git builds attest URL/revision. Manual builds instead attest the exact uploaded
# archive through resolvedStorageSource and Cloud Build's SHA-256 fileHashes.
provenance_filter="$(dirname "$0")/validate-build-provenance.jq"
if ! jq -e \
  --arg mode "$(if [[ -n "$manual_context_tar" ]]; then echo storage; else echo git; fi)" \
  --arg project "$GCP_PROJECT_ID" \
  --arg sha "$SOURCE_SHA" \
  --arg url "$source_url" \
  --arg storage_uri "$manual_context_uri" \
  --arg source_hash "$source_hash_base64" \
  --arg prefix "$image_prefix" \
  --arg tag "$tag" \
  --arg context "$source_context_sha256" \
  -f "$provenance_filter" <<< "$build_result" >/dev/null; then
  echo "Cloud Build source provenance or immutable substitutions do not match the authorized context" >&2
  exit 1
fi

for entry in \
  "public_image:proxus-server" \
  "admin_image:proxus-admin-server" \
  "web_image:proxus-web" \
  "admin_web_image:proxus-admin-web"; do
  key="${entry%%:*}"
  image="${entry#*:}"
  tagged_image="${image_prefix}/${image}:${tag}"
  digest="$(jq -r --arg image "$tagged_image" '
    [.results.images[]? | select(.name == $image) | .digest] |
    if length == 1 then .[0] else empty end
  ' <<< "$build_result")"
  if [[ ! "$digest" =~ ^sha256:[a-f0-9]{64}$ ]]; then
    echo "Cloud Build did not publish a valid digest for ${image}" >&2
    exit 1
  fi
  value="${image_prefix}/${image}@${digest}"
  printf '%s=%s\n' "$key" "$value"
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    printf '%s=%s\n' "$key" "$value" >> "$GITHUB_OUTPUT"
  fi
done
