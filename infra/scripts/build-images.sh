#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
: "${SOURCE_SHA:?SOURCE_SHA is required}"
: "${SOURCE_REVISION:?SOURCE_REVISION is required}"
: "${SOURCE_URL:?SOURCE_URL is required}"
: "${IMAGE_TAG_SUFFIX:?IMAGE_TAG_SUFFIX is required}"

if [[ ! "$GCP_PROJECT_ID" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]]; then
  echo "Invalid GCP_PROJECT_ID" >&2
  exit 2
fi
if [[ ! "$SOURCE_SHA" =~ ^[a-f0-9]{40}$ ]]; then
  echo "SOURCE_SHA must be a complete 40-character Git commit SHA" >&2
  exit 2
fi
if [[ "$SOURCE_REVISION" != "$SOURCE_SHA" ]]; then
  echo "SOURCE_REVISION must equal the reviewed SOURCE_SHA" >&2
  exit 2
fi
if [[ ! "$SOURCE_URL" =~ ^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(\.git)?$ ]]; then
  echo "SOURCE_URL must be an HTTPS GitHub repository URL" >&2
  exit 2
fi
if [[ ! "$IMAGE_TAG_SUFFIX" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$ ]]; then
  echo "IMAGE_TAG_SUFFIX contains invalid Docker tag characters" >&2
  exit 2
fi

region="europe-southwest1"
image_prefix="${region}-docker.pkg.dev/${GCP_PROJECT_ID}/proxus"
tag="sha-${SOURCE_SHA}-${IMAGE_TAG_SUFFIX}"
args=(
  builds submit "$SOURCE_URL"
  --project "$GCP_PROJECT_ID"
  --region "$region"
  --config infra/cloudbuild/images.yaml
  --service-account "proxus-cloud-build@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
  --git-source-revision "$SOURCE_REVISION"
  --substitutions "_IMAGE_PREFIX=${image_prefix},_IMAGE_TAG=${tag},_SOURCE_SHA=${SOURCE_SHA}"
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
resolved_revision="$(jq -r '.sourceProvenance.resolvedRepoSource.commitSha // empty' <<< "$build_result")"
if [[ "$resolved_revision" != "$SOURCE_SHA" ]]; then
  echo "Cloud Build provenance ${resolved_revision:-<missing>} does not match ${SOURCE_SHA}" >&2
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
