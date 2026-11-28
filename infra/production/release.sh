#!/bin/bash
# Forced command for the repository's deploy-only SSH key.
set -euo pipefail
umask 077
cd /opt/logos/infra/production
exec 9>.deploy.lock
flock 9
IFS= read -r api
IFS= read -r dashboard
IFS= read -r actor
[[ $api =~ ^ghcr\.io/dovidmoishe/logos-gye-api@sha256:[a-f0-9]{64}$ ]]
[[ $dashboard =~ ^ghcr\.io/dovidmoishe/logos-gye-dashboard@sha256:[a-f0-9]{64}$ ]]
[[ $actor =~ ^[A-Za-z0-9-]+$ ]]
export DOCKER_CONFIG
DOCKER_CONFIG=$(mktemp -d)
candidate=$(mktemp)
trap 'rm -rf "$DOCKER_CONFIG"; rm -f "$candidate"' EXIT
docker login ghcr.io -u "$actor" --password-stdin >/dev/null
printf 'API_IMAGE=%s\nDASHBOARD_IMAGE=%s\n' "$api" "$dashboard" > "$candidate"
compose() { docker compose --env-file .env --env-file "$1" "${@:2}"; }
compose "$candidate" pull api dashboard
if ! compose "$candidate" up -d --wait --wait-timeout 150; then
  if [[ -s images.env ]]; then compose images.env up -d --wait; fi
  exit 1
fi
if [[ -s images.env ]]; then cp images.env previous-images.env; fi
mv "$candidate" images.env
