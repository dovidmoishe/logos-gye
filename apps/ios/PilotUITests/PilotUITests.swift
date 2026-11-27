import XCTest

final class PilotUITests: XCTestCase {
    func testShareSafeCheckWithDashboard() throws {
        guard let pass = ProcessInfo.processInfo.environment["LOGOS_PAIRING_PASS"] else {
            throw XCTSkip("Set TEST_RUNNER_LOGOS_PAIRING_PASS to a one-use simulator pairing pass.")
        }
        let app = XCUIApplication()
        app.launch()
        enterHomeIfNeeded(app)
        app.tabBars.buttons["Protection"].tap()
        app.buttons["Dashboard connection"].tap()
        let forget = app.buttons["Forget connection"]
        if forget.exists { throw XCTSkip("Run pairing on a simulator with no existing dashboard connection.") }
        let field = app.textFields["Pairing pass"]
        field.tap()
        field.typeText(pass)
        app.buttons["Connect device"].tap()
        let share = app.buttons["Run and share safe check"]
        XCTAssertTrue(share.waitForExistence(timeout: 15))
        share.tap()
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label BEGINSWITH %@", "Sent to your dashboard.")).firstMatch.waitForExistence(timeout: 30))
        forget.tap()
    }

    func testLiveChapterFromLocalAPI() throws {
        guard ProcessInfo.processInfo.environment["LOGOS_TEST_LIVE_READER"] == "1" else {
            throw XCTSkip("Requires a running, seeded reading API.")
        }
        let app = XCUIApplication()
        app.launchArguments = ["-homeIntroductionComplete", "YES", "-reader.live", "YES"]
        app.launch()
        app.tabBars.buttons["Read"].tap()
        let permission = XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.buttons["Allow"]
        if permission.waitForExistence(timeout: 2) { permission.tap() }
        let chapterButtons = app.buttons.matching(identifier: "Read chapter")
        guard chapterButtons.firstMatch.waitForExistence(timeout: 24) else {
            XCTFail("Live chapter unavailable. " + app.staticTexts.allElementsBoundByIndex.map(\.label).joined(separator: " "))
            return
        }
        let referenceQuery = app.staticTexts.matching(NSPredicate(format: "label ENDSWITH ' · KJV'"))
        let reference = try XCTUnwrap(referenceQuery.allElementsBoundByIndex.first { $0.isHittable }).label
        let chapter = try XCTUnwrap(reference.split(separator: ":").first).description
        try XCTUnwrap(chapterButtons.allElementsBoundByIndex.first { $0.isHittable }).tap()
        XCTAssertTrue(app.navigationBars[chapter].waitForExistence(timeout: 8))
        XCTAssertTrue(app.staticTexts["Authorized King James Version"].waitForExistence(timeout: 12))
        app.navigationBars.buttons.firstMatch.tap()
        app.terminate()
        app.launch()
        app.buttons.containing(NSPredicate(format: "label CONTAINS 'Continue reading'")).firstMatch.tap()
        XCTAssertTrue(app.staticTexts[reference].waitForExistence(timeout: 12))
        XCTAssertTrue(app.staticTexts[reference].isHittable)
    }

