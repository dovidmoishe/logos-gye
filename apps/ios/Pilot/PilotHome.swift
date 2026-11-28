import SwiftUI
import UserNotifications

enum PilotTheme {
    static let canvas = adaptive(light: (0.982, 0.977, 0.963), dark: (0.105, 0.105, 0.11))
    static let card = adaptive(light: (1, 1, 1), dark: (0.16, 0.16, 0.17))
    static let lilac = adaptive(light: (0.37, 0.28, 0.47), dark: (0.8, 0.7, 0.92))
    static let title = Font.custom("Urbanist-SemiBold", size: 36, relativeTo: .largeTitle)
    static let prompt = Font.custom("Urbanist-SemiBold", size: 27, relativeTo: .title)

    private static func adaptive(light: (CGFloat, CGFloat, CGFloat), dark: (CGFloat, CGFloat, CGFloat)) -> Color {
        Color(uiColor: UIColor { traits in
            let rgb = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: rgb.0, green: rgb.1, blue: rgb.2, alpha: 1)
        })
    }
}

extension View {
    func screenTitle(_ title: String) -> some View {
        navigationTitle(title).toolbarTitleDisplayMode(.inlineLarge)
    }
}

private enum AppTab: Hashable {
    case home, read, protection
}

private enum HomeSheet: String, Identifiable {
    case checkIn, settings
    var id: Self { self }
}

struct PilotHome: View {
    @AppStorage("homeIntroductionComplete") private var onboarded = false
    @AppStorage("faithMode") private var faith = false
    @AppStorage("darkAppearance") private var dark = false
    @AppStorage("readingVerse") private var readingVerse = 0
    @State private var tab = AppTab.home
    @State private var sheet: HomeSheet?
    @AppStorage("introAccountPending") private var accountPending = false
    @State private var replay = false
    @StateObject private var reader = ReaderAccount()
    @State private var readerPath = NavigationPath()

    var body: some View {
        Group {
            if accountPending {
                NavigationStack {
                    ReaderSignIn(afterIntroduction: true, continueAsGuest: { accountPending = false }) {
                        accountPending = false
                    }
                }
                .onAppear { if reader.email != nil { accountPending = false } }
            } else if onboarded && !replay {
                TabView(selection: $tab) {
                    HomeView(reference: reader.live ? reader.resume?.reference : ((1...6).contains(readingVerse) ? "Psalm 23:\(readingVerse)" : nil), checkIn: { sheet = .checkIn }, read: {
                        readerPath = NavigationPath()
                        tab = .read
                    }, settings: { sheet = .settings })
                    .tabItem { Label("Home", systemImage: "house") }.tag(AppTab.home)
                    NavigationStack(path: $readerPath) {
                        if reader.live {
                            LiveReader(finish: { tab = .home })
                        } else {
                            ScriptureReader(verse: $readingVerse, finish: { tab = .home })
                                .toolbar { Button("Explore KJV") { reader.setLive(true) } }
                        }
                    }
                    .tabItem { Label("Read", systemImage: "book") }.tag(AppTab.read)
                    NavigationStack { ProtectionView() }
                        .tabItem { Label("Protection", systemImage: "shield") }.tag(AppTab.protection)
                }
                .sheet(item: $sheet) { item in
                    switch item {
                    case .checkIn:
                        PauseView(faith: $faith)
                    case .settings:
                        PilotSettings(faith: $faith, dark: $dark) {
                            sheet = nil
                            replay = true
                        }
                    }
                }
            } else {
                WelcomeFlow(faith: $faith) {
                    let firstVisit = !onboarded
                    tab = .home
                    readerPath = NavigationPath()
                    onboarded = true
                    replay = false
                    accountPending = firstVisit && reader.email == nil
                }
            }
        }
        .font(.custom("Satoshi-Regular", size: 17, relativeTo: .body))
        .tint(PilotTheme.lilac)
        .environmentObject(reader)
        .preferredColorScheme(dark ? .dark : .light)
    }

}

