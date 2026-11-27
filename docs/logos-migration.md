# A native iPhone app for reading, protection and accountability

Build the combined experience in the existing SwiftUI target under `apps/ios`. Bring the Scripture backend from the sibling Logos repo (reviewed at `72e6751`) into `apps/api`. Logos owns the account, device pairing and consent agreements. The existing Next.js dashboard remains the place a partner can sign in and respond to an invitation.

## How the app fits together

Use three tabs. Each has a SwiftUI navigation stack so opening a chapter, checking protection or switching tabs preserves the reader’s place.

| Tab | First screen, top to bottom | Where actions lead |
| --- | --- | --- |
| Home | Compact Home title with Settings in the toolbar. Existing check-in streak and seven-day strip. One **Check in** action. For someone who has started reading, a **Continue reading** row shows the last verse reference. | Check in opens the existing Pause flow as a sheet. Saving dismisses it and updates the strip. Continue reading opens Read at that verse. Settings holds appearance, encouragement style, reminder, account and replay introduction. |
| Read | One verse per vertical page, with the verse text, reference, translation and **Read chapter**. Put Save beside the reference and Like and Share in the action menu. The toolbar opens saved verses and topic preferences. | Read chapter opens the surrounding chapter at the selected verse. Back restores the same card. A saved verse opens directly in context. After a short set of verses, offer **Finish reading** and **Keep reading**. Finish returns to Home. |
| Protection | Current DNS selection, latest safe-check result and its timestamp. Offer **Set up protection** for a new device or **Run safe check** for an enrolled one. Below that, show **Dashboard connection** and **Accountability partner**. | Reuse the native install, selection, probe and removal flows. Keep “Run and share safe check” an explicit action inside Dashboard connection. Partner details show the agreed weekly-count scope and invitation status, with a link to manage the agreement in the dashboard. Label the current sample report as a preview. |

**First launch.** Keep the illustrated introduction, encouragement choice and privacy screen in that order. Finish introduction opens account creation, with sign-in and guest access. Home, Read and Protection are available from the tabs. Returning users can replay the introduction in Settings.

**Visual direction.** Use the pilot’s light canvas, Urbanist headings, Satoshi body text and lilac accent, with its dark appearance option. Keep the three tab titles at the same compact top margin. Put the welcome illustration in onboarding, where it earns its space. Give the verse the largest area in Read. At accessibility text sizes, allow long verses to scroll and provide a labeled Next verse action. A failed feed request gets a retry in Read while Home, Pause and the local DNS check stay usable.

## API work behind those screens

| Experience | Port from Logos API | Native app integration or new work |
| --- | --- | --- |
| Verse and chapter | KJV corpus and attribution, parser, translation/book/verse/feed-item schema and repeatable seeds | Implement a chapter lookup by verse ID that returns ordered verses and the selected verse. The source Bible controller and service are empty. Generate the bundled sample from the same corpus. |
| Personal feed and topics | Profile, topic taxonomy, onboarding selection, initial affinities, ranking, recency penalties and expiring per-user feed cursors | Use the existing Logos Supabase project for shared accounts with email one-time codes on iPhone and dashboard. Key reading profiles by the verified Supabase subject. Send its access token to `/api/reading` and `/api/account`. Verify persistence across relaunch and clear reader state on logout or account switch. Device credentials stay scoped to checks. |
| Reading actions and saved verses | Single and batched interactions, validation, event weights and affinity updates | Supply Swift Codable models for the wire responses. Add a query for currently saved verses and saved state on a card. Handle save/unsave and network retries so replaying a request cannot duplicate an event or score change. Record the reader’s resume position separately from the expiring feed cursor. |
| Offline enrichment | Topic and verse embedding jobs, verse-topic scoring, configuration and tests | Run generation separately from API startup. The seeded reader works before enrichment. Use reading interactions and selected topics for ranking. Keep local feelings, DNS outcomes and partner-agreement data outside the recommendation inputs. |

Append Drizzle migrations to the existing API’s existing journal. The API stores account IDs as text, so use text foreign keys for account-owned records and retain UUIDs for Scripture content. Provision pgvector on PostgreSQL 17 in Compose and CI before adding vector columns. Verify migrations against both an empty database and one containing pilot accounts, devices and agreements. Repeat seeds and compare counts and chapter order with the source corpus.

## Build and acceptance order

1. **Review the navigation on an iPhone.** In the current Xcode target, wire Home, Read and Protection to the existing screens and a bundled verse and chapter. Exercise all three onboarding choices, replay, check-in save/delete and chapter-and-back. Use this pass to judge spacing, long verses and the route back to Home before wiring personalization.
2. **Deliver one live reading journey.** Migrate content and the minimum feed dependencies, add chapter lookup, connect Logos sign-in and fetch a real verse with the native client. Validate an upgrade over the installed pilot. Pairing, DNS selection, check-ins and reminders must survive relaunch. Repeat the safe check on Wi-Fi and LTE.
3. **Complete reading parity.** Migrate the remaining profile, onboarding, ranking, interaction and enrichment logic with its source tests. Connect topics, saves, reading position and the end-of-session choice. Verify a reader with zero selected topics, no duplicate items across successive feed pages, recovery after cursor expiry, idempotent retries and isolation between two accounts.
4. **Verify accountability and release.** Exercise both sides of a partner invitation in the dashboard and verify its status in Protection. A device check shared with the owner is distinct from a partner report. Partner responses must exclude reading history and local feelings. Check that declining or revoking an agreement prevents report access before enabling real report delivery. Release the reader behind a flag and keep schema changes additive for rollback.

The code migration can proceed with seeded Scripture. If a deployed Logos database contains real reading history, handle that as a separate data cutover: verify account ownership, map content IDs, rehearse an idempotent import on a copy and reconcile events, selections and saves before enabling access.
