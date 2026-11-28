#!/bin/sh
# Run from a Mac on the same Wi-Fi as the test iPhone.
set -eu
umask 077
cd "$(dirname "$0")/../../.."
directory=.data/local-auth
mkdir -p "$directory/tls"
if ! command -v docker >/dev/null && test -x "$HOME/.orbstack/bin/docker"; then
  export PATH="$HOME/.orbstack/bin:$PATH"
fi
name="$(scutil --get LocalHostName).local"
if ! test -s "$directory/tls/key.pem" || ! openssl x509 -in "$directory/tls/cert.pem" -checkend 86400 -noout >/dev/null 2>&1 || ! openssl x509 -in "$directory/tls/cert.pem" -checkhost "$name" -noout | grep -q 'does match'; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 90 -subj "/CN=$name" \
    -addext "subjectAltName=DNS:$name,DNS:localhost,IP:127.0.0.1" -addext 'extendedKeyUsage=serverAuth' \
    -keyout "$directory/tls/key.pem" -out "$directory/tls/cert.pem"
fi
if ! test -s "$directory/keys.env"; then
  node --input-type=module - "$directory/keys.env" <<'JS'
import {generateKeyPairSync, randomBytes, randomUUID} from 'node:crypto';
import {writeFileSync, renameSync} from 'node:fs';
const {privateKey} = generateKeyPairSync('ec', {namedCurve:'P-256'});
const jwk = {...privateKey.export({format:'jwk'}), alg:'ES256', kid:randomUUID(), key_ops:['sign','verify']};
const secret = () => randomBytes(32).toString('hex');
const file = process.argv[2];
writeFileSync(file+'.tmp', "DB_PASSWORD="+secret()+"\nJWT_SECRET="+secret()+"\nJWT_KEYS='"+JSON.stringify([jwk])+"'\n", {mode:0o600});
renameSync(file+'.tmp',file);
JS
fi
if ! grep -q '^PARTNER_GATEWAY_SECRET=' "$directory/keys.env"; then
  printf '\nPARTNER_GATEWAY_SECRET=%s\n' "$(openssl rand -hex 32)" >> "$directory/keys.env"
fi
if ! grep -q '^ADGUARD_DEVICE_SECRET=' "$directory/keys.env"; then
  printf '\nADGUARD_DEVICE_SECRET=%s\n' "$(openssl rand -hex 32)" >> "$directory/keys.env"
fi
export PHONE_ORIGIN="https://$name:54443"
compose() { docker compose --env-file "$directory/keys.env" -f infra/supabase/local/compose.yaml "$@"; }
case "${1:-start}" in
  start) compose up -d --build ;;
  stop)
    compose stop
    rm -f "$directory/Debug.xcconfig"
    exit 0 ;;
  *) echo "Usage: $0 [start|stop]" >&2; exit 2 ;;
esac
# Wait for the API to finish migrations before running the idempotent Scripture seeds.
tries=0
until curl -fsS -o /dev/null http://127.0.0.1:54321/auth/v1/.well-known/jwks.json && compose exec -T db psql -U logos -d logos -Atc "select to_regclass('public.bible_verses') is not null" | grep -qx t; do
  tries=$((tries + 1)); test "$tries" -lt 60 || exit 1
  sleep 2
done
compose exec -T -w /workspace/apps/api api sh -ec 'node dist/reading/jobs/seed-bible.js && node dist/reading/jobs/seed-topics.js && node dist/reading/jobs/seed-topic-links.js'
pin="$(openssl x509 -in "$directory/tls/cert.pem" -outform der | shasum -a 256 | cut -d' ' -f1)"
cat > "$directory/Debug.xcconfig" <<CONFIG
LOGOS_LOCAL_EMAIL_TEST = YES
LOGOS_LOCAL_PAIRING_ORIGIN = https:/\$()/$name:54443
LOGOS_READER_API = https:/\$()/$name:54443
LOGOS_READER_API[sdk=iphonesimulator*] = http:/\$()/127.0.0.1:54321
LOGOS_SIMULATOR_AUTH_ORIGIN[sdk=iphonesimulator*] = http:/\$()/127.0.0.1:54321
LOGOS_READER_CERT_SHA256 = $pin
CONFIG
echo "Logos test inbox is ready at http://127.0.0.1:54324"
