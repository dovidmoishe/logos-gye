import CoreText
import SwiftUI
import NetworkExtension

@main
struct PilotApp: App {
    init() {
        #if DEBUG
        do { try ReaderAccount.applyRequestedLocalRefresh() }
        catch { print("Local refresh pending: " + error.localizedDescription) }
        #endif
        for (name, ext) in [("Urbanist-SemiBold","ttf"), ("Satoshi-Regular","otf")] {
            if let url = Bundle.main.url(forResource: name, withExtension: ext) {
                CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            }
        }
        if let font = UIFont(name: "Urbanist-SemiBold", size: 34) {
            UINavigationBar.appearance().largeTitleTextAttributes = [.font: UIFontMetrics(forTextStyle: .largeTitle).scaledFont(for: font)]
        }
    }
    var body: some Scene { WindowGroup { PilotHome() } }
}

struct ProtectionView: View {
    @EnvironmentObject private var account: ReaderAccount
    @State private var disconnected = false
    @State private var syncStatus = ""
    @Environment(\.scenePhase) private var phase
    @State private var status = "Checking configuration…"
    @State private var profileName = "Logos"
    @State private var installed = false
    @State private var enabled = false
    @State private var activeURL: URL?
    @State private var known = false
    @State private var busy = false
    @AppStorage("lastDNSCheck") private var result = ""
    @State private var checkedThisSession = false
    @State private var confirmRemoval = false
    private let manager = NEDNSSettingsManager.shared()

