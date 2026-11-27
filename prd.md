# Logos — Product Requirements Document

Status: Draft for product planning; implementation has not started.
Date: 25 November 2026
Working project name: Logos
Platforms: Web application, iOS application, Android application

## 1. Product vision

Help people avoid pornography and build healthier digital habits through content blocking, encouragement, and voluntary accountability with trusted people. Serve Christians with an optional faith-centered experience while welcoming people of any faith or none.

The product should feel supportive, private, and practical. A difficult moment should lead to a useful next action, rather than shame or punishment. Do not present the service as medical treatment or promise recovery outcomes.

## 2. Problem and existing evidence

Basic router DNS filters can block many adult domains, but coverage can disappear on cellular data, other Wi-Fi networks, or when another resolver or VPN is used. People also need understandable installation instructions, a clear indication of whether protection works, and a trusted accountability relationship.

An existing personal prototype demonstrates adult-domain filtering with a Cloudflare Gateway DNS policy and a customized block page containing Psalm 101:3. An iPhone DNS profile was scoped to one home Wi-Fi network; laptop browser policies used the same filtering service. This demonstrates a possible filtering and encouragement flow, not a production product or complete accountability system.

The prototype has no partner reporting pipeline. Its shared DNS location cannot reliably separate phone activity from laptop activity. Do not copy its credentials, certificates, account identifiers, profiles, network logs, or household data into this project.

## 3. Audience and initial scope

- Adults seeking voluntary pornography blocking and accountability.
- Christian adults who want optional scripture, prayer prompts, and faith-centered encouragement.
- Adults who prefer neutral language and practical habit support.
- Accountability partners who need concise, contextual reports and clear boundaries.

Initial pilot: consenting adults aged 18 or older with personally controlled devices. Family and minor accounts, church administration, and organizational device management are later products requiring separate consent, safeguarding, and access designs.

## 4. Goals

1. Make protection easy to install and verify on supported devices.
2. Block adult domains consistently within an explicitly stated coverage scope.
3. Offer a calm warning experience with Christian or neutral content selected by the user.
4. Share only the activity a user explicitly agrees to share with an accepted partner.
5. Make protection gaps, reporting delays, false positives, and platform limitations visible.
6. Establish a sustainable service with measured filtering, reporting, and support costs.

## 5. Non-goals for the initial release

- Secret monitoring, hidden partner access, or surveillance of another adult.
- Retrieving old Safari history or promising complete browsing history from DNS records.
- Reading messages, passwords, page contents, screenshots, or search terms through DNS filtering.
- Guaranteed blocking of every explicit image, social media feed, or in-app browser.
- Unbreakable protection on unmanaged personal devices.
- General HTTPS decryption or installation of a universal inspection certificate by default.
- A public feed of activity, competitive purity scores, or shame-based streak penalties.

## 6. Core journeys

### Personal onboarding

The user creates an account, chooses Christian or neutral encouragement, sees a plain-language explanation of collection and sharing, and enrolls a device. Installation guidance is specific to its operating system and protection method. A safe test domain verifies filtering. The dashboard distinguishes installation completed, filtering verified, and accountability connected.

### Blocking and redirection

A blocked request displays a supportive warning where technically supported. The user can leave the page, open encouragement, request a false-positive review, or choose to contact their partner. Sending a message requires a deliberate user action. If an HTTPS warning page is unavailable, the product must explain the actual blocking behavior and provide an accessible companion app screen.

### Accountability setup

The user selects the exact report scope and frequency before inviting a partner. The partner accepts an invitation and sees their permitted scope. Both can review the agreement. Changes to scope, new recipients, and expanded data collection require fresh consent. A partner can decline or disconnect; the user can revoke access.

### Partner review

The partner receives an agreed digest or alert and opens an authenticated, scoped report. Reports label DNS activity as requests, distinguish it from verified intentional visits, group duplicates, and acknowledge possible background traffic or classification errors. Empty reports distinguish no events from unavailable protection or missing telemetry.

### Coverage gap and recovery

The dashboard shows the last verified status, known coverage limitations, and steps to repair installation. A missing heartbeat means status unknown, not proof that protection was deliberately disabled. Any partner notification about a coverage gap must be included in the sharing agreement.

## 7. Functional requirements

### Web application — MVP

