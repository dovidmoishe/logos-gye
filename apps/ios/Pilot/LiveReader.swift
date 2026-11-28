import SwiftUI

private enum ReaderSheet: String, Identifiable {
    case account, onboarding, topics, saved
    var id: Self { self }
}
private struct ReadingProfile: Decodable { let onboardingCompletedAt: String? }
private struct EventReceipt: Decodable { let accepted: Int }

struct LiveReader: View {
    let finish: () -> Void
    @EnvironmentObject private var account: ReaderAccount
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var verses: [ReadingVerse] = []
    @State private var page: UUID?
    @State private var liked: Set<UUID> = []
    @State private var sharing: ReadingVerse?
    @State private var cursor: String?
    @State private var saved: [ReadingVerse] = []
    @State private var sheet: ReaderSheet?
    @State private var chapter: ReadingVerse?
    @State private var message: String?
    @State private var requestID: UUID?
    private var fetching: Bool { requestID != nil }
    @State private var libraryReady = false
    @State private var offlineChapter = false
    @State private var mutating = false
    @State private var appearedAt = Date.now
    private var current: ReadingVerse? { verses.first { $0.id == page } }

    var body: some View {
        VStack(spacing: 0) {
            if let message {
                HStack {
                    Text(message).font(.footnote)
                    Spacer()
                    Button("Retry") { Task { await load(reset: true) } }
                }.padding()
            }
            if verses.isEmpty {
                VStack(alignment: .leading, spacing: 18) {
                    Spacer(minLength: 0)
                    Text("Psalm 23:1 · KJV").font(.headline).foregroundStyle(PilotTheme.lilac)
                    ScrollViewIfNeeded(text: ScriptureReader.verses[0])
                    Button("Read Psalm 23 offline") { offlineChapter = true }.buttonStyle(.bordered)
                    Spacer(minLength: 0)
                    if fetching { ProgressView("Loading verses…").font(.footnote) }
                }.padding(24).frame(maxWidth: 560, maxHeight: .infinity, alignment: .leading)
                    .frame(maxWidth: .infinity)
            } else if typeSize.isAccessibilitySize {
                if let verse = current ?? verses.first { ScrollView { card(verse) } }
            } else {
                ScrollViewReader { proxy in
                    ScrollView(.vertical) {
                        LazyVStack(spacing: 0) {
                            ForEach(verses) { verse in card(verse).containerRelativeFrame(.vertical).id(verse.id) }
                        }.scrollTargetLayout()
                    }.scrollIndicators(.hidden).scrollTargetBehavior(.paging)
                    .scrollPosition(id: $page)
                    .onAppear { if let page { proxy.scrollTo(page, anchor: .top) } }
                }
            }
        }
        .background(PilotTheme.canvas).screenTitle("Read")
        .toolbar {
            Menu {
                Button(account.email ?? "Sign in to Logos", systemImage: "person.crop.circle") { sheet = .account }
                if account.email != nil {
                    Button("Reading topics", systemImage: "slider.horizontal.3") { sheet = .topics }
                    Button("Saved verses", systemImage: "bookmark") { sheet = .saved }
                }
                Button("Offline Psalm 23", systemImage: "book.closed") { account.setLive(false) }
            } label: { Label("Reader options", systemImage: "ellipsis.circle") }
        }
        .task(id: account.owner) {
            await load(reset: true)
            if account.email != nil, sheet == nil, !Task.isCancelled {
                let profile: ReadingProfile? = try? await account.request("users/me")
                if let profile, profile.onboardingCompletedAt == nil, sheet == nil, !Task.isCancelled { sheet = .onboarding }
            }
        }
        .sheet(item: $sheet) { selected in
            NavigationStack {
                switch selected {
                case .account:
                    ReaderSignIn {
                        do {
                            let profile: ReadingProfile = try await account.request("users/me")
                            sheet = profile.onboardingCompletedAt == nil ? .onboarding : nil
                        } catch { sheet = nil; message = error.localizedDescription }
                    }
                case .topics, .onboarding:
                    TopicPicker(onboarding: selected == .onboarding) { await load(reset: true, restore: false) }
                case .saved:
                    List {
                        if saved.isEmpty { Text("Your saved verses will appear here.") }
                        ForEach(saved) { verse in
                            NavigationLink { LiveChapter(anchor: verse) } label: {
                                VStack(alignment: .leading) { Text(verse.reference).font(.headline); Text(verse.text).lineLimit(2) }
                            }
                        }
                    }.screenTitle("Saved verses").toolbar { Button("Done") { sheet = nil } }
                }
            }
        }
        .sheet(item: $sharing) { verse in
            VerseShare(verse: verse) {
                if account.email != nil {
                    Task { do { try await event("VERSE_SHARE", verse: verse.id) } catch { message = error.localizedDescription } }
                }
            }
        }
        .navigationDestination(isPresented: $offlineChapter) { PsalmChapter(selected: 1) }
        .navigationDestination(item: $chapter) { LiveChapter(anchor: $0) }
        .onChange(of: page) { before, after in
            guard let verse = verses.first(where: { $0.id == after }) else { return }
            let duration = min(60000, max(0, Int(Date.now.timeIntervalSince(appearedAt) * 1000)))
            appearedAt = .now
            account.remember(verse)
            if account.email != nil {
                Task {
                    do {
                        if let before { try await event(duration < 900 ? "VERSE_SKIP" : "VERSE_READ", verse: before, duration: duration) }
                        try await event("VERSE_IMPRESSION", verse: verse.id)
                    } catch { if !Task.isCancelled { message = error.localizedDescription } }
                }
            }
        }
    }

