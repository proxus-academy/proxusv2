#!/usr/bin/env bash
set -euo pipefail

: "${WEB_IMAGE:?WEB_IMAGE is required}"
: "${OUTPUT_DIRECTORY:?OUTPUT_DIRECTORY is required}"

if [[ ! "$WEB_IMAGE" =~ ^[a-z0-9.-]+/[a-z0-9_./-]+@sha256:[a-f0-9]{64}$ ]]; then
  echo "WEB_IMAGE must be an immutable digest URI" >&2
  exit 2
fi
registry="${WEB_IMAGE%%/*}"
gcloud auth configure-docker "$registry" --quiet
docker pull "$WEB_IMAGE"
container="$(docker create "$WEB_IMAGE")"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
rm -rf "$OUTPUT_DIRECTORY"
mkdir -p "$OUTPUT_DIRECTORY"
docker cp "${container}:/app/public/." "$OUTPUT_DIRECTORY"
test -f "${OUTPUT_DIRECTORY}/index.html"
