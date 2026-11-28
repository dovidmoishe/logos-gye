import NetworkExtension
import CryptoKit
import Security
import SwiftUI
#if DEBUG
import UserNotifications
#endif

struct ReadingVerse: Codable, Identifiable, Hashable {
    let verseId: UUID
    let book: String
    let chapter: Int
    let verse: Int
    let reference: String
    let text: String
    struct Translation: Codable, Hashable { let code: String; let name: String }
    let translation: Translation
    var id: UUID { verseId }
}
struct ReadingTopic: Decodable, Identifiable { let id: UUID; let name: String }
struct VerseList: Decodable { let verses: [ReadingVerse] }
struct TopicList: Decodable { let topics: [ReadingTopic] }
struct ReaderLibrary: Decodable { let liked: [UUID]; let saved: [ReadingVerse]; let topicIds: [UUID] }
struct FeedPage: Decodable {
    struct Item: Decodable { let verse: ReadingVerse }
    let items: [Item]
    let nextCursor: String?
}
private struct LogosSession: Codable {
    struct User: Codable { let id: UUID; let email: String }
    let access_token: String
    let expires_at: TimeInterval
    let user: User
}

struct ReaderError: LocalizedError {
    let message: String
    var status: Int = 0
    var errorDescription: String? { message }
}

private enum SessionKeychain {
    static let key: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "org.logos.email-session." + (ReaderAccount.apiOrigin?.absoluteString ?? "unconfigured"), kSecAttrAccount as String: "session"]
    static func load() throws -> LogosSession? {
        var query = key
        query[kSecReturnData as String] = true
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = item as? Data else { throw ReaderError(message: "Unlock your iPhone to access your Logos account.") }
        return try JSONDecoder().decode(LogosSession.self, from: data)
    }
    static func save(_ value: LogosSession?) throws {
        guard let value else {
            let status = SecItemDelete(key as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else { throw ReaderError(message: "Could not clear your session.") }
            return
        }
        let data = try JSONEncoder().encode(value)
        let attributes = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly] as [String: Any]
        var status = SecItemUpdate(key as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound { status = SecItemAdd(key.merging(attributes) { _, new in new } as CFDictionary, nil) }
        guard status == errSecSuccess else { throw ReaderError(message: "Could not store your Logos session.") }
    }
}

final class ReaderTransport: NSObject, URLSessionTaskDelegate {
    #if DEBUG
    private static let pairingOrigin = (Bundle.main.object(forInfoDictionaryKey: "LocalPairingOrigin") as? String).flatMap(URL.init(string:))
    #endif
    static let session = URLSession(configuration: .ephemeral, delegate: ReaderTransport(), delegateQueue: nil)
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
    func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge,
                    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        #if DEBUG
        if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
           [ReaderAccount.apiOrigin, Self.pairingOrigin].compactMap({ $0 }).contains(where: {
               $0.scheme == "https" && $0.host?.lowercased() == challenge.protectionSpace.host.lowercased()
                   && ($0.port ?? 443) == challenge.protectionSpace.port
           }),
           let pin = Bundle.main.object(forInfoDictionaryKey: "ReaderDevelopmentCertificateHash") as? String, !pin.isEmpty,
           let trust = challenge.protectionSpace.serverTrust,
           let cert = (SecTrustCopyCertificateChain(trust) as? [SecCertificate])?.first {
            let digest = SHA256.hash(data: SecCertificateCopyData(cert) as Data).map { String(format: "%02x", $0) }.joined()
            guard digest == pin else { completionHandler(.cancelAuthenticationChallenge, nil); return }
            SecTrustSetAnchorCertificates(trust, [cert] as CFArray)
            SecTrustSetAnchorCertificatesOnly(trust, true)
            if SecTrustEvaluateWithError(trust, nil) { completionHandler(.useCredential, URLCredential(trust: trust)); return }
        }
        #endif
        completionHandler(.performDefaultHandling, nil)
    }
}