    var body: some View {
        List {
                Section {
                    HStack(spacing: 14) {
                        BrandMark(size: 36)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Logos").font(.subheadline).foregroundStyle(.secondary)
                            Text(status).font(PilotTheme.prompt)
                        }
                    }.padding(.vertical, 8)
                }.listRowBackground(PilotTheme.card)
                Section {
                    #if targetEnvironment(simulator)
                    Text("You can test this simulator’s connection. Install Logos on an iPhone to enable filtering.")
                    checkButton
                    #else
                    if !known {
                        Button("Check configuration again") { Task { await refresh() } }
                    } else if !installed && account.resolverURL == nil {
                        Text("Allow Logos to add DNS settings. When selected, Cloudflare for Families receives DNS requests and filters adult and malware domains.")
                        Button("Install DNS configuration") { changeConfiguration(remove: false) }
                    } else if installed && !enabled {
                        Text("Open Settings → General → VPN & Device Management → DNS. Select \(profileName), then return here.")
                        Button("Check selection") { Task { await refresh() } }
                    } else if enabled {
                        if activeURL?.host?.lowercased() == "family.cloudflare-dns.com" {
                            Text("Cloudflare for Families filters this iPhone. Its blocks stay out of Logos reports and partner emails.")
                                .accessibilityIdentifier("familiesFilterNotice")
                        } else if let resolver = account.resolverURL, resolver == activeURL {
                            Text("Logos DNS can report adult-domain blocks. Check-in emails require both partners to opt in.")
                        }
                        checkButton
                    }
                    #endif
                }
                #if !targetEnvironment(simulator)
                if let url = account.resolverURL, known, activeURL != url {
                    Section("Account filter") {
                        Text("Use Logos DNS to filter adult domains and share grouped blocks under your partner agreement.")
                        Button("Use Logos DNS on this iPhone") { changeConfiguration(remove: false, resolver: url) }
                    }
                }
                #endif
                ScreenTimeProtection()
                if !result.isEmpty {
                    Section("Last connection check") { Text(result).accessibilityIdentifier(checkedThisSession ? "currentDNSCheck" : "savedDNSCheck") }
                }
                Section("Accountability") {
                    if account.email == nil {
                        NavigationLink("Dashboard connection") { DashboardConnection() }
                    } else {
                        if !syncStatus.isEmpty { Text(syncStatus).font(.footnote) }
                        if disconnected {
                            Button("Reconnect this iPhone") {
                                Task {
                                    do { try await account.connectPhone(reconnect: true); disconnected = false; syncStatus = "Connected to your account." }
                                    catch { syncStatus = error.localizedDescription }
                                }
                            }
                        }
                    }
                    NavigationLink("Accountability partner") { PartnerInformation() }
                }
                Section {
                    DisclosureGroup("Coverage and troubleshooting") {
                        Text("Run the check again after switching between Wi-Fi and cellular. Cached DNS answers can linger. A VPN, Private Relay or an app’s own resolver may affect coverage.")
                        Text("Safari may show a connection error for a blocked HTTPS site. Open Check in on Home for encouragement.")
                        Text("To restore your previous resolver, select Automatic in DNS settings.")
                    }
                    #if !targetEnvironment(simulator)
                    if installed && known {
                        DisclosureGroup("Manage configuration") {
                            Button("Refresh configuration") { Task { await refresh() } }
                            Button("Remove configuration", role: .destructive) { confirmRemoval = true }
                        }
                    }
                    #endif
                }
            }
            .scrollContentBackground(.hidden)
            .background(PilotTheme.canvas)
            .disabled(busy)
            .overlay { if busy { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
            .screenTitle("Protection")
            .task(id: phase) { if phase == .active { await refresh() } }
            .confirmationDialog("Remove Logos DNS settings?", isPresented: $confirmRemoval) {
                Button("Remove configuration", role: .destructive) { changeConfiguration(remove: true) }
            }
    }

    private var checkButton: some View {
        Button(account.email == nil ? "Run safe DNS check" : "Run and save safe check") {
            busy = true
            Task {
                let identity = account.owner
                checkedThisSession = false
                let outcome = await Task.detached { ResolverProbe.run() }.value
                result = Date.now.formatted(date: .abbreviated, time: .shortened) + " · " + outcome.rawValue
                checkedThisSession = true
                if account.email != nil, account.owner == identity {
                    do { try await account.saveDeviceCheck(outcome); syncStatus = "Check saved to your account."; disconnected = false }
                    catch {
                        syncStatus = error.localizedDescription
                        disconnected = (error as? ReaderError)?.status == 404
                    }
                }
                busy = false
            }
        }
    }

    @MainActor private func refresh() async {
        #if targetEnvironment(simulator)
        status = "Simulator diagnostics"
        #else
        do {
            try await manager.loadFromPreferences()
            profileName = manager.localizedDescription ?? "Logos"
            activeURL = (manager.dnsSettings as? NEDNSOverHTTPSSettings)?.serverURL
            installed = manager.dnsSettings != nil
            known = true
            enabled = manager.isEnabled
            status = installed ? (manager.isEnabled ? "Filter selected" : "Filter installed · switch it on") : "Ready to install"
        } catch {
            known = false
            status = "Configuration unknown. " + error.localizedDescription
        }
        #endif
    }

    static func familiesDNS() -> NEDNSOverHTTPSSettings {
        let dns = NEDNSOverHTTPSSettings(servers: ["1.1.1.3", "1.0.0.3", "2606:4700:4700::1113", "2606:4700:4700::1003"])
        dns.serverURL = URL(string: "https://family.cloudflare-dns.com/dns-query")
        return dns
    }

    @MainActor private func changeConfiguration(remove: Bool, resolver: URL? = nil) {
        busy = true
        Task {
            defer { busy = false }
            do {
                try await manager.loadFromPreferences()
                if remove {
                    try await manager.removeFromPreferences()
                } else {
                    if let resolver {
                        guard resolver.scheme == "https", let host = resolver.host, account.resolverURL == resolver else { throw URLError(.badURL) }
                        let servers = await Task.detached { Array(ResolverProbe.addresses(for: host)) }.value
                        guard !servers.isEmpty else { throw URLError(.cannotFindHost) }
                        // The system resolver needs a trusted certificate independently of the app's Debug API pin.
                        try await ResolverProbe.verifyEndpoint(resolver)
                        guard account.resolverURL == resolver else { throw CancellationError() }
                        let dns = NEDNSOverHTTPSSettings(servers: servers)
                        dns.serverURL = resolver
                        manager.dnsSettings = dns
                    } else { manager.dnsSettings = Self.familiesDNS() }
                    manager.localizedDescription = "Logos"
                    manager.onDemandRules = nil
                    try await manager.saveToPreferences()
                }
                UserDefaults.standard.set(!remove && resolver != nil, forKey: "logos.accountDNSInstalled")
                result = ""
                await refresh()
            } catch {
                await refresh()
                syncStatus = "Couldn’t update DNS. " + error.localizedDescription
            }
        }
    }
}
