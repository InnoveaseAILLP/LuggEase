# Lugg-Ease test cases

15 November 2026 • Version 1.0

## Test strategy

Run pure pricing tests, frontend validation/API/auth-provider tests, and isolated ASGI integration tests on every change. Backend integration tests use the real FastAPI routes, request validation and role dependencies, with an in-memory Mongo-compatible database and a mocked identity verifier. Identity verifier unit tests exercise the Firebase Admin contract separately. These tests do not prove live Google OAuth, real MongoDB transactions, email delivery or device integration. Test those explicitly below.

Automated tests must never create paid orders, send SMS, seed production accounts or modify existing customer records. Use disposable test identities for manual acceptance. Never record passwords or bearer tokens in evidence.

## Automated test catalogue

| ID | Requirement | Scenario / expected result | Implementation |
| --- | --- | --- | --- |
| UT-01 | AUTH-01 | Invalid/blank email rejected; password required; signup name trimmed and 2–80 chars; new password ≥8 chars | frontend/__tests__/auth-validation.test.ts |
| UT-02 | AUTH-05 | Send current Firebase token and JSON; show server error; stale 401 does not clear newer identity; 422 preserves identity | frontend/__tests__/api.test.ts |
| UT-03 | AUTH-01/02 | Registration normalizes values, creates Firebase identity, does not create business profile before email verification | frontend/__tests__/auth-flow.test.tsx |
| UT-04 | AUTH-02/05 | Unverified login blocked; Continue reloads identity and forces token refresh; logout clears cache; restore failure ends loading | frontend/__tests__/auth-flow.test.tsx |
| UT-05 | AUTH-04 | Unknown reset-account error produces no account-existence disclosure | frontend/__tests__/auth-flow.test.tsx |
| UT-06 | AUTH-06 | Verified complete claims accepted; unverified/missing email or UID rejected; Admin verifier invoked with revocation checking | backend/tests/review/test_identity_unit.py |
| UT-07 | AUTH-06 | Invalid token returns 401; identity-service outage returns retryable 503 | backend/tests/review/test_identity_unit.py |
| UT-09 | AUTH-05/ORDER-02 | Switching customer accounts clears the prior booking draft, including private addresses | frontend/__tests__/booking-privacy.test.tsx |
| UT-08 | PRICE-01 | Vehicle capacity/bulk boundaries, overweight load, invalid catalog/state, free-distance boundary, distance/labour/material/floor/tax/coupon calculations | backend/tests/test_pricing.py |
| IT-01 | AUTH-02/06 | Missing/invalid token rejected, unverified identity rejected, disabled legacy credential routes return 410 | backend/tests/review/test_api_integration.py |
| IT-02 | AUTH-07/ROLE-01 | Repeated verified enrollment preserves profile; admin self-selection rejected; role switch rejected | same integration module |
| IT-08 | AUTH-07 | Simultaneous same-UID enrollment creates one profile; a same-UID insert between lookups is accepted without enabling email-only linking | backend/tests/review/test_api_integration.py |
| IT-09 | ADMIN-01 | Firebase-mode demo seeding returns 410 and creates no legacy accounts | same integration module |
| IT-03 | AUTH-07 | Matching legacy admin email returns 409 without modifying or linking account | same integration module |
| IT-04 | BOOK-01/ORDER-01/02 | Customer creates server-priced order; unrelated customer cannot view/list it | same integration module |
| IT-05 | ORDER-03/04 | Unapproved partner rejected; approved eligible partner accepts; pickup code hidden; wrong code rejected; invalid transition rejected | same integration module |
| IT-06 | ADMIN-01 | Development admin bootstrap does not promote/reset an existing customer | same integration module |
| IT-07 | ORDER-05 | Cancellation succeeds for pending order, repeat rejected, concurrent status change returns 409 without overwrite | same integration module |

## Manual and device acceptance catalogue

| ID | Preconditions and steps | Expected result |
| --- | --- | --- |
| MAN-01 | Install signed iOS build on connected iPhone 13 Pro Max; launch and relaunch | App opens without missing Firebase configuration, missing bundle or native-module crash |
| MAN-02 | Open login, toggle create account/sign in, enter malformed input, show/hide password | Accessible fields, validation message, no request on invalid input, correct password concealment |
| MAN-03 | Create disposable email account; verify email externally; press Continue | Verification prompt persists before verification; correct onboarding afterwards; no duplicate backend profile |
| MAN-04 | Sign out; sign in with verified account; kill/relaunch app | Correct role home restored; expired/revoked credentials rejected |
| MAN-05 | Request reset with known/unknown email | Same generic confirmation; actual reset email arrives for known account; network failures remain visible |
| MAN-06 | Google sign-in on iOS and web; repeat with cancellation | Correct Firebase project/UID; native callback returns to app; cancellation leaves login usable |
| MAN-07 | Choose customer role; quote and book; view order; sign out | Quote/itemization agrees with API; own order shown; protected screens and cached orders unavailable after sign-out |
| MAN-08 | Complete partner profile; attempt open jobs before/after approval | Pending notice before approval; only suitable paid jobs available after server approval |
| MAN-09 | Accept a test job, enter incorrect then correct pickup code; progress delivery | Invalid code/status rejected; timeline updates in order; code never shown in partner responses |
| MAN-10 | Two approved partners accept same job concurrently against real MongoDB | Exactly one succeeds; other receives conflict |
| MAN-11 | Razorpay test checkout; bad signature/amount/currency; callback retry | Only verified INR payment marks paid; invalid callbacks rejected; retries do not duplicate payment timeline |
| MAN-12 | Switch environment from deployment screen while logged in | Old identity/cache cleared before endpoint changes; next login uses selected endpoint |
| MAN-13 | Open deployed web URL on mobile and desktop; refresh a route | HTTPS, correct brand, stable layout, usable login, no native-only module errors |
| MAN-14 | Disable network during login/profile/quote and retry | Useful error, no permanent spinner or duplicate booking |
| MAN-15 | Confirm Firebase project plan and provider settings | Spark retained unless user explicitly authorizes billing; email/password and Google enabled; no SMS provider required |
| MAN-16 | Inspect production API and supplier/payment configuration | HTTPS API reachable; separate database; real credentials are private; no placeholder GST or bank details released |

## Reproduction commands

From the repository root:

```sh
.venv/bin/python -m pytest backend/tests/test_pricing.py backend/tests/review -q --junitxml=test_reports/review-backend.xml
npm --prefix frontend test -- --json --outputFile=../test_reports/review-frontend.json
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build:web
```

Older suites under backend/tests target a historical running preview server and legacy password login. They are not silently counted as current Firebase coverage. See the execution report for actual results and pending device/cloud scenarios.
