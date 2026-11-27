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

Use fictional addresses. The API persists invitations in a browser-specific workspace identified by an HTTP-only cookie. Recipient decisions are simulated and no email is sent. Device information and report counts are fixtures. The iPhone app continues to verify real DNS behavior locally. Signed-in device accounts use the separate /account view. Recipient authentication, domain-event reporting and delivery are separate work.

## Database

The default local connection is `postgresql://logos:logos_local@127.0.0.1:5433/logos_gye`. Set DATABASE_URL for a different server. The API applies checked-in Drizzle migrations on startup. After editing apps/api/src/db/schema.ts, run `npm run db:generate -w @logos/api` and review the generated SQL. API tests run against PostgreSQL and clean up their own workspaces.

To upgrade an existing SQLite demo, stop writes to the old API, back up its database, and run `npm run db:import-sqlite -w @logos/api -- /absolute/path/to/demo.sqlite`. This preserves workspace cookies, agreement IDs and ordering. It leaves the source file intact and skips already imported IDs on retry.

API_ORIGIN sets the Next.js proxy upstream at build time.

## Scripture and Logos accounts

Both clients use the existing Logos Supabase project for passwordless email authentication. New and returning readers enter their email, then verify the one-time code on the next screen. Nest verifies the JWT issuer, audience, expiry and signature with the project’s public keys. Scripture, topics, interactions, saved state and pilot agreements live in local PostgreSQL. Existing pilot users can still use their legacy dashboard login.

To enable code delivery in a hosted project, connect a custom SMTP sender in Supabase **Authentication → Emails → SMTP Settings**. Under **Templates**, apply [the Logos email body](infra/supabase/email-code.html) to both **Confirm sign up** and **Magic link or OTP**, with the subject “Your Logos sign-in code”. Supabase substitutes the current one-time code for `{{ .Token }}`.

To restore a full local backup into an empty database on a PostgreSQL server with pgvector installed, use `pg_restore --exit-on-error --single-transaction --no-owner --no-acl -d NEW_DATABASE /path/to/logos-local.dump`. Point DATABASE_URL at that database before starting Nest. Supabase authentication continues to use the hosted project. A six-table hosted Scripture dump is a content archive and requires the application schema before data-only restore.

For a fresh development database without a dump, run `npm run seed:scripture -w @logos/api` after starting Nest once. This loads the KJV and generates starter topic associations. The hosted Scripture archive includes the original IDs, embeddings and trained relevance scores. Use that archive for parity with the original Logos content.

| Endpoint under /api/reading | Access and purpose |
| --- | --- |
| GET /discover, GET /verses/:id/chapter | Guest discovery and ordered chapter text |
| GET /feed, GET /library | Signed-in ranked feed, cursor pagination, saved verses, likes and selected topics |
| GET /topics, POST /onboarding/topics | Browse topics and select up to ten |
| POST /interactions | Record reading actions with a per-request ID for retry handling |
| GET and PATCH /users/me | Read and edit the signed-in reader’s profile |

## Account and iPhone pilot

Open **Device account** in the dashboard (route `/account`). Sign in with the code sent to your Logos email, name an iPhone, then create a pairing pass. In the app, open **Protection → Dashboard connection**, paste the pass, and connect. **Run and share safe check** sends the latest synthetic DNS check outcome. Refresh the dashboard to see the result and server receipt time. Disconnect removes the device and invalidates its credential.

The local simulator can reach the dashboard at http://127.0.0.1:3000. A physical phone needs a trusted HTTPS dashboard origin reachable from the phone, with /api proxied to the same API. The default development server is loopback-only. Set COOKIE_SECURE=true when serving through HTTPS. Automatic migrations add the account and device tables. The separate partner demo continues to use its original browser cookie.

| Pilot endpoint | Purpose |
| --- | --- |
| POST /api/account/register, POST /api/account/login | Create an account or authenticate with username and password. Establish a 30-day HTTP-only session. |
| GET /api/account, DELETE /api/account/session | List the signed-in owner's devices or invalidate the current session. |
| POST /api/account/devices, DELETE /api/account/devices/:id | Issue a 10-minute, single-use pairing pass or revoke a device. |
| GET, POST /api/account/agreements | List agreements or invite an existing account under the weekly grouped-count scope. |
| PATCH /api/account/agreements/:id | Accept or decline as recipient, or revoke as a party to the agreement. |
| POST /api/device/pair | Exchange a pass for a device credential. iOS stores it in Keychain. |
| POST /api/device/checks | Use the device bearer credential to replace its latest check with blocked, open or unknown. |

Only credential digests are persisted on the server. The device endpoint accepts synthetic check outcomes independently of partner reporting. No general browsing activity is uploaded. Partners sign in to review invitations in the dashboard. Legacy pilot password recovery UI, real activity ingestion, consent-scoped report generation and digest delivery are still pending.
