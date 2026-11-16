# Review and test execution report

Updated 16 November 2026 • Lugg-Ease • See latest release status below; dated earlier sections retain historical results.

## Automated results

| Check | Result | Evidence |
| --- | --- | --- |
| Backend pricing, identity contract and isolated API integration | 91 passed | test_reports/review-backend.xml |
| API integration against a dedicated real MongoDB instance | 10 passed: 9 API cases and 1 deterministic race regression | test_reports/review-real-mongo.xml |
| Frontend validation, API transport, auth lifecycle, draft privacy, agreement review, checkout, tracking and delivery controls | 53 passed | test_reports/review-frontend.json |
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

## Deployment and login update — 15 November 2026

The owner superseded Spark-only hosting and authorized billed API deployment. Billing is enabled on the owner-selected My Billing Account; the initially selected Firebase Payment account hit Google's billing-project quota. The private Cloud Run API and a new authenticated TLS MongoDB database were deployed. No local customer database was migrated. Cloud Run policy grants invocation only to the approved gateway service account. Direct unauthenticated `/health` returns 403; owner IAM-authenticated `/health` returns 200 with `{"status":"ok"}`. The database VM has no public IP or SSH ingress. Daily disk snapshots retain seven days; restore verification remains an operational acceptance task. Temporary outbound NAT used for installation was removed.

Custom domain `https://luggease.innovease-ai.in` resolves to the Firebase site and passes HTTPS validation (HTTP 200). Firebase Authentication authorizes the custom domain. The web build includes the gateway endpoint, has no sample full-name placeholder and opens Google OAuth directly from the user action. Popup/domain/cancellation errors are shown inline. Regression results: **54 backend tests and 25 frontend tests passed**; TypeScript, ESLint, production web build and signed iOS Release build passed.

The updated production iOS app was installed on the physical iPhone 13 Pro Max. Through iPhone Mirroring, launch and blank-form validation were verified, and registration showed an empty full-name field. Evidence: `screenshots/ios-device-registration-update.jpg`. This supersedes the earlier physical interaction limitation for these specific cases. Google login and gateway acceptance results are recorded below after live completion.

### Final live acceptance results

- API Gateway `luggease` reached ACTIVE with hostname `luggease-4oe2nqwp.uc.gateway.dev`. Anonymous business requests return **401** (`Jwt is missing`). Configured CORS preflight returns **200**, the exact allowed custom origin, and allowed GET/POST methods.
- Direct private Cloud Run access without IAM returns **403**. With owner IAM, an invalid forwarded Firebase token still returns **401** (`Invalid or expired Firebase identity`), proving that gateway service authentication does not bypass user identity verification.
- Google OAuth on the custom domain completed using the authorized owner account. After the gateway became active, the website loaded the signed-in Home screen and fetched the bookings list successfully.
- Google OAuth on the physical iPhone 13 Pro Max opened the native authentication sheet. The owner completed account verification directly on the device. The app loaded the signed-in Home screen and the bookings list successfully, with no booking or payment created during acceptance.
- Evidence: `screenshots/web-custom-domain-registration.jpg`, `screenshots/web-google-login-success.jpg`, `screenshots/ios-device-registration-update.jpg`, `screenshots/ios-device-google-login-success.jpg`.
- The new database contains the owner’s application profile created through the verified login flow. Existing local customer data was not copied.

The API/database hosting and Google authentication prerequisites listed in the earlier report are now satisfied. Commercial supplier/payment validation, snapshot restore testing, broader booking/refund acceptance, Android compilation and store distribution remain outside the completed checks. The free Apple development signing profile still expires on 22 November 2026.

Automatic approval review rejected optional IAP SSH ingress and VM project-wide Cloud Logging writer permissions. Neither change was applied; serial startup diagnostics were sufficient for deployment. No public Cloud Run invoker binding exists; its sole service-level invoker binding is the approved gateway service account.


## Final Maps / PDF update — 15 November 2026