    func testPersonalizedReaderWithTestAccount() throws {
        let environment = ProcessInfo.processInfo.environment
        let useInbox = environment["LOGOS_TEST_MAILPIT"] == "1"
        let address = environment["LOGOS_TEST_READER_EMAIL"] ?? (useInbox ? "ui-\(UUID().uuidString.lowercased())@example.test" : nil)
        guard let email = address, useInbox || environment["LOGOS_TEST_READER_OTP"] != nil else {
            throw XCTSkip("Requires a dedicated reader test account.")
        }
        let app = XCUIApplication()
        #if targetEnvironment(simulator)
        app.launchArguments = ["-reader.live", "YES", "-homeIntroductionComplete", useInbox ? "NO" : "YES"]
        #else
        app.launchArguments = ["-reader.live", "YES"]
        #endif
        app.launch()
        if useInbox && app.staticTexts["Meet Logos."].exists {
            app.buttons["Continue"].tap()
            app.buttons["Continue"].tap()
            app.buttons["Finish introduction"].tap()
        }
        let fromIntroduction = app.textFields["Email"].exists
        if !fromIntroduction {
            app.tabBars.buttons["Read"].tap()
            app.buttons["Reader options"].tap()
            guard app.buttons["Sign in to Logos"].exists else { throw XCTSkip("A reader is already signed in.") }
            app.buttons["Sign in to Logos"].tap()
        }
        XCTAssertFalse(app.textFields["Email code"].exists)
        app.textFields["Email"].tap()
        app.textFields["Email"].typeText(email)
        app.buttons["Send code"].coordinate(withNormalizedOffset: CGVector(dx: 0.1, dy: 0.5)).tap()
        let input = app.textFields["Email code"]
        XCTAssertTrue(input.waitForExistence(timeout: 8))
        XCTAssertFalse(app.textFields["Email"].exists)
        if useInbox {
            app.buttons["Verify code"].tap()
            XCTAssertTrue(app.staticTexts["Enter the full code from the email."].waitForExistence(timeout: 3))
        }
        input.tap()
        let code = try useInbox ? readLocalEmailCode(sentTo: email) : XCTUnwrap(environment["LOGOS_TEST_READER_OTP"])
        input.typeText(code)
        app.buttons["Verify code"].coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        if fromIntroduction {
            XCTAssertTrue(app.tabBars.buttons["Read"].waitForExistence(timeout: 8))
            app.tabBars.buttons["Read"].tap()
            app.launchArguments = ["-reader.live", "YES", "-homeIntroductionComplete", "YES"]
        }
        let options = app.buttons["Reader options"]
        XCTAssertTrue(app.navigationBars["Reading topics"].waitForExistence(timeout: 16))
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let later = app.buttons["Not Now"]
        if later.waitForExistence(timeout: 3) { later.tap() }
        else if springboard.buttons["Not Now"].exists { springboard.buttons["Not Now"].tap() }
        let topic = app.buttons["Comfort"].firstMatch
        XCTAssertTrue(topic.waitForExistence(timeout: 8))
        topic.tap()
        app.navigationBars["Reading topics"].buttons["Save"].tap()
        XCTAssertTrue(app.navigationBars["Reading topics"].waitForNonExistence(timeout: 12))
        let save = app.buttons.matching(identifier: "Save").allElementsBoundByIndex.first { $0.isHittable }
        try XCTUnwrap(save).tap()
        options.tap()
        app.buttons["Saved verses"].tap()
        XCTAssertTrue(app.navigationBars["Saved verses"].exists)
        let saved = app.collectionViews.buttons.firstMatch
        XCTAssertTrue(saved.waitForExistence(timeout: 8))
        saved.tap()
        XCTAssertTrue(app.staticTexts["Authorized King James Version"].waitForExistence(timeout: 8))
        app.terminate()
        app.launch()
        app.tabBars.buttons["Read"].tap()
        options.tap()
        app.buttons[email].tap()
        app.buttons["Sign out"].tap()
        XCTAssertTrue(options.waitForExistence(timeout: 8))
    }

    private func readLocalEmailCode(sentTo email: String) throws -> String {
        #if targetEnvironment(simulator)
        struct Message: Decodable { let ID: String }
        struct Search: Decodable { let messages: [Message] }
        struct Body: Decodable { let Text: String }
        let inbox = URL(string: "http://127.0.0.1:54324/api/v1")!
        let search = inbox.appending(path: "search").appending(queryItems: [URLQueryItem(name: "query", value: "to:" + email)])
        for _ in 0..<20 {
            let result = try JSONDecoder().decode(Search.self, from: Data(contentsOf: search))
            if let message = result.messages.first {
                let body = try JSONDecoder().decode(Body.self, from: Data(contentsOf: inbox.appending(path: "message/" + message.ID)))
                if let digits = body.Text.range(of: #"(?m)^\s*([0-9]{6,10})\s*$"#, options: .regularExpression) {
                    return body.Text[digits].trimmingCharacters(in: .whitespacesAndNewlines)
                }
            }
            Thread.sleep(forTimeInterval: 0.25)
        }
        #else
        // Mailpit stays on the Mac. The device test receives only its own synthetic code via USB.
        guard email.hasPrefix("ui-"), email.hasSuffix("@example.test"), !email.contains("/") else {
            throw XCTSkip("Physical device tests require a dedicated local test address.")
        }
        let file = FileManager.default.temporaryDirectory.appending(path: email + ".otp")
        for _ in 0..<120 {
            if let code = try? String(contentsOf: file, encoding: .utf8), code.range(of: #"^[0-9]{6,10}$"#, options: .regularExpression) != nil {
                try FileManager.default.removeItem(at: file)
                return code
            }
            Thread.sleep(forTimeInterval: 0.25)
        }
        #endif
        throw NSError(domain: "LogosTests", code: 1, userInfo: [NSLocalizedDescriptionKey: "No code arrived in the local test inbox."])
    }

