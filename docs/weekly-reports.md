# Weekly reports on the pilot

A partner receives an invitation email and a sign-in link when a report is ready. The owner and their accepted partner can open the same report in Partners on the dashboard or iPhone. Counts describe grouped DNS requests from one designated iPhone. An app running in the background can cause a request. Neither email includes domains, counts or device details.

## Local delivery

The local stack captures mail at [Mailpit](http://127.0.0.1:54324). Other environments can configure `PARTNER_SMTP_URL`, `PARTNER_MAIL_FROM` and `PARTNER_DASHBOARD_ORIGIN` on the API. Use authenticated TLS SMTP and the public dashboard origin for external delivery. The invitation exists for seven days. A weekly email is eligible only while its report is the latest completed week and the agreement is connected. Legacy pilot usernames have in-app access. The outbox retries SMTP errors and uses a stable Message-ID for each notification. An ambiguous SMTP acknowledgement can still cause duplicate delivery.

## Enroll a reporting source

Cloudflare for Families on the iPhone supports the harmless one-time check. For weekly pilot reporting, separately enroll a consenting test iPhone with Cloudflare Gateway, use an adult-category-only block policy, pair it with its owner's Logos account, and accept the partner agreement. Before enabling Gateway logging, review its collection and retention settings with the device owner. Confirm the provider registration belongs to the paired phone. Bind it using the API workspace and the same DATABASE_URL as the API.

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
