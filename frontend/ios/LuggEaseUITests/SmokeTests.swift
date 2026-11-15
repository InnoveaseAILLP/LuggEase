import XCTest

final class SmokeTests: XCTestCase {
  override func setUpWithError() throws { continueAfterFailure = false }

  @MainActor
  func testLoginValidationAndRelaunch() throws {
    let app = XCUIApplication(bundleIdentifier: "in.innovease.luggease")
    app.launch()
    let submit = app.buttons["auth-submit-button"]
    XCTAssertTrue(submit.waitForExistence(timeout: 30), "Login screen must open")
    reveal(submit, in: app)
    submit.tap()
    XCTAssertTrue(app.staticTexts["Please fill all fields"].waitForExistence(timeout: 5))
    let register = app.buttons["auth-mode-register"]
    reveal(register, in: app, down: true)
    register.tap()
    XCTAssertTrue(app.textFields["register-name-input"].waitForExistence(timeout: 5))
    let screenshot = XCTAttachment(screenshot: app.screenshot())
    screenshot.name = "Lugg-Ease registration on iPhone"
    screenshot.lifetime = .keepAlways
    add(screenshot)
    app.terminate()
    app.launch()
    XCTAssertTrue(app.buttons["auth-submit-button"].waitForExistence(timeout: 30))
  }

  @MainActor
  private func reveal(_ element: XCUIElement, in app: XCUIApplication, down: Bool = false) {
    for _ in 0..<5 {
      if element.isHittable { return }
      if down { app.swipeDown() } else { app.swipeUp() }
    }
  }
}
