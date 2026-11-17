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

## Login and custom domain regression — 15 November 2026

| Case | Expected result | Coverage |
|---|---|---|
| Create account full name | Empty field with no sample person's name | UI inspection |
| Google button user gesture | Popup invoked synchronously, before asynchronous persistence work | `firebase-web.test.ts` |
| Popup blocked | Visible instruction to allow pop-ups | Unit test |
| Unauthorized website | Visible domain configuration error | Unit test |
| Popup cancelled | Visible cancellation message; retry possible | Unit test |
| Unexpected OAuth error | Original failure retained for error handling | Unit test |
| Custom domain | Firebase site served over valid HTTPS | Live deployment check |
| Verified Google session | API accepts Firebase identity and creates/loads the same profile | Live browser/API check |

| Private API case | Expected result | Coverage |
|---|---|---|
| Direct Cloud Run request without IAM | HTTP 403 | Live verified |
| Owner IAM health request | HTTP 200, status ok | Live verified |
| Gateway business request without Firebase token | Rejected before backend access | Live gateway check |
| Browser OPTIONS preflight | Allowed configured origin/method/headers, no business data | Live gateway check |
| Gateway replaces Authorization | Independently verify original Firebase JWT from forwarded header | Backend unit/integration tests |
| Unconfigured gateway trust | Ignore forwarded header | Backend regression test |
| Empty forwarded credential | HTTP 401 | Backend regression test |


## Address suggestions and invoice export acceptance

| ID | Scenario | Expected |
|---|---|---|
| MAP-01 | Enter fewer than three characters | No Google search |
| MAP-02 | Rapid pickup typing with older response delayed | Debounce requests; discard stale results |
| MAP-03 | Select pickup and drop independently | Full addresses and Tamil Nadu state fill correctly; separate sessions |
| MAP-04 | Search failure or no results | Visible message and manual address entry remain available |
| MAP-05 | Anonymous, invalid session or non-India details | Reject without revealing Google credential |
| MAP-06 | Phone keyboard overlaps suggestion list | Google Maps attribution remains above results |
| MAP-07 | Excessive searches | Per-user limit returns 429 |
| PDF-01 | Owner downloads paid invoice | Valid PDF attachment; no-store; correct historical supplier and totals |
| PDF-02 | Anonymous/other customer/partner requests invoice | 401/404; no invoice data |
| PDF-03 | Unpaid order | 409 and no sales invoice button |
| PDF-04 | Long addresses, Tamil/Devanagari, markup in customer name | Wrapped content, literal escaped text, repeated table heading and page numbers |
| PDF-05 | Browser export | Named PDF download with authenticated request |
| PDF-06 | Android 10+ export | Copy to MediaStore Downloads/LuggEase; clear temporary file |
| PDF-07 | iOS export | Native document menu offers Save to Files |
| PDF-08 | Identity changes during download or server returns HTML | Abort export with actionable message |

Automated native filesystem tests mock operating-system APIs; they do not substitute for a paid-order download on a physical phone. No production order or payment is fabricated for acceptance.


## Revised rate regression

For 2-Wheeler, 3-Wheeler and Tata Ace, check 1 km and 2 km at base fares INR 45/125/150; at 10 km and zero helpers, transport subtotals must be INR 405/1245/1550 and totals with configured 5% GST and rounding INR 425/1307/1628. Preserve half-up invoice rounding, GST split, discount calculations, 5% commission and the original quote stored on existing orders.


## Superseding additional-kilometre rates

Owner-confirmed base fares remain INR 45/125/150 for 1 km and 2 km. At 10 km with zero helpers, revised transport subtotals must be INR 405/1245/1550, and totals including configured 5% GST and rounding INR 425/1307/1628. Verify the original 2-km allowance, applicable GST split, half-up rounding, coupons and commission on the revised amounts.


## Logistics and instalment regression cases — 16 November 2026

| ID | Scenario and expected result | Evidence |
| --- | --- | --- |
| LOG-01 | Check 21:00 boundary, late/early arrival and multi-day travel; reject past/invalid pickup slots. | test_logistics_workflow.py |
| LOG-02 | Supply forged client kilometres; server Google road result controls the quote. | test_logistics_workflow.py |
| LOG-03 | Reject booking before ownership review; reject changed goods, expired or reused agreements and unrelated customer access. | test_logistics_workflow.py |
| LOG-04 | Restrict ETA revisions to assigned partner; require future time and explanation. | test_logistics_workflow.py |
| LOG-05 | Restrict GPS to active assigned trip; validate coordinates, age, accuracy and privacy. | test_logistics_workflow.py |
| LOG-06 | Require two valid handwritten PNGs, loading/presence acknowledgements and pickup OTP before departure. | test_logistics_workflow.py |
| LOG-07 | Reject excess/duplicate congestion fees and insufficient evidence; require acceptance; preserve original invoice; support rejection/cash receipt. | test_logistics_workflow.py |
| PAY-01 | Split even/odd paise exactly; collect advance then pickup balance once each. | test_instalments.py |
| PAY-02 | Reject mismatched amount/currency/provider order/status, invalid signature and stale stage. | test_instalments.py |
| PAY-03 | Disabled credentials block checkout; production rejects sandbox keys; partial cancellation refund uses received funds only. | test_instalments.py |
| PAY-04 | Recover provider-confirmed receipts through reconciliation; late capture after cancellation does not revive shipment. | test_instalments.py |
| UI-AG-01 | Require explicit ownership acceptance and invalidate accepted review after booking payload changes. | agreement-review.test.tsx |
| MAN-LOG-01 | Real partner trip: explicitly share GPS, background/foreground the app, confirm stale state and customer map updates. | Pending real-trip acceptance |
| MAN-PAY-01 | Isolated Razorpay Test Mode: complete both instalments, verify provider receipts and retry/reconciliation without production orders. | Passed in isolated provider sandbox; see razorpay-sandbox.json |
| MAN-PICKUP-01 | Real customer reviews both documents and draws two signatures after loading; confirm departure guard and PDF images. | Pending supervised pickup acceptance |