- Account creation, sign-in, recovery, session management, and account deletion.
- Device enrollment, readable device names, coverage scope, last verification, and repair guidance.
- Adult-category policy management and explicit domain allow/block exceptions.
- Safe filtering test and a visible explanation of what is and is not protected.
- Christian or neutral mode; configurable encouragement with accessible defaults.
- Partner invitations with expiry, acceptance, revocation, and role-scoped access.
- Report preview showing precisely what the partner will receive.
- Weekly digest as the initial reporting default; optional alerts after explicit configuration.
- Request-based event history with timestamp, device attribution when established, category, action, and classification caveats.
- Consent history, sharing controls, data export, retention controls, and deletion.
- Narrow internal support tools with audited access and no routine browsing-history visibility.

### Mobile applications — MVP target

- iOS first feasibility pilot; Android follows once the shared service contracts are established. Both remain required product platforms.
- Guided enrollment into the chosen OS-supported protection mechanism.
- Coverage intended across Wi-Fi and cellular where the validated implementation permits it; accurately label any narrower scope.
- Protection status, safe verification, repair guidance, and explanation of VPN or Private Relay conflicts where relevant.
- Encouragement screen, voluntary check-ins, and partner/report settings consistent with the web application.
- Notifications with privacy-preserving text; sensitive domains must not appear on lock screens by default.
- Clearly disclosed permission requests and an understandable removal procedure.

Native network extensions, managed DNS profiles, entitlements, background execution, and store policies must be verified against current Apple and Android documentation before selecting a mobile implementation. A cross-platform UI framework alone does not establish filtering capability.

### Filtering and block-page service

- Validate a managed filtering provider before considering custom filtering infrastructure.
- Use per-user and per-device attribution where supported; never attribute shared-router events to a specific person without evidence.
- Support category filtering, domain overrides, false-positive review, and policy propagation status.
- Separate tenant policies, device enrollments, credentials, certificates, logs, and report permissions.
- Support IPv4, IPv6, encrypted DNS, connectivity transitions, and common VPN conflicts within declared platform support.
- Verify HTTPS block-page behavior independently from DNS blocking. DNS redirection alone cannot reliably display a custom page for arbitrary HTTPS sites.
- Any certificate needed for a warning page requires an explicit explanation of trust scope, secure lifecycle management, and removal instructions. Ordinary traffic inspection remains out of the initial scope.
- Document fail-open or fail-closed behavior and provide a recovery path that preserves access to essential connectivity.

### Accountability and reporting

- Default proposed scope: blocked adult-domain requests only. Broader domain reporting is optional and requires a separate decision and consent flow.
- No automatic collection of historical browser data.
- Separate synthetic tests, duplicates, and known background activity from meaningful report summaries where possible.
- Daily or weekly aggregation must avoid treating DNS request counts as intentional visit counts.
- Store delivery preferences, timezone, recipient acceptance, and revocation state.
- Report delivery must be retryable without duplicate alerts, and must stop promptly after revocation.
- Use secure report links rather than sensitive domain lists in email by default.
- Record the scope version used for each delivered report.
- Do not send real activity to a partner during development or testing; use synthetic fixtures.

## 8. Privacy and trust requirements

Collect the minimum data needed for the chosen feature. Before enabling reporting, disclose which requests are stored, who can see them, provider involvement, retention, and the difference between activity and inferred intent.

Proposed default retention: detailed request events for 7 days and aggregate reports for 30 days, subject to provider capability validation. These are product targets, not claims about Cloudflare's current retention. Deletion and access removal must cover our systems and supported downstream processors, with any unavoidable retention disclosed.

Require encryption in transit and at rest, strong authentication, tenant isolation, limited staff access, audited sensitive reads, and secure secret storage. Do not sell browsing data or use it for advertising. Never expose report data through public or guessable links.

Accountability partners receive report access only; they do not gain unrestricted device control. Revocation is immediate in the application. Previously viewed reports cannot be recalled, and users must be told this before sharing. Any change or removal notification is opt-in and disclosed, not a hidden punishment mechanism.

## 9. Experience principles

- Christian mode can offer scripture with translation attribution and appropriate licensing; neutral mode offers encouragement without religious language.
- Users can change modes without losing protection or account history.
- Explain errors and coverage in everyday language.
- Support mobile layouts, keyboard use, screen readers, readable contrast, and low-bandwidth connections.
- Avoid explicit imagery in onboarding, reports, tests, and marketing.
- Include a constructive next action after a block and avoid accusatory wording.

