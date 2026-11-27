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

private final class DeviceTransport: NSObject, URLSessionTaskDelegate {
    static let session = URLSession(configuration: .ephemeral, delegate: DeviceTransport(), delegateQueue: nil)
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
    static func post(_ url: URL, body: [String:String], credential: String? = nil) async throws -> Data {
        var request = URLRequest(url: url, timeoutInterval: 12)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let credential { request.setValue("Bearer " + credential, forHTTPHeaderField: "Authorization") }
        request.httpBody = try JSONEncoder().encode(body)
        let (data,response) = try await session.data(for: request)
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
                } footer: { Text("In the dashboard, open Device account and create a pairing pass. Pair only with your own dashboard.") }
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

struct PartnerInformation: View {
    @State private var dashboard: URL?

    var body: some View {
        List {
            Section("Partner agreement") {
                Text("Invite a partner from your dashboard and choose whether to share weekly grouped counts. Check-ins and reading history stay private.")
                if let dashboard {
                    Link("Open dashboard", destination: dashboard)
                } else {
                    NavigationLink("Connect your dashboard") { DashboardConnection() }
                }
            }
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
        .onAppear { dashboard = (try? DeviceKeychain.load())?.origin.appendingPathComponent("account") }
    }
}
