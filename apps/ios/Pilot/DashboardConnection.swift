import Security
import SwiftUI

private struct PairedDevice: Codable {
    let origin: URL
    let name: String
    let credential: String
}

private enum PairingError: LocalizedError {
    case invalidPass, unauthorized, failed, keychain
    var errorDescription: String? {
        switch self {
        case .invalidPass: return "Paste a pairing pass from a dashboard you trust. Use its HTTPS address."
        case .unauthorized: return "The pairing pass expired, was used, or this device was disconnected."
        case .failed: return "Could not reach the dashboard. Check its address and try again."
        case .keychain: return "Could not access the saved device connection."
        }
    }
}

private enum DeviceKeychain {
    private static var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "org.logosgye.filterpilot.device", kSecAttrAccount as String: "pairing"]
    }
    static func load() throws -> PairedDevice? {
        var q = query
        q[kSecReturnData as String] = true
        var item: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = item as? Data else { throw PairingError.keychain }
        return try JSONDecoder().decode(PairedDevice.self, from: data)
    }
    static func save(_ device: PairedDevice) throws {
        var q = query
        q[kSecValueData as String] = try JSONEncoder().encode(device)
        q[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        guard SecItemAdd(q as CFDictionary, nil) == errSecSuccess else { throw PairingError.keychain }
    }
    static func forget() throws {
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw PairingError.keychain }
    }
}

private enum DeviceTransport {
    static func post(_ url: URL, body: [String:String], credential: String? = nil) async throws -> Data {
        var request = URLRequest(url: url, timeoutInterval: 12)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let credential { request.setValue("Bearer " + credential, forHTTPHeaderField: "Authorization") }
        request.httpBody = try JSONEncoder().encode(body)
        let (data,response) = try await ReaderTransport.session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw PairingError.failed }
        if http.statusCode == 401 { throw PairingError.unauthorized }
        guard (200..<300).contains(http.statusCode) else { throw PairingError.failed }
        return data
    }
}

struct DashboardConnection: View {
    @State private var device: PairedDevice?
    @State private var pass = ""
    @State private var message = ""
    @State private var busy = false
    @AppStorage("lastDNSCheck") private var lastResult = ""

    var body: some View {
        Form {
            if let device {
                Section {
                    LabeledContent("Device", value: device.name)
                    Text(device.origin.host ?? "").font(.footnote)
                    Button("Run and share safe check") { perform { try await share(device) } }
                } footer: { Text("Sends this test outcome to your dashboard. Your feelings and browsing activity stay private.") }
                Section {
                    Button("Forget connection", role: .destructive) {
                        perform { try DeviceKeychain.forget(); self.device = nil }
                    }
                } footer: { Text("To revoke this device on the server, also select Disconnect in your dashboard.") }
            } else {
                Section {
                    TextField("Pairing pass", text: $pass).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .privacySensitive()
                    Button("Connect device") { perform { try await pair() } }.disabled(pass.isEmpty)
                } footer: { Text("In the dashboard, open Devices and create a pairing pass. Pair only with your own dashboard.") }
            }
            if !message.isEmpty { Text(message) }
        }
        .disabled(busy).screenTitle("Dashboard connection")
        .onAppear { do { device = try DeviceKeychain.load() } catch { message = error.localizedDescription } }
    }

    private func perform(_ work: @escaping @MainActor () async throws -> Void) {
        busy = true
        message = ""
        Task { @MainActor in
            defer { busy = false }
            do { try await work() } catch { message = error.localizedDescription }
        }
    }