    private func card(_ verse: ReadingVerse) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            Spacer(minLength: 0)
            Text(verse.reference + " · " + verse.translation.code).font(.headline).foregroundStyle(PilotTheme.lilac)
            ScrollViewIfNeeded(text: verse.text)
            ViewThatFits {
                HStack { chapterButton(verse); saveButton(verse) }
                VStack(alignment: .leading) { chapterButton(verse); saveButton(verse) }
            }
            Spacer(minLength: 0)
            HStack {
                Menu {
                    Button(liked.contains(verse.id) ? "Unlike" : "Like", systemImage: "heart") {
                        guard account.email != nil else { sheet = .account; return }
                        let remove = liked.contains(verse.id)
                        mutating = true
                        Task {
                            defer { mutating = false }
                            do {
                                try await event(remove ? "VERSE_UNLIKE" : "VERSE_LIKE", verse: verse.id)
                                if remove { liked.remove(verse.id) } else { liked.insert(verse.id) }
                            } catch { message = error.localizedDescription }
                        }
                    }.disabled(mutating || (account.email != nil && !libraryReady))
                    Button("Share", systemImage: "square.and.arrow.up") { sharing = verse }
                } label: { Label("Verse actions", systemImage: "ellipsis") }
                Spacer()
                if verse.id == verses.last?.id {
                    Button("Finish reading", action: finish)
                }
                Button(verse.id == verses.last?.id ? (account.email == nil ? "Sign in" : "Keep reading") : "Next verse", systemImage: "arrow.down") {
                    if verse.id == verses.last?.id, account.email == nil {
                        sheet = .account
                        return
                    }
                    Task {
                        guard let index = verses.firstIndex(where: { $0.id == verse.id }) else { return }
                        if index + 1 == verses.count, cursor != nil { await load(reset: false) }
                        if index + 1 < verses.count { withAnimation { page = verses[index + 1].id } }
                    }
                }.disabled(fetching && account.email != nil && verse.id == verses.last?.id)
            }.font(.subheadline)
        }.padding(24).frame(maxWidth: 560, maxHeight: .infinity).frame(maxWidth: .infinity)
    }
    private func chapterButton(_ verse: ReadingVerse) -> some View {
        Button("Read chapter") { chapter = verse }.buttonStyle(.bordered)
    }
    private func saveButton(_ verse: ReadingVerse) -> some View {
        let isSaved = saved.contains { $0.id == verse.id }
        return Button(isSaved ? "Unsave" : "Save", systemImage: isSaved ? "bookmark.fill" : "bookmark") {
            guard account.email != nil else { sheet = .account; return }
            mutating = true
            Task {
                defer { mutating = false }
                do {
                    try await event(isSaved ? "VERSE_UNSAVE" : "VERSE_SAVE", verse: verse.id)
                    saved.removeAll { $0.id == verse.id }
                    if !isSaved { saved.insert(verse, at: 0) }
                } catch { message = error.localizedDescription }
            }
        }.disabled(mutating || (account.email != nil && !libraryReady))
    }
    private func event(_ kind: String, verse: UUID, duration: Int = 0) async throws {
        let receipt: EventReceipt = try await account.request("interactions", body: [
            "eventType": kind, "verseId": verse.uuidString, "requestId": UUID().uuidString, "durationMs": duration
        ])
        guard receipt.accepted == 1 else { throw ReaderError(message: "Could not record this action.") }
    }
    private func load(reset: Bool, restore: Bool = true) async {
        guard reset || !fetching else { return }
        let owner = account.owner
        let id = UUID()
        requestID = id
        defer { if requestID == id { requestID = nil } }
        do {
            let incoming: [ReadingVerse]
            if account.email != nil {
                let next = reset ? nil : cursor
                let path = next.map { "feed?cursor=" + $0 } ?? "feed"
                let feed: FeedPage
                do { feed = try await account.request(path) } catch let error as ReaderError where next != nil && error.status == 404 {
                    feed = try await account.request("feed")
                }
                guard owner == account.owner, requestID == id, !Task.isCancelled else { return }
                incoming = feed.items.map(\.verse)
                cursor = feed.nextCursor
            } else {
                let response: VerseList = try await account.request("discover", personal: false)
                guard owner == account.owner, requestID == id, !Task.isCancelled else { return }
                incoming = response.verses
                cursor = nil
            }
            try Task.checkCancellation()
            let previous = (reset && restore ? account.resume : nil).flatMap { cached in
                let canonical = incoming.first { $0.reference == cached.reference && $0.translation.code == cached.translation.code }
                return canonical ?? (account.email == nil ? nil : cached)
            }
            var list = reset ? previous.map { [$0] } ?? [] : verses
            var known = Set(list.map(\.id))
            list.append(contentsOf: incoming.filter { known.insert($0.id).inserted })
            verses = list
            if reset { page = list.first?.id }
            message = list.isEmpty ? "Your feed has no verses yet." : nil
            if reset && account.email != nil && !libraryReady {
                let library: ReaderLibrary = try await account.request("library")
                guard owner == account.owner, requestID == id, !Task.isCancelled else { return }
                saved = library.saved
                liked = Set(library.liked)
                libraryReady = true
            }
        } catch {
            guard owner == account.owner, requestID == id, !Task.isCancelled else { return }
            message = error.localizedDescription
        }
    }
}

