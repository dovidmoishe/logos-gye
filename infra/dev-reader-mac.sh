#!/bin/sh
# Serve the local reader over HTTPS and configure Debug iPhone builds for this Mac.
set -eu
umask 077
cd "$(dirname "$0")/.."
name="$(scutil --get LocalHostName).local"
directory=".data/reader-tls"
mkdir -p "$directory"
cert="$directory/cert.pem"
key="$directory/key.pem"
if ! test -s "$cert" || ! openssl x509 -in "$cert" -checkend 86400 -noout >/dev/null || ! openssl x509 -in "$cert" -checkhost "$name" -noout | grep -q 'does match'; then
  openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 90 -subj "/CN=$name" \
    -addext "subjectAltName=DNS:$name,DNS:localhost,IP:127.0.0.1" \
    -addext "extendedKeyUsage=serverAuth" -keyout "$key" -out "$cert"
fi
pin="$(openssl x509 -in "$cert" -outform der | shasum -a 256 | cut -d' ' -f1)"
cat > .data/reader.xcconfig <<EOF
LOGOS_READER_API = https:/\$()/$name:3443
LOGOS_READER_CERT_SHA256 = $pin
EOF
npm run build -w @logos/api
export LOGOS_TLS_CERT="$PWD/$cert" LOGOS_TLS_KEY="$PWD/$key" HOST=0.0.0.0 PORT=3443
exec node apps/api/dist/main.js
