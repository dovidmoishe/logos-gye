#!/bin/bash
set -euo pipefail
umask 077
cd /opt/logos/infra/production
dir=/var/backups/logos
install -d -m 700 "$dir"
tmp=$(mktemp "$dir/.pgdump.XXXXXX")
trap 'rm -f "$tmp"' EXIT
docker compose --env-file .env --env-file images.env exec -T db pg_dump -U logos -d logos -Fc > "$tmp"
docker compose --env-file .env --env-file images.env exec -T db pg_restore --list < "$tmp" >/dev/null
mv "$tmp" "$dir/logos-$(date -u +%Y%m%dT%H%M%SZ).dump"
find "$dir" -name 'logos-*.dump' -type f -mtime +7 -delete