    private func enterHomeIfNeeded(_ app: XCUIApplication) {
        if app.staticTexts["Meet Logos."].waitForExistence(timeout: 1) {
            app.buttons["Continue"].tap()
            app.buttons["Continue"].tap()
            app.buttons["Finish introduction"].tap()
        }
        if app.buttons["Continue as guest"].waitForExistence(timeout: 1) { app.buttons["Continue as guest"].tap() }
    }

    func testReadingAndProtectionEntryPoints() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-reader.live", "NO"]
        app.launch()
        enterHomeIfNeeded(app)
        app.tabBars.buttons["Read"].tap()
        XCTAssertTrue(app.navigationBars["Read"].waitForExistence(timeout: 4))
        func currentReference() throws -> String {
            let references = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Psalm 23:'"))
            return try XCTUnwrap(references.allElementsBoundByIndex.first { $0.isHittable }).label
        }
        let firstReference = try currentReference()
        let reader = app.scrollViews.firstMatch
        if firstReference.hasPrefix("Psalm 23:6") { reader.swipeDown() } else { reader.swipeUp() }
        let reference = try currentReference()
        XCTAssertNotEqual(reference, firstReference)
        let chapters = app.buttons.matching(identifier: "Read chapter")
        try XCTUnwrap(chapters.allElementsBoundByIndex.first { $0.isHittable }).tap()
        XCTAssertTrue(app.navigationBars["Psalm 23"].waitForExistence(timeout: 3))
        app.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(app.staticTexts[reference].isHittable)
        app.terminate()
        app.launch()
        app.buttons.containing(NSPredicate(format: "label CONTAINS 'Continue reading'")).firstMatch.tap()
        XCTAssertTrue(app.staticTexts[reference].isHittable)
        app.tabBars.buttons["Protection"].tap()
        XCTAssertTrue(app.navigationBars["Protection"].waitForExistence(timeout: 3))
        app.buttons["Accountability partner"].tap()
        app.buttons["Preview weekly report"].tap()
        XCTAssertTrue(app.navigationBars["Report preview"].exists)
    }

    func testAccountFollowsIntroduction() {
        let app = XCUIApplication()
        app.launchArguments = ["-homeIntroductionComplete", "NO"]
        app.launch()
        XCTAssertTrue(app.staticTexts["Meet Logos."].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Send code"].exists)
        app.buttons["Continue"].tap()
        app.buttons["Christian encouragement"].tap()
        app.buttons["Back"].tap()
        app.buttons["Continue"].tap()
        XCTAssertTrue(app.buttons["Christian encouragement"].isSelected)
        app.buttons["Continue"].tap()
        XCTAssertTrue(app.staticTexts["Your privacy."].exists)
        XCTAssertFalse(app.buttons["Send code"].exists)
        app.buttons["Finish introduction"].tap()
        XCTAssertTrue(app.staticTexts["Continue with email"].waitForExistence(timeout: 5))
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Sign up after introduction"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        XCTAssertFalse(app.buttons["Send code"].isEnabled)
        XCTAssertFalse(app.textFields["Email code"].exists)
        app.terminate()
        app.launchArguments = []
        app.launch()
        XCTAssertTrue(app.staticTexts["Continue with email"].waitForExistence(timeout: 5))
        app.buttons["Continue as guest"].tap()
        XCTAssertTrue(app.navigationBars["Home"].waitForExistence(timeout: 5))
    }

    func testPrivateCheckIn() {
        let app = XCUIApplication()
        app.launch()
        enterHomeIfNeeded(app)
        app.buttons["Check in"].tap()
        app.buttons["Christian"].tap()
        XCTAssertTrue(app.staticTexts["A moment for prayer"].exists)
        app.buttons["Neutral"].tap()
        app.buttons.containing(NSPredicate(format: "label CONTAINS 'How are you feeling?'")).firstMatch.tap()
        app.buttons["Ready to refocus"].firstMatch.tap()
        app.buttons["Save check-in"].tap()
        XCTAssertTrue(app.navigationBars["Home"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label ENDSWITH 'of the last 7 days' AND NOT label BEGINSWITH '0 '")).firstMatch.exists)
        app.terminate()
        app.launch()
        app.buttons["Check in"].tap()
        XCTAssertTrue(app.staticTexts["Ready to refocus"].exists)
        app.buttons["Delete check-in"].tap()
        XCTAssertFalse(app.buttons["Delete check-in"].exists)
    }
}
