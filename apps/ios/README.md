# Logos for iPhone

Open Logos.xcodeproj and run the Logos scheme. The deployment target is iOS 17. The simulator offers resolver diagnostics. Installation and removal use Apple's DNS Settings capability on an iPhone. Protection uses Cloudflare for Families, a shared public resolver with adult and malware filtering. Optional device accounts support manual safe-check sync. Local partner emails go to Mailpit. Weekly activity requires a separately enrolled Gateway reporting source and a complete week of coverage.

## Using the pilot

On first launch, the three introduction screens cover Logos, encouragement style and privacy. **Finish introduction** opens the email screen. Enter your email, then the one-time code from your inbox, or continue as a guest to reach Home. Replay the three screens from **Home → Settings → View introduction**. Settings also includes appearance, encouragement style and the weekly reminder.

**Home** shows the check-in streak and the last seven days. Tap **Check in** to save a feeling on this phone or delete the latest check-in and its day. The reader menu offers six offline verses from Psalm 23 in the Authorized King James Version (1769 edition), drawn from the Logos KJV corpus. Swipe vertically or use **Next verse**, then tap **Read chapter** for context. Home offers **Continue reading** after the reader opens the sample. The reading position is stored on this phone.

Open **Read** for live Scripture. If you previously chose the offline sample, tap **Explore KJV** to switch back. Guests can read a verse in context. Sign in from the reader menu with your Logos email and a one-time code for topic selection, a personalized feed, likes and saved verses. The Home shortcut resumes the active account’s last verse. The device stores the Supabase session in Keychain.

For a physical Debug build, run `infra/dev-reader-mac.sh` from the repository root, then build the Logos scheme. This starts Nest on port 3443, creates a local development certificate and writes the Mac hostname and certificate fingerprint into the Debug configuration. Keep the Mac and phone on the same Wi-Fi and allow local network access when prompted. For a release build, set LOGOS_READER_API to the deployed HTTPS API origin. A simulator can use a local API on port 3001.

**Protection** shows the DNS configuration and timestamped safe-check result. The setup screen explains the resolver before requesting approval. Results stay local unless the owner pairs their device and selects **Run and share safe check** under **Dashboard connection**. **Accountability partner** lets a signed-in reader invite someone, review the scope, respond to invitations, open a connected agreement’s weekly report, or revoke access. Guests can preview the report.

Urbanist SemiBold is bundled under the SIL Open Font License. On the first build per DerivedData configuration, Xcode downloads unmodified Satoshi Regular from Fontshare for app embedding, then caches it. Both license texts ship with the app.

Run Product → Test in Xcode to exercise onboarding, check-in persistence and deletion, swiping, opening a chapter, resuming after relaunch and previewing a partner report. The optional dashboard sync test uses a one-time simulator pairing pass supplied in TEST_RUNNER_LOGOS_PAIRING_PASS.

## Local email sign-in on a simulator or iPhone

Run `infra/supabase/local/start.sh` from the repository root on your Mac with Docker running (OrbStack works). Build and run the **Logos** scheme in Debug. On an iPhone, join the same Wi-Fi as the Mac and allow local network access. For a new account, finish the introduction and tap **Send code**. From Home, you can also open **Read → Reader options → Sign in to Logos**.

