import FamilyControls
import ManagedSettings
import SwiftUI

struct ScreenTimeProtection: View {
    @Environment(\.scenePhase) private var phase
    @ObservedObject private var authorization = AuthorizationCenter.shared
    @AppStorage("logos.shield.selection") private var saved = Data()
    @State private var selection = FamilyActivitySelection()
    @State private var choosing = false
    @State private var error = ""
    private let store = ManagedSettingsStore(named: .init("logos.boundaries"))

    var body: some View {
        Section {
            if authorization.authorizationStatus == .approved {
                Button("Choose apps and websites") { choosing = true }
                if !saved.isEmpty {
                    Button("Clear shield selections", role: .destructive) {
                        apply(FamilyActivitySelection())
                    }
                }
            } else {
                Button("Enable Screen Time shield") {
                    Task {
                        do {
                            try await authorization.requestAuthorization(for: .individual)
                            error = ""
                            choosing = true
                        } catch { self.error = error.localizedDescription }
                    }
                }
            }
            if !error.isEmpty { Text(error).font(.footnote) }
        } header: {
            Text("Screen Time shield")
        } footer: {
            Text("Selected apps and websites open a Logos pause screen. DNS filtering runs separately.")
        }
        .familyActivityPicker(isPresented: $choosing, selection: $selection)
        .onChange(of: selection) { _, value in
            if authorization.authorizationStatus == .approved { apply(value) }
        }
        .task(id: phase) {
            guard phase == .active else { return }
            if authorization.authorizationStatus == .approved,
               let restored = try? JSONDecoder().decode(FamilyActivitySelection.self, from: saved) {
                apply(restored)
            } else if authorization.authorizationStatus == .denied {
                apply(FamilyActivitySelection())
            }
        }
    }

    private func apply(_ value: FamilyActivitySelection) {
        selection = value
        let apps = value.applicationTokens
        let domains = value.webDomainTokens
        let categories = value.categoryTokens
        store.shield.applications = apps.isEmpty ? nil : apps
        store.shield.webDomains = domains.isEmpty ? nil : domains
        store.shield.applicationCategories = categories.isEmpty ? nil : .specific(categories)
        store.shield.webDomainCategories = categories.isEmpty ? nil : .specific(categories)
        saved = apps.isEmpty && domains.isEmpty && categories.isEmpty ? Data() : (try? JSONEncoder().encode(value)) ?? Data()
    }
}
