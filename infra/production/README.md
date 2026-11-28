# Logos production

Caddy terminates HTTPS on withlogos.app, redirects the apex to app.withlogos.app, and forwards the dashboard and same-origin API. The DNS hostname exposes the device-authenticated DNS-over-HTTPS path. Only Caddy publishes container ports. The API verifies identities against the hosted Logos Supabase project. The iOS Release configuration targets the public API. Local Debug configuration can still use the Mac.

## Release

After CI succeeds on main, run **Deploy Logos** from GitHub Actions. The workflow publishes Linux images to GHCR and passes their immutable digests to a forced SSH command. The production environment is limited to main. Its SSH key can invoke only the release script; the short-lived GitHub token authenticates the image pull. Database and SMTP credentials live on the VPS. The release checks service health before recording the image pair and attempts to restart the previous images if activation fails. Use backward-compatible database migrations; an image rollback cannot undo a schema change.

On the host, configuration lives in `/opt/logos/infra/production`. Run the following there:

```sh
docker compose --env-file .env --env-file images.env ps
docker compose --env-file .env --env-file images.env logs --tail 50 api
```

Compose, Caddy, AdGuard, backup units and the forced-command script are host configuration. After changing those files, sync them from a trusted operator machine and validate the Compose and Caddy configurations before applying. Recreate Caddy after replacing its bind-mounted file.

## Bootstrap and recovery

Install Docker Engine and Compose v2 on the VPS. Point the apex, app and dns hostnames at it. Copy this directory and its sibling adguard directory to `/opt/logos/infra`. Generate separate random 32-byte hex values for DB_PASSWORD and ADGUARD_DEVICE_SECRET in a root-only .env. Set API_IMAGE and DASHBOARD_IMAGE in images.env. Start the stack with the Compose command above using `up -d --wait`. On a new database the API runs migrations. Restore the six Scripture tables from the content-only backup into empty migrated tables in one transaction. Configure a dedicated restricted SSH key as shown by the release workflow, with a pinned host key in LOGOS_KNOWN_HOSTS.

Install the supplied systemd service and timer. Daily dumps go to /var/backups/logos on this host. Keep an encrypted copy and the resolver secret off-host for recovery from loss of the VPS. Restore into a fresh database with pg_restore --no-owner --no-acl --single-transaction and verify the result before switching the API.

## Mail

Configure PARTNER_MAIL_FROM=dave@withlogos.app after verifying the domain. For Senviok, use mail.senviok.live on 587 or 2525, user api, the provider API key as the password, and STARTTLS. Set PARTNER_SMTP_URL in the root-only .env with a percent-encoded password and requireTLS=true. Recreate the API to pick up settings. Configure the same verified sender separately in hosted Supabase Auth for OTP delivery. While SMTP is unset, the API leaves mail queued and skips delivery.