- 64 isolated backend tests passed, including Google request payloads, India/state extraction, invalid inputs, authenticated routing, per-user throttling, sales invoice ownership, unpaid rejection, supplier snapshot immutability, escaped multilingual PDF text and pagination. 32 frontend tests passed, including stale-search suppression, address selection/session continuity, protected PDF transport, identity changes and mocked Android/iOS filesystem exports. TypeScript and ESLint passed.
- Real Google Places autocomplete and details passed in the published web app and Oppo release app: Coimbatore Railway Station pickup and Coimbatore Airport drop both filled full addresses and Tamil Nadu. No booking/payment was submitted. Final builds move attribution above results for keyboard visibility.
- API revision `luggease-api-00007-zzm`, image build `4096bed5-17ef-44af-a5bb-c79a47d98144`, serves 100% traffic. Its invoker IAM remains only the dedicated gateway service account. Direct anonymous Cloud Run request returned 403; custom-domain website and privacy page returned 200.
- Google Places API (New) is enabled in the existing billed LuggEase project. Its new service-restricted server key is stored in Secret Manager and attached only to the API runtime. No client Maps API key is bundled. Requests incur Google Maps Platform usage charges under the owner's existing billing approval; rate limiting and debouncing reduce unnecessary calls, but are not a spending cap.
- A plain `npm run build:web` initially exposed that earlier publication commands relied on temporary production environment variables. Added tracked public `.env.production` so future production builds consistently use the authenticated gateway. Corrected deployment verified before final release.
- Both final Android and iPhone Release builds succeeded and were installed. Existing login data was preserved. The owner had authorized ADB and logout/relogin acceptance. Profile, password visibility and saved login passed on Oppo before these additions.
- Sales PDF generation/authorization and native export branches passed isolated tests; the sample PDF was rendered and visually inspected. Physical-phone export of a paid production invoice is **not exercised**, because no paid production order/payment was created. Payment gateway credentials remain an independent release prerequisite for real paid bookings. Latest iPhone address UI was built/installed but has not been manually exercised on that phone.

Evidence: `screenshots/web-google-maps-suggestions.png` (final custom-domain release), `screenshots/web-google-maps-addresses.png`, `screenshots/android-oppo-google-maps.png`, `screenshots/android-oppo-google-drop-selected.png`, `output/pdf/luggease-sales-invoice-sample.pdf`, and XML/JSON test reports. The sample is labelled TEST and represents no transaction.

Final custom-domain Google login with `hello@innovease-ai.in` and live Places suggestions passed after final publication. Final Oppo attribution was captured above results while the keyboard was visible.


## Owner-requested pricing update

Changed only 2-Wheeler base to INR 45 (INR 10/km after 2 km), 3-Wheeler base to INR 125 (INR 16/km after 2 km), and Tata Ace base to INR 150 (INR 23/km after 2 km). Updated dependent expected GST/discount values and retained the half-up rounding regression with exact half-rupee examples. All 67 backend pricing, identity and integration cases passed. Mobile/web rates are supplied by the shared API; existing order documents are not rewritten.

Live pricing verification passed on `luggease-api-00008-96l` after deployment, using owner IAM to read only catalog data. Evidence: `test_reports/review-pricing-update.json`.


## Owner-confirmed additional-kilometre rate update

The owner clarified that existing base fares INR 45/125/150 still cover the first 2 km. Updated only the three distance rates to INR 45/140/175 per additional kilometre. All 67 backend pricing, identity and isolated integration tests passed, including updated GST/discount/rounding expectations and 1/2/10 km boundary scenarios. No frontend rebuild is required because quotes are calculated by the shared API.

Live rate verification passed on `luggease-api-00009-kwg` after promotion to 100% traffic; catalog base/per-km values exactly matched the owner clarification. Evidence: `test_reports/review-pricing-update.json`.


## Latest logistics release — 16 November 2026

Backend regression: **89 passed**, zero failures/errors (`test_reports/review-backend.xml`). Frontend: **33 passed** (`test_reports/review-frontend.json`). TypeScript, ESLint, Vite production build, Android Release and signed iOS Release builds passed.

Deployed Cloud Run revision **luggease-api-00010-mzg**, built from **672cf513-5581-4b06-a083-db5997ab7493**, serving 100% traffic. Verified service IAM grants invocation only to the dedicated gateway service account; there is no anonymous invoker grant. Latest Firebase Hosting version: **2484ef8746e6d7e9**. Earlier Spark-only notes describe the initial deployment; billing and the private API were subsequently authorized and deployed.

A real Google Routes request for public Coimbatore railway-station/airport addresses succeeded (10.819 km). This is a routing-service check, not evidence of an actual parcel journey. Google Maps browser key is referrer/API restricted; the server Places/Routes key remains secret.

The latest signed app installed successfully on iPhone 13 Pro Max. The latest signed Android app also installed successfully on the connected Oppo. Latest workflow device interaction results remain separate from installation. Build success is not a claim that real pickup signatures, a trip or payments have been performed.

Razorpay's existing LLP merchant account has Test Mode available and selected. Existing keys were preserved. The matching Test Mode credentials were supplied by the user in a local ignored file with mode 0600; authentication to the provider Test API passed. No real payment or synthetic paid production order was created. Both sandbox checkout instalments subsequently passed, as recorded below. Online production collection stays disabled.

