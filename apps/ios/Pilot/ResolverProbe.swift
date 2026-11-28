import Darwin
import Foundation

enum ProbeResult: String {
    case blocked = "The safe category test was blocked and the control domain resolved."
    case open = "The safe category test returned a reachable address. Check your DNS selection and any VPN."
    case unknown = "Inconclusive. Check connectivity, then retry."

    static func evaluate(control: Set<String>, category: Set<String>) -> Self {
        let sinkholes: Set<String> = ["0.0.0.0", "::"]
        guard !control.isEmpty, control.isDisjoint(with: sinkholes), !category.isEmpty else { return .unknown }
        return category.isSubset(of: sinkholes) ? .blocked : .open
    }
}

enum ResolverProbe {
    static func addresses(for host: String) -> Set<String> {
        var hints = addrinfo()
        hints.ai_family = AF_UNSPEC
        hints.ai_socktype = SOCK_STREAM
        var first: UnsafeMutablePointer<addrinfo>?
        guard getaddrinfo(host, nil, &hints, &first) == 0, let first else { return [] }
        defer { freeaddrinfo(first) }
        var addresses = Set<String>()
        var cursor: UnsafeMutablePointer<addrinfo>? = first
        while let record = cursor?.pointee {
            var buffer = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            if getnameinfo(record.ai_addr, record.ai_addrlen, &buffer, socklen_t(buffer.count),
                           nil, 0, NI_NUMERICHOST) == 0 {
                addresses.insert(String(cString: buffer))
            }
            cursor = record.ai_next
        }
        return addresses
    }

    static func verifyEndpoint(_ endpoint: URL) async throws {
        // Request the known harmless A record before replacing a working DNS profile.
        var message = Data([0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0])
        for label in ["nudity", "testcategory", "com"] {
            message.append(UInt8(label.utf8.count))
            message.append(contentsOf: label.utf8)
        }
        message.append(contentsOf: [0, 0, 1, 0, 1])
        var request = URLRequest(url: endpoint, timeoutInterval: 6)
        request.httpMethod = "POST"
        request.setValue("application/dns-message", forHTTPHeaderField: "Content-Type")
        request.httpBody = message
        let (data, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200, response.mimeType == "application/dns-message",
              data.count >= message.count + 16, data[0] == 0, data[1] == 1, data[2] & 0x80 != 0,
              data[3] & 0x0f == 0, data[6] == 0, data[7] == 1,
              data.suffix(6).elementsEqual([0, 4, 0, 0, 0, 0]) else { throw URLError(.badServerResponse) }
    }

    static func run() -> ProbeResult {
        .evaluate(control: addresses(for: "example.com"), category: addresses(for: "nudity.testcategory.com"))
    }
}