private struct HomeView: View {
    let reference: String?
    let checkIn: () -> Void
    let read: () -> Void
    let settings: () -> Void
    @AppStorage("checkInDays") private var savedDays = ""
    @AppStorage("lastCheckIn") private var lastCheckIn = 0.0

    var body: some View {
        NavigationStack {
            TimelineView(.periodic(from: .now, by: 60)) { timeline in
                let days = CheckInDays.records(savedDays, latest: lastCheckIn)
                let week = CheckInDays.trailingWeek(timeline.date)
                let streak = CheckInDays.streak(days, on: timeline.date)
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        VStack(alignment: .leading, spacing: 16) {
                            Label("Check-in streak", systemImage: "sun.horizon").font(.headline)
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text("\(streak)").font(.custom("Urbanist-SemiBold", size: 60, relativeTo: .largeTitle))
                                Text(streak == 1 ? "day" : "days").foregroundStyle(.secondary)
                            }
                            Divider()
                            HStack {
                                ForEach(week, id: \.self) { date in
                                    let checked = days.contains(CheckInDays.key(date))
                                    VStack(spacing: 6) {
                                        Text(date.formatted(.dateTime.weekday(.narrow))).font(.caption)
                                        Image(systemName: checked ? "checkmark.circle.fill" : "circle")
                                            .foregroundStyle(checked ? PilotTheme.lilac : .secondary)
                                    }.frame(maxWidth: .infinity)
                                        .accessibilityElement(children: .ignore)
                                        .accessibilityLabel(date.formatted(date: .long, time: .omitted) + (checked ? ", checked in" : ", no check-in"))
                                }
                            }
                            Text("\(week.filter { days.contains(CheckInDays.key($0)) }.count) of the last 7 days").font(.footnote)
                        }.padding(22).background(PilotTheme.lilac.opacity(0.09), in: RoundedRectangle(cornerRadius: 24))
                        Button(action: checkIn) {
                            Label("Check in", systemImage: "plus").frame(maxWidth: .infinity).padding(.vertical, 6)
                        }.buttonStyle(.borderedProminent).controlSize(.large)
                        if let reference {
                            Button(action: read) {
                                HStack {
                                    Image(systemName: "book")
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text("Continue reading").font(.headline)
                                        Text(reference).font(.subheadline).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right").font(.caption)
                                }.padding().background(PilotTheme.card, in: RoundedRectangle(cornerRadius: 14))
                            }.buttonStyle(.plain)
                        }
                    }.padding(22).frame(maxWidth: 540)
                }.frame(maxWidth: .infinity).background(PilotTheme.canvas)
            }
            .screenTitle("Home")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Settings", systemImage: "gearshape", action: settings)
                }
            }
        }
    }
}

enum CheckInDays {
    static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        return calendar
    }
    static func key(_ date: Date) -> String {
        let d = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", d.year!, d.month!, d.day!)
    }
    static func records(_ saved: String, latest: Double) -> Set<String> {
        var days = Set(saved.split(separator: ",").map(String.init))
        if days.isEmpty && latest > 0 { days.insert(key(Date(timeIntervalSince1970: latest))) }
        return days
    }
    static func trailingWeek(_ date: Date) -> [Date] {
        (-6...0).compactMap { calendar.date(byAdding: .day, value: $0, to: date) }
    }
    static func streak(_ days: Set<String>, on date: Date) -> Int {
        var cursor = calendar.startOfDay(for: date)
        if !days.contains(key(cursor)) { cursor = calendar.date(byAdding: .day, value: -1, to: cursor)! }
        var count = 0
        while days.contains(key(cursor)) {
            count += 1
            cursor = calendar.date(byAdding: .day, value: -1, to: cursor)!
        }
        return count
    }
}

