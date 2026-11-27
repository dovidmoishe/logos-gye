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
    @Environment(\.scenePhase) private var phase
    @State private var status = "Checking configuration…"
    @State private var profileName = "Logos"
    @State private var installed = false
    @State private var enabled = false
    @State private var known = false
    @State private var busy = false
    @AppStorage("lastDNSCheck") private var result = ""
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
                    } else if !installed {
                        Text("Allow Logos to add DNS settings. When selected, Cloudflare for Families receives DNS requests and filters adult and malware domains.")
                        Button("Install DNS configuration") { changeConfiguration(remove: false) }
                    } else if !enabled {
                        Text("Open Settings → General → VPN & Device Management → DNS. Select \(profileName), then return here.")
                        Button("Check selection") { Task { await refresh() } }
                    } else {
                        Text("Try a harmless test to see if filtering works on this connection.")
                        checkButton
                    }
                    #endif
                }
                if !result.isEmpty {
                    Section("Last connection check") { Text(result) }
                }
                Section("Accountability") {
                    NavigationLink("Dashboard connection") { DashboardConnection() }
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
        Button("Run safe DNS check") {
            busy = true
            Task {
                let outcome = await Task.detached { ResolverProbe.run() }.value
                result = Date.now.formatted(date: .abbreviated, time: .shortened) + " · " + outcome.rawValue
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

    @MainActor private func changeConfiguration(remove: Bool) {
        busy = true
        Task {
            defer { busy = false }
            do {
                try await manager.loadFromPreferences()
                if remove {
                    try await manager.removeFromPreferences()
                } else {
                    let dns = NEDNSOverHTTPSSettings(servers: ["1.1.1.3", "1.0.0.3", "2606:4700:4700::1113", "2606:4700:4700::1003"])
                    dns.serverURL = URL(string: "https://family.cloudflare-dns.com/dns-query")
                    manager.dnsSettings = dns
                    manager.localizedDescription = "Logos"
                    manager.onDemandRules = nil
                    try await manager.saveToPreferences()
                }
                result = ""
                await refresh()
            } catch {
                known = false
                status = "Configuration change failed. " + error.localizedDescription
            }
        }
    }
}
