# Weekly reports on the pilot

A partner receives an invitation email and a sign-in link when a report is ready. The owner and their accepted partner can open the same report in Partners on the dashboard or iPhone. Counts describe grouped DNS requests from one designated iPhone. An app running in the background can cause a request. Neither email includes domains, counts or device details.

## Local delivery

The local stack captures mail at [Mailpit](http://127.0.0.1:54324). Other environments can configure `PARTNER_SMTP_URL`, `PARTNER_MAIL_FROM` and `PARTNER_DASHBOARD_ORIGIN` on the API. Use authenticated TLS SMTP and the public dashboard origin for external delivery. The invitation exists for seven days. A weekly email is eligible only while its report is the latest completed week and the agreement is connected. Legacy pilot usernames have in-app access. The outbox retries SMTP errors and uses a stable Message-ID for each notification. An ambiguous SMTP acknowledgement can still cause duplicate delivery.

## Enroll a reporting source

Cloudflare for Families on the iPhone supports the harmless one-time check. For weekly pilot reporting, separately enroll a consenting test iPhone with Cloudflare Gateway, use an adult-category-only block policy, sign in to its owner's Logos account, and accept the partner agreement. Before enabling Gateway logging, review its collection and retention settings with the device owner. Confirm the provider registration belongs to the paired phone. Bind it using the API workspace and the same DATABASE_URL as the API.

```sh
npm run build -w @logos/api
npm run report:gateway -w @logos/api -- bind AGREEMENT_ID LOGOS_DEVICE_ID CLOUDFLARE_ACCOUNT_ID REGISTRATION_UUID ADULT_POLICY_UUID
```

Confirm attribution by running the harmless DNS check on the enrolled phone. Obtain an NDJSON export scoped to the exact registration, policy and test name. Use the Gateway fields below and RFC3339 UTC timestamps. Run `probe AGREEMENT_ID fixture.ndjson` in place of the bind arguments to print the raw test-request count and grouped count. A cached DNS response can mean the provider sees only one request. The report importer excludes `nudity.testcategory.com` regardless of case or trailing dot.

## Publish the latest complete week

Use the operator importer on trusted local storage. Cloudflare supplies the DNS records. The pilot operator supplies the coverage evidence and manifest. The importer does not fetch Cloudflare logs or verify device uptime. Only mark a day complete after independently confirming the device registration, policy, routing coverage and unsampled export were intact for that whole UTC day. If reliable evidence is unavailable, leave the week unpublished. Traffic volume alone cannot establish coverage.

1. Export only `blockedByCategory` records matching the bound `AccountID`, `RegistrationID` and `PolicyID`. Include those three fields, `ResolverDecision`, `Datetime` and `QueryName`. Use the exact same scope for independent source row totals. The operator's temporary export contains private DNS names. Keep it out of the repository, remove it after processing, and apply the agreed retention to the provider and export destination.
2. Provide seven daily files named `YYYY-MM-DD.ndjson`, starting on Monday at 00:00 UTC. An independently verified empty day uses a zero-byte file. Make a `manifest.json` in the same directory with the bound `account`, `registration`, `policy`, ISO `weekStart`, and a `days` array. Each of the seven ordered entries contains ISO `start`, `completeCoverage` (boolean), `rows` (source row count) and `sha256` (lowercase SHA-256 of the complete file).
3. For automatic publication, place each export under `PARTNER_EXPORT_DIR/AGREEMENT_ID/YYYY-MM-DD/`, using the Monday date. Write all seven files first and rename the finished manifest to `manifest.json` last. The local stack mounts `.data/report-exports` read-only and checks eligible agreements every minute. For an immediate import, run `npm run report:gateway -w @logos/api -- import AGREEMENT_ID /private/export-directory` after the week closes. Grouping joins consecutive requests for the same normalized DNS name within five minutes, including across midnight inside the reporting week. Query type does not affect grouping. The API database stores the resulting count. Importing the same count twice enqueues one notice. A conflicting repeat fails for operator review.

This pilot supports one registration per agreement and the most recently completed Monday–Sunday UTC week. Both acceptance and binding must predate or coincide with its start. Revoking the agreement deletes its binding, queued mail and stored counts. The API prunes aggregates older than 30 days after the week ends on its hourly cleanup. Weekly source exports and device enrollment still require an operator.

[Cloudflare Gateway DNS Logpush fields](https://developers.cloudflare.com/logs/logpush/logpush-job/datasets/account/gateway_dns/) · [Gateway decisions and log availability](https://developers.cloudflare.com/cloudflare-one/insights/logs/dashboard-logs/gateway-logs/)

## This week so far and check-in emails

Signing in on iOS connects the current installation to its Logos account. Existing same-account device connections are reused. Disconnecting the device in the dashboard stops syncing until the owner chooses to reconnect. The ordinary safe check saves its outcome to Devices. A diagnostic check never contributes to the activity count.

The owner can see grouped observations for the current UTC week from the agreement’s bound Gateway device. A closed weekly report still requires complete coverage. In Partners, each person can independently enable **Check-in emails**. When both agree, the partner can see current-week groups observed since both enabled the setting. A fresh block can send the partner a supportive email. The one-hour cooldown covers all domains in that agreement. Events delivered more than 15 minutes late can contribute to the current-week count and skip the email. Turning the setting off cancels pending alerts and removes the partner's live view.

For a deployment with Gateway DNS Logpush, configure a trusted HTTPS destination at `/api/reporting/gateway`. Set `PARTNER_GATEWAY_SECRET` to a random secret of at least 32 characters on the API and use the matching Authorization Bearer header in the Logpush destination. Filter to the pilot registration, the adult-only policy and `blockedByCategory`. Use the six Gateway fields listed above, RFC3339 UTC timestamps, newline-delimited JSON, `max_upload_records=1000` and the minimum batch size limit of 5 MB. The receiver accepts gzipped batches. Only enrolled registrations with an active agreement can contribute observations. The API retains a per-agreement keyed hash of the normalized domain and timestamps for grouping during the current UTC week. The hourly cleanup expires previous-week observations. Rotating the secret changes the hash used to group later retries.

The local development stack captures mail in Mailpit and listens on the Mac. A production Logpush job needs a provider-reachable HTTPS destination and a workspace entitled to export `gateway_dns`. Viewing DNS logs in the dashboard and delivering those logs to Logos are separate capabilities. [Cloudflare HTTP destinations](https://developers.cloudflare.com/logs/logpush/logpush-job/enable-destinations/http/) · [Gateway logging](https://developers.cloudflare.com/cloudflare-one/insights/logs/dashboard-logs/gateway-logs/)

## Local AdGuard pilot

The Mac email-test stack starts AdGuard Home on its private container network. It downloads HaGeZi’s NSFW list (ID 1001), disables AdGuard query logs and statistics, and forwards allowed requests to Cloudflare’s malware-filtering resolver. The Logos API exposes DNS over HTTPS at a signed, device-specific URL returned by the authenticated device connection. Disconnecting the device invalidates that URL. Keep URL paths out of reverse proxy access and error logs.

Run `sh infra/supabase/local/start.sh` to start the stack. By default the returned URL uses `https://localhost:54443`, for tests on the Mac using the local certificate. The iPhone ignores this loopback URL and keeps its existing DNS selection. To enable the account DNS button on a phone, configure `ADGUARD_PUBLIC_ORIGIN` with a stable HTTPS origin reachable on the intended networks, using a certificate iOS already trusts. Route only `/dns-query/` to the Logos API. The AdGuard admin interface stays private. The app checks the diagnostic domain over HTTPS before saving the new profile. Signing out restores the Families resolver for a phone using account DNS.

An A or AAAA sinkhole answer triggers a private classification check. Only matches from the configured adult list enter the live report. The category diagnostic, malware-only responses, allowed domains and locally selected Screen Time shields do not trigger partner emails. The first confirmed adult block automatically links the phone to its owner's connected agreements. A switch from Gateway on the same designated phone keeps existing observations. A different designated phone keeps its binding. The current-week count and mutually enabled check-in emails use the same grouping and cooldown rules as Gateway. Closed-week publication still requires the verified weekly export described above. Local AdGuard supplies observations, without proof of continuous weekly coverage.