## 10. Platform feasibility and dependencies

The next phase must validate: iOS network/filtering entitlements and App Store eligibility; Android equivalents and Play policies; protection on Wi-Fi and cellular; coexistence with existing VPNs; Private Relay interactions; device attribution; HTTPS warning-page reliability; tamper and uninstall observability; reporting export APIs; and provider quotas, retention, pricing, and commercial redistribution terms.

Cloudflare is a prototype candidate, not a finalized commercial dependency. Confirm tenant isolation and resale or partner terms before onboarding unrelated customers. Do not require every customer to create a broad API token or give us their router password.

Prefer a responsive web portal with native mobile filtering components if platform research supports it. Technology choices, hosting, billing provider, and repository structure remain undecided until feasibility and unit economics are reviewed.

## 11. Validation and release acceptance

Use synthetic domains and consenting test users. The release must demonstrate:

- Correct blocking and normal-site access on each declared platform and network type.
- A successful Wi-Fi-to-cellular transition or an explicit, accurate coverage limitation.
- Correct warning behavior without invalid-certificate bypass instructions.
- Zero cross-user report access in isolation tests.
- Partner invitations cannot expose reports before acceptance or after revocation.
- Shared network activity is never incorrectly labeled as a specific person's activity.
- Every report includes its scope, relevant time range, and telemetry confidence or gap status.
- Classification mistakes have a usable review and override path.
- Export and deletion meet the published retention and processor limitations.
- Installation, removal, account recovery, provider outage, and offline states have usable paths.

Proposed pilot targets, to confirm after feasibility: at least 90% guided onboarding completion among supported pilot devices; at least 95% scheduled digest delivery within one hour of the chosen time; no cross-tenant disclosures; no duplicate partner notifications for a retried delivery. Measure false positives, support burden, coverage verification success, and user-reported helpfulness. Do not use raw blocked-request counts as a success or recovery metric.

## 12. Delivery phases

1. Planning and feasibility: confirm target OS versions, native filtering mechanisms, provider terms, threat model, data flow, and costs. Produce a validated coverage matrix before implementation.
2. Product design: agree on onboarding, Christian and neutral modes, protection states, consent, partner reports, and repair flows.
3. Private MVP: web portal plus a validated iOS protection flow, minimal adult-category policies, device attribution, accepted partner relationships, and weekly scoped reports. No public launch until release gates pass.
4. Android companion: equivalent onboarding, filtering verification, coverage communication, and reporting integration.
5. Pilot refinement and public release: reliability, accessibility, privacy review, support processes, store distribution, subscriptions if justified, and clear customer-facing claims.
6. Later options: household plans, group subscriptions, richer voluntary check-ins, and desktop companions. Each needs a separately agreed scope.

## 13. Decisions to make next

- Minimum iOS and Android versions and which receives the first pilot build.
- Whether the initial paid value is blocking, accountability, or a combined subscription.
- Managed filtering provider and commercial arrangement.
- Verified warning-page implementation and certificate approach, if any.
- Exact retention and processing locations supported by the chosen provider.
- Weekly-only versus optional immediate alerts, and how to handle false positives.
- Visual identity, pronunciation and meaning of Logos, domain availability, and name clearance.
- Initial price, support commitment, and pilot size after costs are known.

## 14. Reference material

- Cloudflare Gateway activity logs: https://developers.cloudflare.com/cloudflare-one/insights/logs/dashboard-logs/gateway-logs/
- Cloudflare Gateway block pages: https://developers.cloudflare.com/cloudflare-one/reusable-components/custom-pages/gateway-block-page/

These references describe provider capabilities, not a guarantee of this product's future coverage. Recheck current official platform and provider documentation during feasibility.

## 15. Current handoff boundary

Only this PRD is authorized for creation now. Do not scaffold applications, install packages, generate code, connect live customer infrastructure, collect real browsing activity, invite partners, or deploy services until the owner asks to begin the next phase.

When implementation is authorized, use Conventional Commits in the form type(scope): description, with lowercase types, meaningful scopes such as web, api, repo, deps, or ci, concise lowercase imperative descriptions, and no trailing period. Branch names must use meaningful lowercase prefixes such as feat/, fix/, refactor/, or chore/ and must never include codex.