Use a test address such as `reader@example.test`. Open [Mailpit on your Mac](http://127.0.0.1:54324), find the message for that address, and enter its numeric code in Logos. This signs you into the local reader with a real Supabase session. Mailpit captures the email on the Mac. Local accounts and reading data persist in a dedicated Docker volume. The inbox is available only on the Mac.

To switch Debug builds back to hosted auth, run `infra/supabase/local/start.sh stop` and rebuild. The Release configuration always uses hosted auth.

## Results on the development Mac

| Check | Evidence |
| --- | --- |
| Provider filtering | Direct HTTPS DNS queries returned 0.0.0.0 and :: for Cloudflare’s harmless adult-category fixture. The unfiltered resolver returned ordinary IPv4 addresses for the same fixture. |
| Ordinary connectivity | The family endpoint resolved example.com for IPv4 and IPv6. An independent HTTPS request to example.com on the Mac returned 200. |
| Build | Xcode 27.2 compiled the simulator and unsigned iPhone targets. The signed pilot also launched on a physical iPhone 13. |
| DNS interpretation | Seven synthetic cases cover blocked, mixed, open, missing control, and missing category answers. An error or empty answer is inconclusive. |
| Physical coverage | The iPhone system resolver blocked the safe fixture and resolved the control after activation and again on user-reported LTE. IPv6-only networks, VPN, Private Relay, outage behavior, removal and Safari remain unverified. |

Repeat the automated checks from the repository root:

```sh
python3 apps/ios/Validation/provider.py
swiftc apps/ios/Pilot/ResolverProbe.swift apps/ios/Validation/main.swift -o /tmp/logos-probe-tests
/tmp/logos-probe-tests
xcodebuild -project apps/ios/Logos.xcodeproj -scheme Logos -destination 'generic/platform=iOS Simulator' build
xcodebuild -project apps/ios/Logos.xcodeproj -scheme Logos -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

## Physical iPhone run

1. Pair a personally controlled test iPhone with Xcode. In Signing & Capabilities, select your development team and an available bundle identifier. The provisioning profile must authorize Network Extensions → DNS Settings. Run the app on the device.
2. Record the network type, iOS version, VPN and Private Relay state. Start with both competing services off. Before enabling Logos, run the safe DNS check as a baseline. If the baseline already blocks the fixture, use a different test network to establish the effect of enabling this configuration.
3. Tap **Install DNS configuration**, approve iOS’s prompt, and select the configuration named on the Protection screen under DNS in Settings. Return to the app and refresh. Record the enabled state separately from the check result.
4. On Wi-Fi run the safe check, then open https://example.com and https://nudity.testcategory.com in Safari. Record normal-page access and the exact block behavior. A certificate warning is a stopping point. Return to the companion screen for encouragement.
5. Turn Wi-Fi off to switch to cellular. Repeat both tests after DNS caches expire. Switch back and repeat. Test IPv6-only connectivity if available. Repeat with a test VPN and with Private Relay separately. Record unsupported combinations and distinguish Safari behavior from the app’s system DNS result.
6. Check offline and resolver-unreachable conditions on a controlled test network. Record whether ordinary connectivity survives each case. If connectivity breaks, switch DNS to Automatic. Remove the configuration in the app and confirm that the Settings entry disappears and baseline behavior returns after cache expiry.

## Provider and release decision

This endpoint is sufficient for a blocking feasibility test. It supplies no device identity to this app. IP addresses and shared DNS locations cannot establish who made a request. Before choosing a reporting provider, enroll two synthetic devices, validate isolated credentials, request exports and scoped access, and confirm export delay, retention, deletion and policy overrides. Gateway documents device identifiers generated by its own client. That integration requires its own test. [Gateway activity logs](https://developers.cloudflare.com/cloudflare-one/insights/logs/dashboard-logs/gateway-logs/)

The probe requires no paid provider account. Cloudflare lists a free Gateway proof-of-concept tier and paid per-user plans. Consumer redistribution rights, commercial pricing, support costs and processing terms still require vendor confirmation. Store eligibility also remains open until the team provisions the entitlement and validates distribution. [Cloudflare pricing](https://www.cloudflare.com/plans/zero-trust-services/) · [Apple capability setup](https://developer.apple.com/documentation/xcode/configuring-network-extensions/)

Apple requires user selection of the DNS service and describes how a VPN can supply its own resolver. The pilot installs no certificate. [Apple encrypted DNS](https://developer.apple.com/videos/play/wwdc2020/10047/) · [Cloudflare resolver and safe test domain](https://developers.cloudflare.com/1.1.1.1/setup/)

## App mark

The home-screen icon and in-app mark are two exports of a built-in ImageGen variation on the [Logos tree and open book](https://github.com/dovidmoishe/logos/blob/HEAD/mobile/assets/images/logos_app_icon.svg).

Generation prompt:

> Adapt the reference Logos tree, L and open book into a sibling iOS app icon for Logos. Center a bold ivory open-book silhouette with a lavender sprout rising from its spine, five large leaves. Solid deep plum background edge to edge. Square, flat, generous negative space, readable at 40 pixels. No text, mockup, inset tile or rounded outer corners.

## Welcome illustration

The journal illustration in the WelcomeJournal asset set was created with built-in ImageGen from the supplied style reference. Prompt:

> Style reference only. Create a single original landscape 3:2 transparent-background cutout illustration for a mindful iPhone app: an open pocket journal with two check marks, a lavender bookmark, a pencil, and a tiny sprouting plant in a cup. Strong black ink silhouettes, white paper planes, bold offset hard shadows, editorial flat vector-like artwork. Cluster the overlapping objects in a lively diagonal composition, generous clear margin, legible at 300px. No text, interface, buttons, borders, gray backdrop or screenshot.