@MainActor final class ReaderAccount: ObservableObject {
    nonisolated static let apiOrigin: URL? = {
        if let value = Bundle.main.object(forInfoDictionaryKey: "ReaderAPIOrigin") as? String,
           let url = URL(string: value), url.scheme == "https", url.host != nil { return url }
        #if targetEnvironment(simulator)
        if let raw = Bundle.main.object(forInfoDictionaryKey: "ReaderAPIOrigin") as? String,
           let url = URL(string: raw), url.scheme == "http", url.host == "127.0.0.1" { return url }
        return URL(string: "http://127.0.0.1:3001")
        #else
        return nil
        #endif
    }()
    private var loginChallenge: String?
    @Published private var session: LogosSession?
    @Published private(set) var resolverURL: URL?
    @Published var resume: ReadingVerse?
    @Published var live: Bool
    var email: String? { session?.user.email }
    var usesLocalTestInbox: Bool {
        #if DEBUG
        return Bundle.main.object(forInfoDictionaryKey: "LocalEmailTest") as? String == "YES"
            && (Self.apiOrigin?.host == "127.0.0.1" || Self.apiOrigin?.host?.hasSuffix(".local") == true)
        #else
        return false
        #endif
    }
    var owner: String { session?.user.id.uuidString ?? "guest" }
    init() {
        let defaults = UserDefaults.standard
        live = defaults.object(forKey: "reader.live") == nil ? Self.apiOrigin != nil : defaults.bool(forKey: "reader.live")
        if let cached = try? SessionKeychain.load(), cached.expires_at > Date.now.timeIntervalSince1970 { session = cached }
        restorePosition()
    }
    #if DEBUG
    // Xcode can place this one-shot marker in the pilot's container without uninstalling its DNS profile.
    static func applyRequestedLocalRefresh() throws {
        let marker = URL.applicationSupportDirectory.appendingPathComponent("refresh-personal-data")
        let files = FileManager.default
        guard files.fileExists(atPath: marker.path) else { return }
        try SessionKeychain.save(nil)
        let defaults = UserDefaults.standard
        let preferences = ["homeIntroductionComplete", "introAccountPending", "faithMode", "darkAppearance",
                           "readingVerse", "checkInDays", "lastCheckIn", "lastFeeling", "reader.live"]
        let positions = defaults.dictionaryRepresentation().keys.filter { $0.hasPrefix("reader.resume.") }
        for key in preferences + positions { defaults.removeObject(forKey: key) }
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ["weekly-private-check-in"])
        center.removeDeliveredNotifications(withIdentifiers: ["weekly-private-check-in"])
        try files.removeItem(at: marker)
        print("Logos personal data refreshed")
        #if !targetEnvironment(simulator)
        let manager = NEDNSSettingsManager.shared()
        manager.loadFromPreferences { error in
            if error == nil {
                print("Logos DNS after refresh: installed=\(manager.dnsSettings != nil) enabled=\(manager.isEnabled)")
            }
        }
        #endif
    }
    #endif
    func setLive(_ value: Bool) {
        live = value
        UserDefaults.standard.set(value, forKey: "reader.live")
    }
    private func restorePosition() {
        resume = UserDefaults.standard.data(forKey: "reader.resume." + owner).flatMap { try? JSONDecoder().decode(ReadingVerse.self, from: $0) }
    }
    func remember(_ verse: ReadingVerse) {
        resume = verse
        UserDefaults.standard.set(try? JSONEncoder().encode(verse), forKey: "reader.resume." + owner)
    }

    private func send(_ request: URLRequest) async throws -> Data {
        let (data, response) = try await ReaderTransport.session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let info = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            throw ReaderError(message: (info?["msg"] ?? info?["message"] ?? info?["error_description"]) as? String ?? "Request failed. Please try again.", status: status)
        }
        return data
    }
    private func auth(_ path: String, body: [String: String], token: String? = nil) async throws -> Data {
        guard let base = Self.apiOrigin, let url = URL(string: "/api/auth/" + path, relativeTo: base) else {
            throw ReaderError(message: "Configure the Logos API address for this build.")
        }
        var req = URLRequest(url: url, timeoutInterval: 18)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        req.httpBody = try JSONEncoder().encode(body)
        return try await send(req)
    }
    func sendSignInCode(email: String) async throws {
        struct Challenge: Decodable { let challenge: String }
        let data = try await auth("otp", body: ["email": email])
        loginChallenge = try JSONDecoder().decode(Challenge.self, from: data).challenge
    }

    func verifySignInCode(email: String, code: String) async throws {
        guard let loginChallenge else { throw ReaderError(message: "Request a fresh email code.") }
        let data = try await auth("verify", body: ["email": email, "token": code, "challenge": loginChallenge])
        let result = try JSONDecoder().decode(LogosSession.self, from: data)
        try SessionKeychain.save(result)
        session = result
        restorePosition()
        setLive(true)
    }
    func signOut() async throws {
        let old = session
        #if !targetEnvironment(simulator)
        if UserDefaults.standard.bool(forKey: "logos.accountDNSInstalled") {
            let manager = NEDNSSettingsManager.shared()
            try await manager.loadFromPreferences()
            if manager.dnsSettings != nil {
                manager.dnsSettings = ProtectionView.familiesDNS()
                try await manager.saveToPreferences()
            }
            UserDefaults.standard.removeObject(forKey: "logos.accountDNSInstalled")
        }
        #endif
        resolverURL = nil
        loginChallenge = nil
        try SessionKeychain.save(nil)
        session = nil
        restorePosition()
        if let old { _ = try? await auth("logout", body: [:], token: old.access_token) }
    }
    private func accessToken() async throws -> String {
        guard let current = session else { throw ReaderError(message: "Sign in to your Logos account.") }
        guard current.expires_at > Date.now.timeIntervalSince1970 else {
            try SessionKeychain.save(nil)
            session = nil
            restorePosition()
            throw ReaderError(message: "Your session expired. Sign in again.")
        }
        return current.access_token
    }
    func request<T: Decodable>(_ path: String, body: [String: Any]? = nil, personal: Bool = true) async throws -> T {
        try await apiRequest("reading/" + path, method: body == nil ? "GET" : "POST", body: body, personal: personal)
    }

    private var installationKey: String {
        "logos.installation." + (Self.apiOrigin?.absoluteString ?? "") + "." + owner + "." + (UIDevice.current.identifierForVendor?.uuidString ?? "local")
    }
    private func installationID() -> String {
        if let value = UserDefaults.standard.string(forKey: installationKey) { return value }
        let id = UUID().uuidString.lowercased()
        UserDefaults.standard.set(id, forKey: installationKey)
        return id
    }

    func connectPhone(reconnect: Bool = false) async throws {
        guard email != nil else { return }
        let key = installationKey + ".connected"
        var body: [String: Any] = ["installation": installationID(), "create": reconnect || !UserDefaults.standard.bool(forKey: key)]
        if let previous = previousDeviceCredential(for: Self.apiOrigin) { body["previous"] = previous }
        let identity = owner
        struct Connected: Decodable { let id: String; let resolverURL: URL? }
        let device: Connected = try await apiRequest("account/devices/connect", method:"POST", body:body, personal:true)
        guard identity == owner else { throw CancellationError() }
        // In the Mac-only stack, localhost points at the Mac, not this iPhone.
        if let url = device.resolverURL, url.scheme == "https", let host = url.host,
           !["localhost", "127.0.0.1", "::1", "[::1]"].contains(host.lowercased()) {
            resolverURL = url
        } else { resolverURL = nil }
        UserDefaults.standard.set(true, forKey:key)
    }
    func saveDeviceCheck(_ result: ProbeResult) async throws {
        let identity = owner
        try await connectPhone()
        guard owner == identity else { throw CancellationError() }
        let outcome: String
        switch result { case .blocked: outcome = "blocked"; case .open: outcome = "open"; case .unknown: outcome = "unknown" }
        struct Saved: Decodable { let checkedAt: Double }
        let _: Saved = try await apiRequest("account/devices/check", method:"POST", body:["installation":installationID(),"outcome":outcome],personal:true)
    }
    func setAlerts(for agreement: PartnerAgreement, enabled: Bool) async throws -> [PartnerAgreement] {
        try await apiRequest("account/agreements/" + agreement.id.uuidString.lowercased() + "/alerts", method:"PATCH", body:["enabled":enabled],personal:true)
    }
    func activity(for agreement: PartnerAgreement) async throws -> PartnerActivity {
        try await apiRequest("account/agreements/" + agreement.id.uuidString.lowercased() + "/activity",method:"GET",body:nil,personal:true)
    }
    func agreements() async throws -> [PartnerAgreement] {
        try await apiRequest("account/agreements", method: "GET", body: nil, personal: true)
    }

    func weeklyReport(for agreement: PartnerAgreement) async throws -> PartnerWeek {
        try await apiRequest("account/agreements/" + agreement.id.uuidString.lowercased() + "/report", method: "GET", body: nil, personal: true)
    }

    func invitePartner(_ recipient: String) async throws -> [PartnerAgreement] {
        try await apiRequest("account/agreements", method: "POST", body: ["username": recipient, "scope": PartnerAgreement.scope], personal: true)
    }

    func respond(to agreement: PartnerAgreement, action: String) async throws -> [PartnerAgreement] {
        try await apiRequest("account/agreements/" + agreement.id.uuidString.lowercased(), method: "PATCH", body: ["action": action, "scope": PartnerAgreement.scope], personal: true)
    }

    private func apiRequest<T: Decodable>(_ path: String, method: String, body: [String: Any]?, personal: Bool) async throws -> T {
        guard let base = Self.apiOrigin, let url = URL(string: "/api/" + path, relativeTo: base)?.absoluteURL else {
            throw ReaderError(message: "Configure the reading API address for this build.")
        }
        let initialOwner = owner
        var req = URLRequest(url: url, timeoutInterval: 18)
        if personal { req.setValue("Bearer " + (try await accessToken()), forHTTPHeaderField: "Authorization") }
        req.httpMethod = method
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let data = try await send(req)
        guard owner == initialOwner else { throw CancellationError() }
        return try JSONDecoder().decode(T.self, from: data)
    }
}