private struct ScrollViewIfNeeded: View {
    let text: String
    var body: some View {
        let verse = Text(text).font(.custom("Urbanist-SemiBold", size: 30, relativeTo: .title)).fixedSize(horizontal: false, vertical: true)
        ViewThatFits(in: .vertical) { verse; ScrollView { verse } }
    }
}

private struct LiveChapter: View {
    let anchor: ReadingVerse
    @EnvironmentObject private var account: ReaderAccount
    @State private var verses: [ReadingVerse] = []
    @State private var error: String?
    @State private var attempt = 0
    var body: some View {
        Group {
            if let error { VStack { Text(error); Button("Retry") { attempt += 1 } } }
            else if verses.isEmpty { ProgressView() }
            else {
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 12) {
                            Text(anchor.translation.name).font(.subheadline)
                            ForEach(verses) { verse in
                                Text("\(verse.verse)   \(verse.text)").frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(10).background(verse.id == anchor.id ? PilotTheme.lilac.opacity(0.12) : .clear,
                                                            in: RoundedRectangle(cornerRadius: 12)).id(verse.id)
                            }
                        }.padding()
                    }.onAppear { proxy.scrollTo(anchor.id, anchor: .center) }
                }
            }
        }.screenTitle("\(anchor.book) \(anchor.chapter)")
        .task(id: attempt) {
            error = nil
            do { let result: VerseList = try await account.request("verses/" + anchor.id.uuidString + "/chapter", personal: false); verses = result.verses }
            catch { self.error = error.localizedDescription }
        }
    }
}