private struct WelcomeFlow: View {
    @Binding var faith: Bool
    let onFinish: () -> Void
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var step = 0
    private let headings = ["Meet Logos.", "Choose your style.", "Your privacy."]
    private let details = [
        "Block adult sites. Take a daily pause.",
        "What kind of encouragement would you like?",
        "When the filter is on, Cloudflare for Families receives DNS requests. Check-ins stay on this phone. Partner reports require your agreement."
    ]

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                if step > 0 {
                    Button { step -= 1 } label: {
                        Image(systemName: "arrow.left").frame(width: 44, height: 44)
                    }.accessibilityLabel("Back")
                } else { BrandMark(size: 36) }
                Spacer()
                Text("Step \(step + 1) of 3").font(.footnote.monospacedDigit()).foregroundStyle(.secondary)
            }.padding(.horizontal, 24).frame(height: 56)
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text(headings[step]).font(PilotTheme.title).accessibilityAddTraits(.isHeader)
                    Text(details[step]).foregroundStyle(.secondary).lineSpacing(4)
                    if step == 0 {
                        Image("WelcomeJournal").resizable().scaledToFit().frame(maxHeight: 260).accessibilityHidden(true)
                    }
                    if step == 1 {
                        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 12)) : AnyLayout(HStackLayout(spacing: 12))
                        layout {
                            ForEach([false, true], id: \.self) { choice in
                                Button {
                                    faith = choice
                                } label: {
                                    VStack(alignment: .leading, spacing: 18) {
                                        HStack {
                                            Image(systemName: choice ? "sunrise.fill" : "leaf.fill")
                                                .frame(width: 44, height: 44).foregroundStyle(.white)
                                                .background(choice ? PilotTheme.lilac : Color.black, in: Circle())
                                            Spacer()
                                            Image(systemName: faith == choice ? "checkmark.circle.fill" : "circle")
                                                .foregroundStyle(PilotTheme.lilac)
                                        }.accessibilityHidden(true)
                                        Text(choice ? "Christian encouragement" : "Neutral encouragement")
                                            .font(.custom("Urbanist-SemiBold", size: 18, relativeTo: .headline))
                                            .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                                    }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
                                        .background(PilotTheme.card, in: RoundedRectangle(cornerRadius: 20))
                                        .overlay { RoundedRectangle(cornerRadius: 20).strokeBorder(PilotTheme.lilac.opacity(faith == choice ? 0.65 : 0.12)) }
                                }.buttonStyle(.plain)
                                    .accessibilityAddTraits(faith == choice ? .isSelected : [])
                            }
                        }
                    } else if step == 2 {
                        Label("You can remove the filter anytime.", systemImage: "lock.open")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }.frame(maxWidth: 480, alignment: .leading)
                    .padding(.horizontal, 28).padding(.top, 64).padding(.bottom, 24)
            }.frame(maxWidth: .infinity)
            VStack(spacing: 12) {
                if step == 2 { Text("For adults setting up their own iPhone.").font(.footnote).foregroundStyle(.secondary) }
                Button {
                    if step == 2 { onFinish() } else { step += 1 }
                } label: {
                    Text(step == 2 ? "Finish introduction" : "Continue")
                        .font(.headline).frame(maxWidth: .infinity).padding(.vertical, 15)
                        .foregroundStyle(PilotTheme.canvas).background(Color.primary, in: Capsule())
                }.buttonStyle(.plain)
            }.frame(maxWidth: 480).padding(24)
        }.frame(maxWidth: .infinity).background(PilotTheme.canvas)
    }
}

struct BrandMark: View {
    let size: CGFloat
    var body: some View {
        Image("BrandMark").resizable().scaledToFit().frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: size * 0.22)).accessibilityHidden(true)
    }
}

private struct ModePicker: View {
    @Binding var faith: Bool
    var body: some View {
        Picker("Encouragement style", selection: $faith) {
            Text("Neutral").tag(false)
            Text("Christian").tag(true)
        }.pickerStyle(.segmented)
    }
}