    private func pair() async throws {
        guard var parts = URLComponents(string: pass.trimmingCharacters(in: .whitespacesAndNewlines)),
              let code = parts.fragment, code.count == 43, let host = parts.host, !host.isEmpty,
              parts.user == nil, parts.password == nil, parts.query == nil,
              parts.path.isEmpty || parts.path == "/" else { throw PairingError.invalidPass }
        var allowed = parts.scheme == "https"
        #if targetEnvironment(simulator)
        allowed = allowed || (parts.scheme == "http" && ["localhost","127.0.0.1"].contains(host))
        #endif
        parts.fragment = nil
        guard allowed, let origin = parts.url else { throw PairingError.invalidPass }
        struct Reply: Decodable { let name: String; let credential: String }
        let data = try await DeviceTransport.post(origin.appendingPathComponent("api/device/pair"), body: ["code":code])
        let reply = try JSONDecoder().decode(Reply.self, from: data)
        let paired = PairedDevice(origin: origin, name: reply.name, credential: reply.credential)
        try DeviceKeychain.save(paired)
        device = paired
        pass = ""
    }
    private func share(_ device: PairedDevice) async throws {
        let result = await Task.detached { ResolverProbe.run() }.value
        lastResult = Date.now.formatted(date: .abbreviated, time: .shortened) + " · " + result.rawValue
        let outcome: String
        switch result { case .blocked: outcome = "blocked"; case .open: outcome = "open"; case .unknown: outcome = "unknown" }
        _ = try await DeviceTransport.post(device.origin.appendingPathComponent("api/device/checks"), body:["outcome":outcome], credential:device.credential)
        message = "Sent to your dashboard. " + result.rawValue
    }
}

struct PartnerAgreement: Decodable, Identifiable {
    static let scope = "weekly-blocked-counts-v1"
    let id: UUID
    let recipient: String
    let owner: String
    let status: String
    let expiresAt: Double
}

struct PartnerInformation: View {
    @EnvironmentObject private var account: ReaderAccount
    @Environment(\.scenePhase) private var phase
    @State private var dashboard: URL?
    @State private var rows: [PartnerAgreement] = []
    @State private var busy = false
    @State private var loaded = false
    @State private var message: String?
    @State private var recipient = ""
    @State private var consent = false
    @FocusState private var editingRecipient: Bool
    @State private var signingIn = false
    @State private var adding = false