Remaining acceptance: supervised customer pickup signatures and a real foreground GPS trip. Tracking stops when the app backgrounds; congestion proof combines recorded coordinates and a Google traffic comparison and cannot independently establish the reason for delay. Aadhaar authentication is not required in this release.


### Razorpay Test Mode checkout — passed

Using the existing LLP merchant Test Mode account and an isolated in-memory database, completed a sample INR 47 invoice as two real provider **test** checkouts of INR 23.50 each. The owner clicked Success on each provider mock-bank popup. Application payment functions verified the provider HMAC receipt and fetched payment status; repeated receipt submissions were idempotent. The balance was rejected before the synthetic pickup/signature checkpoint, and accepted afterwards. Both payments were independently fetched from Razorpay and confirmed captured in INR. No real money moved and no production shipment/database was used.

Evidence: `test_reports/razorpay-sandbox.json` and `screenshots/razorpay-two-instalments-passed.jpg`. The harness reuses `instalments.py` directly and does not import the production server or connect to MongoDB. It does not prove the full Firebase-authenticated mobile checkout, physical loading or real customer signatures. Production collection remains disabled until live merchant configuration is separately supplied.


## Agreement layout and In-transit-only tracking update — 16 November 2026

Backend regression: 90 passed. Frontend regression: 48 passed, including new native checkout and tracking lifecycle cases. TypeScript, ESLint and web/Android release builds passed. The uploaded agreement was reformatted and all final pages visually reviewed: two pages, ten goods retained, original quoted total unchanged, full supplier/customer details and branding. Existing accepted documents are preserved; new agreements use version 2. A pre-existing flaky invoice test was corrected to use a unique private-code sentinel instead of checking whether a random four-digit code coincidentally appeared inside a tax identifier.

Both tracking reads and writes reject non-transit states. UI tests cover all non-transit statuses, leaving transit, app background and delayed location permission completion. These are isolated tests; a physical parcel journey and customer handwritten signature remain supervised acceptance checks, not claimed as completed.


Release verification for this update: Cloud Run revision `luggease-api-00011-vcc` serves 100% traffic (image `2c72a3cc-208a-4937-bfa2-a1ca8d5bb0e0`); Hosting version `75fe147d3bcc8b2c` published successfully. The website returned 200 and anonymous direct Cloud Run access remained 403. Android and iOS release builds and installations succeeded. Oppo UI checks passed after unlock: saved login, existing unpaid order/ETA, In-transit-only live-map notice with no map button, and successful agreement PDF download with the corrected filename. Evidence: test_reports/oppo-agreement-map-check.json. The signed-agreement integration additionally confirms that the signature appendix does not modify the originally accepted document or its SHA-256 hash.


## NEFT / RTGS beneficiary correction — 16 November 2026

Updated the configured beneficiary account name, account number, IFSC, bank and branch from the owner's supplied details. The Profile billing section now exposes clearly labeled beneficiary details and wraps the long LLP account name. New invoice PDFs include NEFT / RTGS instructions from the invoice supplier snapshot; existing issued supplier snapshots remain unchanged. The bank customer ID is not required for incoming transfers and is not displayed. No bank transaction or external merchant settlement-account change was performed.

Validation: two relevant backend invoice/signature regressions passed; generated sample PDF text matched all supplied payment fields and its page was visually checked without clipping. Web TypeScript and production build passed. Native build/install and live profile checks are recorded after completion.


## Complete delivery simulation — 16 November 2026

91 backend tests and 53 frontend tests passed, plus TypeScript and ESLint. The new isolated customer/partner simulation covers all requested lifecycle statuses, synthetic GPS arrival, final customer invoice signature and five-star comments. Duplicate reviews are prevented with an atomic order update before rating-stat increments. The Google Maps public-address route preview succeeded on the Oppo. Deployment: API revision luggease-api-00013-ckn; Hosting 974e87cf4a260c5c; updated Android/iPhone builds installed successfully. See delivery-simulation.md for the distinction between isolated API/component tests, physical route preview and an actual journey.

The earlier bank correction is live, including the beneficiary name/account/IFSC/bank/branch. The customer ID is excluded from payment instructions. No NEFT, RTGS or merchant settlement transaction was performed.

Final device check: Oppo restored the saved customer login after the latest update. Profile displayed the supplied beneficiary name, account number, IFSC, IDFC FIRST Bank and Coimbatore Sai Baba colony Branch correctly, with no clipping. Screenshot: screenshots/android-oppo-bank-corrected.png. The temporary USB stay-awake setting was restored and confirmed as zero.
