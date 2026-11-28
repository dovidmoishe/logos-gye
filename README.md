# Logos

An npm workspaces monorepo for the web dashboard, local demo API and native SwiftUI app for Scripture, private check-ins and DNS protection.

| Path | Purpose |
| --- | --- |
| apps/dashboard | Next.js App Router UI with Zustand, Axios and Tailwind CSS |
| apps/api | NestJS Scripture, account, device and partner APIs with Drizzle ORM and PostgreSQL 17 + pgvector |
| apps/ios | Native Xcode project and physical-device verification guide |
| infra | Docker build targets and local Compose stack |
| .github/workflows | Node and iOS CI |

## Run locally

Use Node 22.16 or later. From the root, run `npm ci`, start PostgreSQL with `docker compose -f infra/compose.yaml up -d --wait postgres`, then run `npm run dev`. An existing PostgreSQL server also works when DATABASE_URL points to a dedicated database. Open http://localhost:3000. Next.js proxies /api to NestJS on port 3001. Use `npm test` for API checks and `npm run build` for both JavaScript applications.

Alternatively, run `docker compose -f infra/compose.yaml up --build`. The dashboard listens on localhost:3000 and Compose persists PostgreSQL in a named volume.

## Demo boundaries

Open `/demo` to explore the sample workspace with fictional addresses. Its API persists invitations in a browser-specific workspace identified by an HTTP-only cookie. Recipient decisions are simulated and no email is sent. Device information and report counts are fixtures. The iPhone app continues to verify real DNS behavior locally. The main dashboard uses authenticated accounts and recipient decisions. Open **Partners** for live invitations and **Devices** for signed-in iPhones.

## Database

The default local connection is `postgresql://logos:logos_local@127.0.0.1:5433/logos_gye`. Set DATABASE_URL for a different server. The API applies checked-in Drizzle migrations on startup. After editing apps/api/src/db/schema.ts, run `npm run db:generate -w @logos/api` and review the generated SQL. API tests run against PostgreSQL and clean up their own workspaces.

To upgrade an existing SQLite demo, stop writes to the old API, back up its database, and run `npm run db:import-sqlite -w @logos/api -- /absolute/path/to/demo.sqlite`. This preserves workspace cookies, agreement IDs and ordering. It leaves the source file intact and skips already imported IDs on retry.

API_ORIGIN sets the Next.js proxy upstream at build time.

## Scripture and Logos accounts

Logos issues its own passwordless sessions. The dashboard and iPhone request an eight-digit code from `POST /api/auth/otp` and submit the code and returned challenge to `POST /api/auth/verify`. Codes expire after ten minutes, allow five guesses, and can be used once. Sessions last 30 days. The dashboard uses an HTTP-only cookie and the iPhone stores its bearer token in Keychain.

Configure `SENVIOK_API_KEY` and the verified `PARTNER_MAIL_FROM` on the API, or use `PARTNER_SMTP_URL` for local Mailpit delivery. Both clients prompt for email again after upgrading. Verification reuses the existing local reading UUID for that email, preserving devices and partner relationships. The API still accepts valid Supabase JWTs from older clients and supports the legacy pilot dashboard login.

To restore a full local backup into an empty database on a PostgreSQL server with pgvector installed, use `pg_restore --exit-on-error --single-transaction --no-owner --no-acl -d NEW_DATABASE /path/to/logos-local.dump`. Point DATABASE_URL at that database before starting Nest. A six-table hosted Scripture dump is a content archive and requires the application schema before data-only restore.

For a fresh development database without a dump, run `npm run seed:scripture -w @logos/api` after starting Nest once. This loads the KJV and generates starter topic associations. The hosted Scripture archive includes the original IDs, embeddings and trained relevance scores. Use that archive for parity with the original Logos content.

| Endpoint under /api/reading | Access and purpose |
| --- | --- |
| GET /discover, GET /verses/:id/chapter | Guest discovery and ordered chapter text |
| GET /feed, GET /library | Signed-in ranked feed, cursor pagination, saved verses, likes and selected topics |
| GET /topics, POST /onboarding/topics | Browse topics and select up to ten |
| POST /interactions | Record reading actions with a per-request ID for retry handling |
| GET and PATCH /users/me | Read and edit the signed-in reader’s profile |

When the Mac email-test stack is running, open [the local dashboard](http://127.0.0.1:54321/partners) and [Mailpit](http://127.0.0.1:54324). This dashboard uses the same local account and database as the Debug iPhone app. Run `infra/supabase/local/start.sh` to start or update the stack.

## Account and iPhone pilot

Sign in to Logos on the iPhone and on the dashboard with the same account. The iPhone appears under **Devices** automatically. In **Protection**, tap **Run and save safe check** to see the result and its server receipt time on the dashboard. The legacy pairing pass is available for guest apps. Disconnect removes the device until the owner explicitly reconnects it.

The local simulator can reach the dashboard at http://127.0.0.1:3000. A physical phone needs a trusted HTTPS dashboard origin reachable from the phone, with /api proxied to the same API. The default development server is loopback-only. Set COOKIE_SECURE=true when serving through HTTPS. Automatic migrations add the account and device tables. The separate partner demo continues to use its original browser cookie.

| Pilot endpoint | Purpose |
| --- | --- |
| POST /api/account/register, POST /api/account/login | Create an account or authenticate with username and password. Establish a 30-day HTTP-only session. |
| GET /api/account, DELETE /api/account/session | List the signed-in owner's devices or invalidate the current session. |
| POST /api/account/devices, DELETE /api/account/devices/:id | Issue a 10-minute, single-use pairing pass or revoke a device. |
| GET, POST /api/account/agreements | List agreements or invite a partner email or an existing pilot username under the weekly grouped-count scope. |
| PATCH /api/account/agreements/:id | Accept or decline as recipient, or revoke as a party to the agreement. |
| GET /api/account/agreements/:id/report | Read the most recent completed UTC week under a connected agreement. |
| POST /api/account/devices/connect, POST /api/account/devices/check | Connect a signed-in installation or save its diagnostic result. |
| PATCH /api/account/agreements/:id/alerts, GET /api/account/agreements/:id/activity | Set your own check-in email preference or read scoped current-week activity. |
| POST /api/device/pair | Exchange a pass for a device credential. iOS stores it in Keychain. |
| POST /api/device/checks | Use the device bearer credential to replace its latest check with blocked, open or unknown. |

Only credential digests are persisted on the server. The device endpoint accepts synthetic check outcomes independently of partner reporting. No general browsing activity is uploaded. Partners sign in to review invitations in the dashboard. Invitations appear when the recipient signs in with the invited address. Connected parties can open the weekly report on the dashboard or iPhone. The first eligible week begins on or after acceptance. Missing telemetry is shown as unavailable. The local stack delivers invitation and report-ready emails to Mailpit. A trusted operator can publish a complete, device-scoped Gateway export. The shared Families resolver supplies no export. See [pilot report operations](docs/weekly-reports.md).

Production runs on a single VPS behind Caddy. See the [production deployment guide](infra/production/README.md) for container releases, verification, backups and mail configuration.
