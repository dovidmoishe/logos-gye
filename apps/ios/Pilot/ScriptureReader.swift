import SwiftUI

struct ScriptureReader: View {
    // Psalm 23, Authorized King James Version (1769 edition), from the Logos KJV corpus.
    static let verses = [
        "A Psalm of David. The LORD is my shepherd; I shall not want.",
        "He maketh me to lie down in green pastures: he leadeth me beside the still waters.",
        "He restoreth my soul: he leadeth me in the paths of righteousness for his name’s sake.",
        "Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me.",
        "Thou preparest a table before me in the presence of mine enemies: thou anointest my head with oil; my cup runneth over.",
        "Surely goodness and mercy shall follow me all the days of my life: and I will dwell in the house of the LORD for ever."
    ]

    @Binding var verse: Int
    let finish: () -> Void
    @State private var page: Int?
    @Environment(\.dynamicTypeSize) private var typeSize

    init(verse: Binding<Int>, finish: @escaping () -> Void) {
        _verse = verse
        self.finish = finish
        _page = State(initialValue: (1...Self.verses.count).contains(verse.wrappedValue) ? verse.wrappedValue : 1)
    }

    var body: some View {
        Group {
            if typeSize.isAccessibilitySize {
                ScrollView { card(page ?? 1) }
            } else {
                ScrollViewReader { proxy in
                    ScrollView(.vertical) {
                        VStack(spacing: 0) {
                            ForEach(1...Self.verses.count, id: \.self) { number in
                                card(number).containerRelativeFrame(.vertical).id(number)
                            }
                        }.scrollTargetLayout()
                    }
                    .scrollTargetBehavior(.paging)
                    .scrollPosition(id: $page)
                    .scrollIndicators(.hidden)
                    .onAppear {
                        let target = (1...Self.verses.count).contains(verse) ? verse : 1
                        proxy.scrollTo(target, anchor: .top)
                        page = target
                    }
                }
            }
        }
        .background(PilotTheme.canvas)
        .screenTitle("Read")
        .navigationDestination(for: Int.self) { number in PsalmChapter(selected: number) }
        .onAppear { if verse == 0 { verse = 1 } }
        .onChange(of: page) { _, current in
            if let current { verse = current }
        }
    }

    private func card(_ number: Int) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            Spacer(minLength: 0)
            Label("Psalm 23:\(number) · KJV", systemImage: "book")
                .font(.headline).foregroundStyle(PilotTheme.lilac)
            Text(Self.verses[number - 1])
                .font(.custom("Urbanist-SemiBold", size: 31, relativeTo: .title))
                .fixedSize(horizontal: false, vertical: true)
            NavigationLink("Read chapter", value: number)
                .buttonStyle(.bordered).controlSize(.large)
            Spacer(minLength: 0)
            HStack {
                Text("\(number) of \(Self.verses.count)").foregroundStyle(.secondary)
                Spacer()
                if number < Self.verses.count {
                    Button("Next verse", systemImage: "arrow.down") {
                        withAnimation { page = number + 1 }
                    }
                } else {
                    Button("Finish reading", action: finish)
                }
            }.font(.subheadline)
        }
        .padding(24)
        .frame(maxWidth: 560, maxHeight: .infinity, alignment: .leading)
        .frame(maxWidth: .infinity)
    }
}

struct PsalmChapter: View {
    let selected: Int

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("King James Version").font(.subheadline).foregroundStyle(.secondary)
                    ForEach(1...ScriptureReader.verses.count, id: \.self) { number in
                        HStack(alignment: .firstTextBaseline, spacing: 12) {
                            Text("\(number)").font(.caption).foregroundStyle(PilotTheme.lilac)
                            Text(ScriptureReader.verses[number - 1]).frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .accessibilityElement(children: .combine)
                        .padding(12)
                        .background(number == selected ? PilotTheme.lilac.opacity(0.1) : .clear,
                                    in: RoundedRectangle(cornerRadius: 12))
                        .id(number)
                    }
                }.padding(20).frame(maxWidth: 560)
            }
            .onAppear { proxy.scrollTo(selected, anchor: .center) }
        }.background(PilotTheme.canvas).screenTitle("Psalm 23")
    }
}
