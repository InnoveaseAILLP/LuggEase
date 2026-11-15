# Review and test execution report

15 November 2026 • Lugg-Ease • Completed review, build and deployment verification

## Automated results

| Check | Result | Evidence |
| --- | --- | --- |
| Backend pricing, identity contract and isolated API integration | 51 passed | test_reports/review-backend.xml |
| API integration against a dedicated real MongoDB instance | 10 passed: 9 API cases and 1 deterministic race regression | test_reports/review-real-mongo.xml |
| Frontend validation, API transport, auth lifecycle and cross-account draft privacy | 20 passed | test_reports/review-frontend.json |
| TypeScript | Passed | npm run typecheck |
| ESLint | Passed | npm run lint |
| Production browser bundle | Passed | Vite production build |
| iOS simulator UI smoke test | 1 passed | test_reports/review-ios-simulator.json |
| Signed iPhone Release build and install | Passed | iPhone 13 Pro Max, in.innovease.luggease |
| Firebase web publication | Passed | https://luggease-innovease.web.app |
| npm dependency audit | 0 critical/high/moderate; 10 low | test_reports/dependency-audit.json |

The real-MongoDB run used a new database per test on a separate local server at port 27019, then deleted only those temporary databases. Firebase identities were mocked at the API boundary; the separate identity tests verify the Admin SDK call contract. These results do not claim live Firebase revocation, live OAuth or live payment certification.

## Browser checks

The local Vite application was opened and visually inspected. Verified login rendering, sign-in/create-account switching, blank-form validation, accessible field/button labels, and restored Material Design icon fonts. Fixed browser startup failures caused by a missing global shim and JSX runtime selection. Screenshots: `screenshots/web-login.jpg` (local) and `screenshots/web-live-login.jpg` (published). The deployed HTTPS site was opened and its blank-form validation and sign-in/create-account controls were checked successfully.

## Firebase and hosting

Created `luggease-innovease` under `hello@innovease-ai.in`. Spark was visually verified in the Firebase console. Registered Android, iOS and web applications and retrieved their client configurations with the Firebase CLI. Email/password and Google providers were deployed successfully.

The owner explicitly selected Spark-only static web deployment and preparation of the API deployment. No billing account was linked and no Cloud Run service was provisioned. After account reauthentication, deployed the web application and authorized Google sign-in domains successfully to https://luggease-innovease.web.app. A static deployment does not make the FastAPI/MongoDB booking service available; production login-to-booking acceptance remains pending until that service is hosted.

## iOS device verification

Generated standard native Android/iOS projects and successfully built and signed a Release iOS application for the connected iPhone 13 Pro Max. Fixed Firebase dynamic framework linkage and iOS 16.1 deployment targets for the current React Native/Xcode toolchain. The owner trusted the developer certificate. The installed free-development signing profile expires on 22 November 2026 and must be renewed/reinstalled for continued device use.

Device UI test runner launched, but installation of the app alongside that runner exceeded Apple's three-app free-development-profile limit. Existing Health-Ease and AutomobilEase installations were preserved. Removed only the temporary Lugg-Ease UI test runner, then successfully installed `in.innovease.luggease` and launched it on the physical iPhone. Startup reached React Native JavaScript evaluation without a recorded fatal startup failure.

The physical iPhone login screen was visually verified through iPhone Mirroring, including correct icon rendering. The Mirroring window became unavailable during the subsequent interaction check, so physical-device button validation is not claimed as passed. The automated iOS simulator test passed: launch, empty-form validation, registration controls, screenshot capture, termination and relaunch. Evidence: `test_reports/review-ios-simulator.json` and `screenshots/ios-registration-simulator.png`. The unsuccessful physical-device test-runner attempt is not counted as passed. Real email delivery, verified sign-in, Google OAuth, booking against a hosted API and live Razorpay payment remain separate acceptance cases.

## Review fixes

- Replaced the previous framework runtime, router, native storage/image integrations, scripts and environment naming with React Native CLI, React Navigation, Keychain and Vite.
- Replaced third-party Google session exchange and custom client token storage with Firebase-managed identity, token renewal, verification and password reset.
- Disabled legacy credential endpoints and legacy demo-account seeding by default; prevent email-only attachment of new identities to privileged legacy accounts.
- Prevented startup from resetting credentials or promoting an existing customer to administrator.
- Required identity revocation checks, explicit CORS origins, and successfully created unique indexes before serving requests.
- Added optimistic concurrency checks to cancellation and partner status transitions. Fixed a real-MongoDB enrollment race in which concurrent requests for the same Firebase UID could incorrectly return a legacy-account conflict; added a deterministic regression test.
- Verify INR currency in addition to payment order, amount, signature and status.
- Sign out before changing backend environment; clear business caches and private booking drafts on account changes.
- Reject an HTML/static fallback masquerading as a successful API response; require HTTPS for configured production endpoints.
- Removed local environment files from version control while retaining local copies; added credential-free examples.
- Replaced unrelated backend dependencies and patched high/moderate frontend advisories; recorded the remaining low-severity development-tool advisories.

## Known limits

Previously tracked environment values remain in Git history; rotate any real credentials from those files before a production release.

No existing business data was migrated or deleted. Existing legacy accounts require a reviewed identity migration before they can use the new Firebase login. The native Firebase dependency includes an upstream `@expo/plist` parsing helper for optional build tooling; the application has no Expo runtime or direct Expo dependencies. Native Firebase's current SPM distribution emits duplicate-class warnings for some Google utility libraries; these are upstream dependency linkage warnings and require monitoring during full OAuth acceptance. Android compilation and store distribution were not part of the executed iPhone checks.

Production release still requires a hosted API/database, real supplier and payment settings, verified end-to-end authentication, refund operations and the manual acceptance scenarios in `test-cases.md`.
