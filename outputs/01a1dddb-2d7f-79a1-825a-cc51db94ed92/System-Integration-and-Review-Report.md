# Review remediation and simulated system integration — 16 November 2026

Scope: the owner requested resolution of all Pending / Won't Fix review findings, then selected simulation mode instead of further physical iPhone checks. Production customer orders, signatures, payments and partner identities were not used as test fixtures.

## Review results

| Review | Result | Evidence |
| --- | --- | --- |
| CR016 | Verified existing protection | Seven key/environment/secret cases verify positive Live Mode recognition and production rejection of Test Mode, unknown keys and missing secrets. |
| CR017 | Fixed | Native checkout uses the shared scriptJSON serializer. Five escaping tests include closing-script payloads, ampersands and Unicode separators. |
| CR018 | Fixed | Bounded rolling-window admission moved from worker memory to atomic MongoDB operations. Two collection handles sharing real local MongoDB admitted exactly 60 of 100 concurrent requests; other users, expiry and fail-closed outage behavior are covered. |
| CR019 | Fixed | Android default ABIs are arm64-v8a and x86_64; the signed device-test release build uses the explicit arm64 override. |
| CR020 | Verified existing protection | Explicit configured CORS allowlist already existed. Trusted preflight succeeds; unlisted origin fails without allow-origin. |
| CR021 | Verified correct implementation | Standard-library hmac.new and compare_digest remain correct; tampered payment receipt tests pass. Replacing these would not fix a defect. |
| CR022 | Verified installed dependency requirement | Installed React Native Firebase 27.1.1 documents dynamic frameworks and SPM Firebase Apple SDK linkage. Retained that linkage; corrected the older report's overbroad version claim. |
| CR023 | Fixed | Validated gateway template renderer supplies issuer, audience and backend origin for each environment. Current production inputs reproduce the existing specification exactly. |

The revised workbook is under outputs/01a1dddb-2d7f-79a1-825a-cc51db94ed92. The source workbook was open in Excel, so it was preserved. Only H:J of the eight open rows and their row heights were changed in the revised copy. Source values elsewhere, sheet name, column widths, frozen header and filter metadata were checked for preservation. The revised range was rendered and visually reviewed.

## Simulated system integration coverage

Both complete journeys run through the real FastAPI routes, Pydantic validation, MongoDB persistence and PDF generation. Firebase identities, road/Places responses, signatures, GPS and payment-provider responses are isolated synthetic fixtures. Administrator role is assigned only in the disposable test database.

| Role / function | Scenario and expected outcome | Result |
| --- | --- | --- |
| Identity / access | Missing, invalid, unverified identities; blocked legacy login; no customer-to-admin escalation; private order and document ownership | Pass |
| Customer quote | Vehicle/load selection, current base/additional-km prices, server road distance, tax, labour, floors, stops, packing, discounts and tips | Pass |
| Agreement | Ownership review, exact accepted hash, immutable/single-use document, goods mismatch rejection | Pass |
| Payments | 50% advance; remainder blocked until loading/signatures; provider amount/stage/signature validation; duplicate/reconciliation/cancellation cases | Pass with fake provider |
| Partner onboarding | Submit profile, pending list, jobs unavailable before approval, administrator approval | Pass |
| Assignment | Complete journeys use partner self-acceptance and administrator assignment; duplicate acceptance rejected | Pass |
| Pickup | Customer invoice/agreement signatures after loading, valid pickup OTP, paid balance before departure | Pass |
| Status lifecycle | pending_payment → paid (finding partner) → assigned → picked_up → in_transit → delivered | Pass, both assignment paths |
| Tracking / ETA | Private, recent, bounded tracking; map endpoint denied outside in_transit; synthetic route points; late ETA rolls to 09:00 next day; partner revision needs reason and future time | Pass with synthetic location/route |
| Traffic supplement | Evidence and customer acceptance required, ₹200 cap, rejection produces no supplement invoice, cash receipt acknowledged separately | Pass |
| Destination | Required recipient declaration and handwritten signature; invalid/blank/duplicate signature rejected; premature delivered rejected | Pass |
| Documents | Private sales/pickup invoice PDFs contain final delivery acknowledgement; signature appendix and original agreement preserved | Pass |
| Feedback | Delivered customer only, five stars plus simulation comment; duplicate/racing ratings allow exactly one update | Pass |
| Earnings / administrator | Delivered earnings, awaiting payout, settlement metadata, admin statistics, non-admin rejection | Pass |

Two additional settlement defects were corrected during these checks: transfer references are trimmed and validated before storage; an atomic conditional update prevents simultaneous administrators from overwriting the recorded reference. A forced interleaving regression verifies one success and one conflict. Settlement testing records synthetic metadata only and never invokes a bank transfer.

## Verification evidence

- Final repository-configured backend suite (two workers, isolated Mongo substitute): **110 passed, no skips**. Third-party mongomock emits utcnow deprecation warnings; no test failed.
- Earlier broad backend invocation against isolated local MongoDB: **109 passed, 54 skipped**. The 54 older provider/deployed-environment tests are explicitly skipped without their required environment; they are not counted as passed.
- Final focused remediation and complete-delivery rerun, including the new forced settlement race: **20 passed**. This overlaps the full run and must not be added to its count.
- Frontend: **58 passed** across 14 suites. Typecheck, lint and Vite production build passed.
- Android arm64 release build passed; signed device-test APK produced with the existing certificate. No new certificate was created.
- iOS build initially caught unsupported iOS 10/12 targets in generated Pods. The existing Swift Xcode utility now has a --normalize-pods mode that changes only generated dependency deployment targets to the app's existing iOS 16.1 minimum. Dynamic linkage and signing stay unchanged. The iOS Release rebuild passed (**BUILD SUCCEEDED**).
- Local MongoDB databases use unique luggease_review_ identifiers and are dropped by fixture teardown. No production database is targeted.

Useful reproductions from the repository root:

```sh
cd backend
../.venv/bin/python -m pytest -q
cd ..
LUGGEASE_TEST_MONGO_URL=mongodb://127.0.0.1:27019 .venv/bin/python -m pytest backend/tests/review/test_review_remediation.py backend/tests/review/test_delivery_simulation.py -q
swift run --package-path frontend/scripts/xcode-project xcode_spm_setup --normalize-pods frontend/ios/Pods/Pods.xcodeproj
```

The local MongoDB command assumes an isolated loopback test server is running; never substitute a production URL. The repository's fixed two-worker pytest configuration is preserved.

## Deployment and limits

API image: 97f797e1-c9af-4e92-ada0-ffd229507c6f; Cloud Run revision luggease-api-00014-lzq, 100% traffic. Hosting version: 066fbeb3b2b310ab. Image-only deployment preserved runtime configuration, private networking and invocation policy. The gateway specification did not need a redeployment because its rendered production content did not change.

Simulation success does not certify live Firebase password entry, physical navigation/arrival, background location sharing, real customer signatures, live merchant collections, settlement transfers or third-party message delivery. Production online collections remain disabled without approved Live Mode credentials. Physical iPhone real-account checks were stopped at the owner's request; the reported native signed-in session was not visually verified. No updated app was installed on a phone in this simulation-only continuation.

Final live smoke verification: web HTTP 200; direct unauthenticated Cloud Run /api/health HTTP 403; unauthenticated gateway /api/orders HTTP 401. IAM inspection confirms only the dedicated gateway service account holds roles/run.invoker. Android signing verification passed and iOS Release compilation passed.
