import CryptoKit
import Security
import SwiftUI
#if DEBUG
import NetworkExtension
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
private struct HostedSession: Codable {
    struct User: Codable { let id: UUID; let email: String }
    let access_token: String
    let refresh_token: String
    let expires_at: TimeInterval
    let user: User
}

struct ReaderError: LocalizedError {
    let message: String
    var status: Int = 0
    var errorDescription: String? { message }
}

private enum HostedAuthConfiguration {
    static let hostedProject = URL(string: "https://gazplkkplxiavofhvupb.supabase.co")!
    static let project: URL = {
        #if DEBUG && targetEnvironment(simulator)
        if let raw = Bundle.main.object(forInfoDictionaryKey: "SimulatorAuthOrigin") as? String,
           let url = URL(string: raw), url.scheme == "http", url.host == "127.0.0.1" { return url }
        #endif
        #if DEBUG
        if Bundle.main.object(forInfoDictionaryKey: "LocalEmailTest") as? String == "YES",
           let url = ReaderAccount.apiOrigin, url.scheme == "https",
           url.host?.hasSuffix(".local") == true { return url }
        #endif
        return hostedProject
    }()
}
private enum SessionKeychain {
    static let key: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "org.logos.reader." + HostedAuthConfiguration.project.absoluteString, kSecAttrAccount as String: "session"]
    static func load() throws -> HostedSession? {
        var query = key
        query[kSecReturnData as String] = true
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = item as? Data else { throw ReaderError(message: "Unlock your iPhone to access your Logos account.") }
        return try JSONDecoder().decode(HostedSession.self, from: data)
    }
    static func save(_ value: HostedSession?) throws {
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

private final class ReaderTransport: NSObject, URLSessionTaskDelegate {
    static let session = URLSession(configuration: .ephemeral, delegate: ReaderTransport(), delegateQueue: nil)
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
    func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge,
                    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        #if DEBUG
        if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
           let host = ReaderAccount.apiOrigin?.host, challenge.protectionSpace.host.caseInsensitiveCompare(host) == .orderedSame,
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
    private let authOrigin = HostedAuthConfiguration.project.absoluteString + "/auth/v1/"
    private let publicKey = "sb_publishable_1DAJK7QWBhBtEEDDe5DVGw_tXQMrdJ9"
    @Published private var session: HostedSession?
    @Published var resume: ReadingVerse?
    @Published var live: Bool
    private var refreshing: Task<HostedSession, Error>?
    var email: String? { session?.user.email }
    var usesLocalTestInbox: Bool {
        #if DEBUG
        return Bundle.main.object(forInfoDictionaryKey: "LocalEmailTest") as? String == "YES"
            && HostedAuthConfiguration.project != HostedAuthConfiguration.hostedProject
        #else
        return false
        #endif
    }
    var owner: String { session?.user.id.uuidString ?? "guest" }
    init() {
        let defaults = UserDefaults.standard
        live = defaults.object(forKey: "reader.live") == nil ? Self.apiOrigin != nil : defaults.bool(forKey: "reader.live")
        session = try? SessionKeychain.load()
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
        var req = URLRequest(url: URL(string: authOrigin + path)!, timeoutInterval: 15)
        req.httpMethod = "POST"
        if HostedAuthConfiguration.project == HostedAuthConfiguration.hostedProject {
            req.setValue(publicKey, forHTTPHeaderField: "apikey")
        }
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        req.httpBody = try JSONEncoder().encode(body)
        return try await send(req)
    }
    func sendSignInCode(email: String) async throws {
        _ = try await auth("otp", body: ["email": email])
    }

    func verifySignInCode(email: String, code: String) async throws {
        let data = try await auth("verify", body: ["email": email, "token": code, "type": "email"])
        let result = try JSONDecoder().decode(HostedSession.self, from: data)
        try SessionKeychain.save(result)
        session = result
        restorePosition()
        setLive(true)
    }
    func signOut() async throws {
        let old = session
        refreshing?.cancel()
        refreshing = nil
        try SessionKeychain.save(nil)
        session = nil
        restorePosition()
        if let old { _ = try? await auth("logout?scope=local", body: [:], token: old.access_token) }
    }
    private func accessToken() async throws -> String {
        guard let current = session else { throw ReaderError(message: "Sign in to your Logos account.") }
        if current.expires_at > Date.now.timeIntervalSince1970 + 45 { return current.access_token }
        if let refreshing { return try await refreshing.value.access_token }
        let task = Task {
            let data = try await auth("token?grant_type=refresh_token", body: ["refresh_token": current.refresh_token])
            let result = try JSONDecoder().decode(HostedSession.self, from: data)
            try Task.checkCancellation()
            guard result.user.id == current.user.id && session?.refresh_token == current.refresh_token else { throw CancellationError() }
            try SessionKeychain.save(result)
            session = result
            return result
        }
        refreshing = task
        defer { refreshing = nil }
        return try await task.value.access_token
    }
    func request<T: Decodable>(_ path: String, body: [String: Any]? = nil, personal: Bool = true) async throws -> T {
        guard let base = Self.apiOrigin, let url = URL(string: "/api/reading/" + path, relativeTo: base)?.absoluteURL else {
            throw ReaderError(message: "Configure the reading API address for this build.")
        }
        let initialOwner = owner
        var req = URLRequest(url: url, timeoutInterval: 18)
        if personal { req.setValue("Bearer " + (try await accessToken()), forHTTPHeaderField: "Authorization") }
        if let body {
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let data = try await send(req)
        guard owner == initialOwner else { throw CancellationError() }
        return try JSONDecoder().decode(T.self, from: data)
    }
}