private struct PauseView: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var faith: Bool
    @AppStorage("lastCheckIn") private var lastCheckIn = 0.0
    @AppStorage("lastFeeling") private var lastFeeling = ""
    @State private var feeling = ""
    @AppStorage("checkInDays") private var savedDays = ""
    var body: some View {
        NavigationStack {
            Form {
                Section("Encouragement") { ModePicker(faith: $faith) }
                Section {
                    VStack(alignment: .leading, spacing: 12) {
                        Image(systemName: faith ? "sunrise" : "leaf").foregroundStyle(PilotTheme.lilac)
                        Text(faith ? "A moment for prayer" : "Take one breath").font(PilotTheme.prompt)
                        Text(faith ? "Take a quiet breath. Ask God for the strength to choose your next step." : "Let your shoulders drop. Take a slow breath and choose one small thing you want to do next.")
                    }.padding(.vertical, 10)
                }.listRowBackground(PilotTheme.card)
                Section {
                    Picker("How are you feeling?", selection: $feeling) {
                        Text("Choose a feeling").tag("")
                        ForEach(["Steady", "Having a hard moment", "Ready to refocus"], id: \.self) { Text($0) }
                    }
                    Button("Save check-in") {
                        let now = Date.now
                        var days = CheckInDays.records(savedDays, latest: lastCheckIn)
                        days.insert(CheckInDays.key(now))
                        savedDays = days.sorted().joined(separator: ",")
                        lastFeeling = feeling
                        lastCheckIn = now.timeIntervalSince1970
                        dismiss()
                    }.disabled(feeling.isEmpty)
                } header: { Text("Voluntary check-in") } footer: {
                    Text("Your latest feeling and check-in dates stay on this iPhone.")
                }
                if lastCheckIn > 0 {
                    Section("Latest check-in") {
                        Text(lastFeeling)
                        Text(Date(timeIntervalSince1970: lastCheckIn).formatted()).font(.footnote)
                        Button("Delete check-in", role: .destructive) {
                            var days = CheckInDays.records(savedDays, latest: lastCheckIn)
                            days.remove(CheckInDays.key(Date(timeIntervalSince1970: lastCheckIn)))
                            savedDays = days.sorted().joined(separator: ",")
                            lastCheckIn = 0
                            lastFeeling = ""
                        }
                    }
                }
            }.screenTitle("Check in").toolbar { Button("Done") { dismiss() } }.scrollContentBackground(.hidden).background(PilotTheme.canvas)
        }
    }
}

private struct PilotSettings: View {
    @Binding var faith: Bool
    @Binding var dark: Bool
    let showIntroduction: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var enabled = false
    @State private var busy = false
    @State private var message = ""
    @Environment(\.scenePhase) private var phase
    private let reminderID = "weekly-private-check-in"

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle("Dark appearance", isOn: $dark)
                    Button("View introduction", action: showIntroduction)
                }
                Section("Encouragement") { ModePicker(faith: $faith) }
                Section {
                    Toggle("Weekly check-in reminder", isOn: Binding(get: { enabled }, set: { value in
                        busy = true
                        Task { await setReminder(value); busy = false }
                    })).disabled(busy)
                    if !message.isEmpty { Text(message) }
                } footer: { Text("Sundays at 6 PM, local time. The notification simply says “Time for a check-in.”") }
            }.screenTitle("Settings").toolbar { Button("Done") { dismiss() } }.scrollContentBackground(.hidden).background(PilotTheme.canvas)
            .task(id: phase) {
                if phase == .active {
                    let center = UNUserNotificationCenter.current()
                    let pending = await center.pendingNotificationRequests()
                    let authorization = await center.notificationSettings().authorizationStatus
                    enabled = authorization != .denied && pending.contains { $0.identifier == reminderID }
                }
            }
        }
    }

    @MainActor private func setReminder(_ value: Bool) async {
        let center = UNUserNotificationCenter.current()
        message = ""
        if !value {
            center.removePendingNotificationRequests(withIdentifiers: [reminderID])
            enabled = false
            return
        }
        do {
            guard try await center.requestAuthorization(options: [.alert]) else {
                message = "Allow notifications for Logos in iPhone Settings to use reminders."
                return
            }
            let content = UNMutableNotificationContent()
            content.body = "Time for a check-in."
            var time = DateComponents()
            time.weekday = 1
            time.hour = 18
            time.minute = 0
            let trigger = UNCalendarNotificationTrigger(dateMatching: time, repeats: true)
            try await center.add(UNNotificationRequest(identifier: reminderID, content: content, trigger: trigger))
            enabled = true
        } catch { message = "The reminder could not be scheduled. Please retry." }
    }
}