struct ReaderSignIn: View {
    let afterIntroduction: Bool
    let continueAsGuest: (() -> Void)?
    let didSignIn: () async -> Void
    @EnvironmentObject private var account: ReaderAccount
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var code = ""
    @State private var sentTo: String?
    @State private var busy = false
    @State private var message = ""
    @FocusState private var focus: Field?

    private enum Field { case email, code }

    init(afterIntroduction: Bool = false, continueAsGuest: (() -> Void)? = nil, didSignIn: @escaping () async -> Void) {
        self.afterIntroduction = afterIntroduction
        self.continueAsGuest = continueAsGuest
        self.didSignIn = didSignIn
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 26) {
                BrandMark(size: 52)
                if let signedIn = account.email, !afterIntroduction {
                    heading("Your account", signedIn)
                    Button("Sign out", role: .destructive) {
                        busy = true
                        Task {
                            defer { busy = false }
                            do { try await account.signOut(); dismiss() }
                            catch { message = error.localizedDescription }
                        }
                    }.disabled(busy)
                    feedback
                } else if let sentTo {
                    heading("Check your email", account.usesLocalTestInbox ? "Open Mailpit on your Mac and enter the code for " + sentTo + "." : "Enter the code sent to " + sentTo + ".")
                    field("Email code", icon: "number", active: focus == .code) {
                        TextField("Enter code", text: $code)
                            .accessibilityLabel("Email code").keyboardType(.numberPad).textContentType(.oneTimeCode)
                            .focused($focus, equals: .code)
                            .onChange(of: code) { _, value in
                                let digits = value.filter { $0.isNumber }.compactMap(\.wholeNumberValue).filter { $0 < 10 }
                                code = digits.prefix(8).map(String.init).joined()
                            }
                    }.disabled(busy)
                    feedback
                    primary(busy ? "Please wait…" : "Verify code", enabled: !busy) { verify(sentTo) }
                    HStack {
                        Button("Use another email") {
                            self.sentTo = nil; code = ""; message = ""; focus = .email
                        }
                        Spacer()
                        Button("Resend code") { send(sentTo) }
                    }.font(.subheadline).disabled(busy)
                } else {
                    heading("Continue with email", "We’ll email you a one-time code to sign in or create your account.")
                    field("Email", icon: "envelope", active: focus == .email) {
                        TextField("you@example.com", text: $email)
                            .accessibilityLabel("Email").keyboardType(.emailAddress).textContentType(.emailAddress)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                            .focused($focus, equals: .email).submitLabel(.go).onSubmit { send(email) }
                    }.disabled(busy)
                    feedback
                    primary(busy ? "Sending…" : "Send code", enabled: !busy && !email.isEmpty) { send(email) }
                }
            }
            .frame(maxWidth: 420, alignment: .leading).padding(.horizontal, 24).padding(.top, 14).padding(.bottom, 24)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(PilotTheme.canvas)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if let continueAsGuest {
                    Button("Continue as guest", action: continueAsGuest).font(.subheadline).disabled(busy)
                } else {
                    Button("Done") { dismiss() }.disabled(busy)
                }
            }
        }
        .interactiveDismissDisabled(busy)
    }

    private func send(_ input: String) {
        guard !busy else { return }
        let address = input.trimmingCharacters(in: .whitespacesAndNewlines)
        let parts = address.split(separator: "@", omittingEmptySubsequences: false)
        guard parts.count == 2, parts.allSatisfy({ !$0.isEmpty }), !address.contains(where: \.isWhitespace) else {
            message = "Enter a valid email address."; focus = .email; return
        }
        busy = true; message = ""
        Task {
            defer { busy = false }
            do {
                try await account.sendSignInCode(email: address)
                let resent = sentTo != nil
                email = address; sentTo = address; code = ""; focus = .code
                if resent { message = "A new code was sent." }
            } catch { message = error.localizedDescription }
        }
    }

    private func verify(_ address: String) {
        guard !busy else { return }
        guard code.count == 8 else {
            message = "Enter the full code from the email."
            focus = .code
            return
        }
        let submittedCode = code
        focus = nil
        busy = true; message = ""
        Task {
            defer { busy = false }
            do {
                try await account.verifySignInCode(email: address, code: submittedCode)
                code = ""; await didSignIn()
            } catch { message = error.localizedDescription }
        }
    }

    @ViewBuilder private var feedback: some View {
        if !message.isEmpty {
            Text(message).font(.subheadline).foregroundStyle(.primary)
        }
    }

    private func heading(_ title: String, _ subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(title).font(PilotTheme.title).accessibilityAddTraits(.isHeader)
            Text(subtitle).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
    }

    private func field<Content: View>(_ label: String, icon: String, active: Bool, @ViewBuilder input: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label).font(.subheadline.weight(.semibold)).accessibilityHidden(true)
            HStack(spacing: 12) {
                Image(systemName: icon).foregroundStyle(.secondary).frame(width: 20).accessibilityHidden(true)
                input()
            }
            .padding(.horizontal, 15).frame(minHeight: 54)
            .background(PilotTheme.card, in: RoundedRectangle(cornerRadius: 14))
            .overlay { RoundedRectangle(cornerRadius: 14).stroke(active ? PilotTheme.lilac : .secondary.opacity(0.28), lineWidth: active ? 2 : 1) }
        }
    }

    private func primary(_ title: String, enabled: Bool = true, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                if busy { ProgressView().tint(PilotTheme.canvas) }
                Text(title).font(.headline)
            }
            .frame(maxWidth: .infinity, minHeight: 52)
            .foregroundStyle(PilotTheme.canvas)
            .background(PilotTheme.lilac.opacity(enabled ? 1 : 0.68), in: RoundedRectangle(cornerRadius: 15))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }
}
private struct TopicPicker: View {
    @EnvironmentObject private var account: ReaderAccount
    @Environment(\.dismiss) private var dismiss
    let onboarding: Bool
    let changed: () async -> Void
    @State private var search = ""
    @State private var topics: [ReadingTopic] = []
    @State private var ids: Set<UUID> = []
    @State private var message = ""
    @State private var busy = false
    var body: some View {
        List {
            if !message.isEmpty { Text(message) }
            ForEach(topics.filter { search.isEmpty || $0.name.localizedCaseInsensitiveContains(search) }) { topic in
                Button {
                    if ids.contains(topic.id) { ids.remove(topic.id) }
                    else if ids.count < 10 { ids.insert(topic.id) }
                } label: {
                    HStack { Text(topic.name); Spacer(); if ids.contains(topic.id) { Image(systemName: "checkmark") } }
                }
            }
        }.searchable(text: $search, placement: .navigationBarDrawer(displayMode: .always), prompt: "Find a topic")
        .screenTitle("Reading topics").toolbar {
            if onboarding {
                Button("Skip") { persist([]) }.disabled(busy)
            } else {
                Button("Cancel") { dismiss() }
            }
            Button("Save") { persist(ids) }.disabled(busy || topics.isEmpty)
        }.task {
            do {
                let result: TopicList = try await account.request("topics")
                let library: ReaderLibrary = try await account.request("library")
                ids = Set(library.topicIds); topics = result.topics
            } catch { message = error.localizedDescription }
        }
    }
    private func persist(_ selection: Set<UUID>) {
        busy = true
        Task {
            defer { busy = false }
            do {
                let _: TopicList = try await account.request("onboarding/topics", body: ["topicIds": selection.map(\.uuidString)])
                await changed()
                dismiss()
            } catch { message = error.localizedDescription }
        }
    }

}


private struct VerseShare: UIViewControllerRepresentable {
    let verse: ReadingVerse
    let completed: () -> Void
    func makeUIViewController(context: Context) -> UIActivityViewController {
        let text = verse.text + " — " + verse.reference + " (" + verse.translation.code + ")"
        let controller = UIActivityViewController(activityItems: [text], applicationActivities: nil)
        controller.completionWithItemsHandler = { _, shared, _, _ in
            if shared { completed() }
        }
        return controller
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