Automated workflow tests use isolated data and mocked external providers. They do not establish completion of real signatures, a real journey or provider sandbox checkout.


## Agreement layout / status gate cases

| ID | Expected result | Validation |
| --- | --- | --- |
| DOC-02 | Version 2 agreement includes supplier snapshot, customer, itemized goods, 50/50 schedule, branding image and private PDF headers. | Backend workflow integration and rendered PDF visual inspection |
| MAP-02 | Live map and sharing unavailable for pending payment, paid, assigned, picked up, delivered and cancelled statuses. | shipment-tracking.test.tsx and protected backend tracking routes |
| MAP-03 | In-transit map opens; leaving transit closes it and stops GPS. A late permission response cancels its watcher. | shipment-tracking.test.tsx |
| MAP-04 | Backgrounding stops sharing. ETA midnight/21:00 boundaries and partner revision permissions remain correct. | Frontend tracking and backend workflow tests |

The customer-provided agreement was reformatted as a separate unsigned copy, retaining all ten listed goods and the quoted INR 1,916 total. This does not record acceptance or create a new booking.


## Complete delivery simulation

`backend/tests/review/test_delivery_simulation.py` covers real route handlers from agreement review through advance, partner visibility/acceptance, loading signatures, pickup balance, OTP, picked up, in transit, private synthetic GPS, recipient acknowledgement, delivered, signed invoice export and five-star comments. Unrelated users, premature completion, blank signatures, missing arrival/goods acknowledgements and duplicate feedback are rejected. `frontend/__tests__/order-delivery.test.tsx` checks partner status controls, final-signature gating and five-star comment submission; delivery-navigation.test.ts checks encoded destinations/stops and URL bounds. See delivery-simulation.md for observed results and limitations.


### Review closure / all-role simulation additions (2026-11-16)

- Partner profile pending → administrator approval → self-accept or administrator assignment → pickup/loading signatures → pickup payment → in-transit tracking → recipient signature → delivered → customer feedback. Both assignment variants must pass independently with disposable fixtures.
- Administrator settlement: reject non-admin, blank/short UTR, premature delivery state, and duplicate recording. Force two admins past their initial reads: one atomic write succeeds and the other returns 409, preserving the first reference. No bank transfer is made.
- Shared rate limiting: 100 concurrent requests across independent handles allow exactly 60, then 429; a second user remains independent; expiry restores admission; database outage returns a sanitized 503.
- Checkout serialization: closing-script payloads, <, >, &, Unicode line/paragraph separators cannot escape embedded JSON.
- Environment protection: only recognized Live Mode credentials can enable production collection; unknown/missing/Test Mode credentials remain disabled.
- Gateway renderer: generated production specification matches existing issuer/audience/backend values; invalid identifiers and non-Cloud-Run/unsafe URLs are rejected.

Execution and scope are recorded in review-remediation-2026-11-16.md.

### Roles, private administrator and reports (2026-11-16)

| Case | Expected result |
| --- | --- |
| Login role choices | Accessible Customer/Delivery Partner/Admin controls; controls disabled during sign-in; preference grants no role |
| Admin setup | Nominated email prefilled; no Admin signup; secure password-link action uses entered email without handling a password |
| New partner | Login preference preselects post-verification confirmation; only customer/partner can be selected; approval still required |
| Existing role mismatch | API role wins and is explained on Home |
| Forged or absent admin claim | Matching email alone grants no Admin role; removed required claim denies access |
| Concurrent role changes | Exactly one initial choice wins; the other returns conflict; stored role cannot be overwritten |
| Account directory | Non-admin denied; escaped search, role filter and pagination; no bank/identity/password fields |
| Report finance | Invoice and actual payment dates differ correctly; duplicate payment references deduplicated; GST/taxable/invoice/cash/refund-due/settlement meanings remain separate |
| Report dates and geography | India midnight inclusive start/exclusive end; invalid/oversized date ranges rejected; same city in two states stays separate; missing historical city is Unspecified |
| Reconciliation / volume | Unallocated captures identified separately; over-limit report returns error, not a partial total |
| CSV / report UI | Selected report exports all records; previews disclose 50-row cap; formula injection and quoting handled; customer cannot enable admin queries |