    var body: some View {
        List {
            Section("Partner agreements") {
                Text("Share weekly grouped counts of blocked adult-category requests after both people agree.")
                if let email = account.email {
                    if !loaded && message == nil { ProgressView("Loading agreements") }
                    if loaded && rows.isEmpty { Text("No partners yet").foregroundStyle(.secondary) }
                    ForEach(rows) { row in
                        let outgoing = row.owner.lowercased() == email.lowercased()
                        VStack(alignment: .leading, spacing: 6) {
                            Text(outgoing ? row.recipient : row.owner).font(.headline)
                            Text((outgoing ? "Outgoing" : "Incoming") + " · " + row.status).font(.subheadline).foregroundStyle(.secondary)
                            if row.status == "Pending" {
                                Text("Expires " + Date(timeIntervalSince1970: row.expiresAt / 1000).formatted(date: .abbreviated, time: .omitted)).font(.caption)
                            }
                            if row.status == "Connected" {
                                NavigationLink("View weekly report") { PartnerWeekView(agreement: row) }
                            }
                            if row.status == "Pending" && !outgoing {
                                HStack {
                                    Button("Accept weekly scope") { change(row, "accept") }
                                    Button("Decline") { change(row, "decline") }
                                }
                            } else if row.status == "Connected" || row.status == "Pending" {
                                Button(row.status == "Pending" ? "Cancel invitation" : "Revoke access") { change(row, "revoke") }
                            }
                        }.buttonStyle(.borderless).disabled(busy)
                    }
                    if !adding { Button("Add partner") { adding = true } }
                    Button("Refresh agreements") { Task { await refresh() } }.disabled(busy)
                } else { Button("Sign in to manage partners") { signingIn = true } }
                if let message { Text(message).font(.footnote) }
            }
            if adding && account.email != nil {
                Section("Invite a partner") {
                    TextField("Partner email or pilot username", text: $recipient)
                        .textInputAutocapitalization(.never).keyboardType(.emailAddress).autocorrectionDisabled()
                        .focused($editingRecipient).submitLabel(.done).onSubmit { editingRecipient = false }
                        .onChange(of: recipient) { _, _ in consent = false }
                    Toggle("I agree to share weekly grouped counts with this partner.", isOn: $consent)
                        .onChange(of: consent) { _, approved in if approved { editingRecipient = false } }
                    Button("Create invitation") {
                        Task {
                            if await update({ try await account.invitePartner(recipient) }) {
                                adding = false; recipient = ""; consent = false
                                message = "Invitation ready. Your partner can sign in to Logos to respond."
                            }
                        }
                    }.disabled(!consent || recipient.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    Button("Cancel") { adding = false; recipient = ""; consent = false }
                }.disabled(busy)
            }
            if let dashboard { Link("Open dashboard", destination: dashboard) }
            Section {
                NavigationLink("Preview weekly report") {
                    List {
                        Section("Sample · Nov 16–22") {
                            LabeledContent("Grouped blocked requests", value: "2")
                            Text("This example assumes coverage for the full week.")
                        }
                        Section("About these numbers") {
                            Text("Background traffic can generate requests. A request does not establish an intentional visit. This sample excludes domain names and coverage gaps.")
                        }
                    }.screenTitle("Report preview")
                }
            } footer: { Text("The pilot sends no partner reports.") }
        }
        .screenTitle("Accountability partner")
        .onAppear { dashboard = (try? DeviceKeychain.load())?.origin.appendingPathComponent("partners") }
        .task(id: account.owner) {
            rows = []; loaded = false; adding = false; consent = false; recipient = ""; message = nil
            await refresh()
        }
        .onChange(of: phase) { _, value in
            if value == .active { Task { await refresh() } }
        }
        .sheet(isPresented: $signingIn) { NavigationStack { ReaderSignIn { signingIn = false } } }
    }

    private func refresh() async {
        guard account.email != nil else { return }
        _ = await update { try await account.agreements() }
    }

    private func change(_ row: PartnerAgreement, _ action: String) {
        Task { _ = await update { try await account.respond(to: row, action: action) } }
    }

    private func update(_ operation: () async throws -> [PartnerAgreement]) async -> Bool {
        guard !busy else { return false }
        busy = true; message = nil
        defer { busy = false }
        do {
            rows = try await operation()
            loaded = true
            return true
        } catch {
            if !Task.isCancelled { message = error.localizedDescription }
            return false
        }
    }
}

struct PartnerWeek: Decodable {
    enum Status: String, Decodable { case available, unavailable, awaitingFirstWeek = "awaiting_first_week" }
    let status: Status
    let weekStart: Double
    let weekEnd: Double
    let groupedRequests: Int?
}

private struct PartnerWeekView: View {
    let agreement: PartnerAgreement
    @EnvironmentObject private var account: ReaderAccount
    @Environment(\.scenePhase) private var phase
    @State private var report: PartnerWeek?
    @State private var error: String?

    var body: some View {
        List {
            if let report {
                let utc = Date.FormatStyle(date: .abbreviated, time: .omitted, timeZone: TimeZone(secondsFromGMT: 0)!)
                Section("Reporting week · UTC") {
                    Text(Date(timeIntervalSince1970: report.weekStart / 1000).formatted(utc) + " – "
                         + Date(timeIntervalSince1970: report.weekEnd / 1000 - 1).formatted(utc))
                    switch report.status {
                    case .available:
                        if let count = report.groupedRequests { LabeledContent("Grouped blocked requests", value: String(count)) }
                    case .unavailable: Text("No report data is available for this week.")
                    case .awaitingFirstWeek: Text("This is the first full week covered by your agreement.")
                    }
                }
            } else if let error { Text(error) } else { ProgressView("Loading report") }
        }
        .screenTitle("Weekly report")
        .task(id: phase) {
            report = nil; error = nil
            guard phase == .active else { return }
            do {
                let result = try await account.weeklyReport(for: agreement)
                try Task.checkCancellation()
                report = result
            } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
        }
    }
}
