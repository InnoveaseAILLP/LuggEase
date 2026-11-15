# Lugg-Ease requirements

Version 1.0 • 15 November 2026 • Implementation and acceptance baseline

## Purpose and scope

Lugg-Ease connects customers who need goods moved in India with approved delivery partners. Customers select pickup/drop locations, items and services, review a server-calculated price, pay, and track delivery. Partners apply, receive administrator approval, accept suitable jobs, and progress delivery. Administrators manage partner approval, assignments and settlements.

The application supports Android, iOS and web using shared React Native screens. Native projects use React Native Community CLI and React Navigation; the browser build uses Vite and React Native Web. The business API remains FastAPI with MongoDB. Firebase supplies identity and static web hosting. A Firebase project does not itself host the Python API or MongoDB.

## Stakeholders and permissions

| Actor | Permissions |
| --- | --- |
| Guest | Register, sign in, request password reset, verify email |
| Customer | Choose customer role, quote, book, pay, view own orders, cancel eligible orders, rate completed deliveries |
| Partner | Choose partner role, submit identity/vehicle/bank details; approved partners accept suitable paid jobs and update assigned deliveries |
| Administrator | Server-assigned access to partner decisions, assignment, operational statistics and settlement recording |

## Functional requirements

| ID | Requirement and acceptance condition |
| --- | --- |
| AUTH-01 | Register with full name, valid email and password of at least 8 characters. Trim name/email; normalize email case. Never store passwords in application storage. |
| AUTH-02 | Send email verification and provide resend and Continue actions. Backend rejects identities without a verified email. |
| AUTH-03 | Email/password sign-in and Google sign-in use the dedicated Lugg-Ease Firebase project. Cancelled or failed sign-in leaves the user outside protected screens and displays a useful message. |
| AUTH-04 | Password reset accepts a valid email and displays an account-neutral confirmation. |
| AUTH-05 | Firebase manages session persistence and ID-token renewal. Every protected API call sends the current ID token. Logout removes protected UI and clears cached business data. |
| AUTH-06 | Backend verifies token signature, audience/project, expiry, revocation, disabled status, UID and verified email through Firebase Admin. Client-supplied role/UID is never trusted. |
| AUTH-07 | First verified sign-in creates one backend profile per Firebase UID. An existing email alone must not attach a new identity to legacy orders or administrator privileges. Legacy migration requires an explicit reviewed process. |
| ROLE-01 | New users may select customer or partner only; role changes and admin self-enrollment are rejected by the server. |
| ROLE-02 | Incomplete partners complete their profile. Submitted profiles require administrator approval before accepting jobs. Editing a profile returns it to pending approval. |
| BOOK-01 | Capture pickup/drop address and Indian state, distance, item quantities, service category, service type, schedule, floors, lift availability and optional extra stops. Invalid input is rejected. |
| PRICE-01 | Server selects an eligible vehicle by weight and item size, calculates distance, labour, packing, floors, stops, tolls, coupons, tips, tax and 5% platform commission. Display the itemized quote before booking. |
| ORDER-01 | Create bookings only for customers. Persist the server quote, ownership, generated pickup code and status timeline. |
| ORDER-02 | Customers see their own orders; partners see assigned orders or eligible open-job views. Other customers receive no order details. Open-job views hide customer email, phone and pickup code. |
| ORDER-03 | Require payment before assignment. Only approved partners with adequate vehicle capacity can accept a job. Competing assignment attempts cannot both succeed. |
| ORDER-04 | Enforce assigned → picked_up → in_transit → delivered. Pickup requires the customer-provided code; partners never receive that code from the API. Concurrent transitions must detect stale state. |
| ORDER-05 | Allow cancellation only while pending payment, paid or assigned. Record fee/refund calculation; detect concurrent status changes. Actual refund execution remains an operational/payment-provider responsibility. |
| PAY-01 | Razorpay order creation and signature verification happen on the API. Confirm order, amount, INR currency and payment status before marking paid. No live payment is required for testing. |
| ADMIN-01 | Keep approval, manual assignment and settlement operations administrator-only. Startup must not reset or promote an existing user's account. |
| ENV-01 | Keep development/QA/production endpoints separate. Sign out before changing environment and clear caches. Production URLs require HTTPS. |

## Nonfunctional requirements

- Native and browser builds must typecheck; lint and automated regression suites must pass.
- Register actions must validate input and prevent concurrent email/Google submissions. Password visibility is user-controlled.
- Native sensitive storage uses operating-system Keychain/Keystore. Browser sessions use Firebase session persistence; non-secret preferences use AsyncStorage.
- Secrets, service account keys, local environment files and private database contents must remain outside version control. Public Firebase client configuration is not a server credential.
- Backend CORS uses explicit allowed origins. Backend indexes enforce unique email, user ID and Firebase UID.
- Account deletion, privacy/terms publishing, real refund automation, live payment certification and store submission require separate acceptance work.

## Cloud and cost constraints

Project: `luggease-innovease`; requested account: `hello@innovease-ai.in`. Spark was verified in the Firebase console. Email/password and Google providers are enabled. Production SMS verification is excluded because it requires billing. Static web hosting may use Spark subject to its quotas. The owner selected Spark-only hosting: deploy static web and prepare the API deployment without enabling billing. Cloud Run and a production database require a later hosting decision; no promise of an entirely free production stack is made.

## Health-Ease comparison

The reference reviewed was `HomeChef/mobileapp/HomeChef/frontend/src/FirebaseAuthModal.tsx` and its authentication helpers. Adopted patterns: verified email before access, resend/continue flow, password reset, Google authentication, profile completion, server-controlled roles, and cache cleanup. Health-Ease project IDs, users and native application configuration were not reused. Its SMS-based signup step is deliberately excluded from the Spark scope.

## Acceptance and release gates

Unit and integration scenarios are defined in `test-cases.md`. Release requires successful native launch, real-device interaction checks, deployed web checks, accessible API/database, valid production supplier/payment configuration, and explicit billing approval if paid Google Cloud services are used. A successful static deployment alone is not proof of working end-to-end bookings.

## Approved deployment changes — 15 November 2026

- The website must be available at `https://luggease.innovease-ai.in` with valid HTTPS.
- The full-name field must start empty and must not suggest a sample person's name.
- Google sign-in must open directly from the user action, display actionable failure messages and finish the authenticated API profile exchange.
- Google Cloud billing is approved using My Billing Account; Firebase Spark-only hosting is superseded for the API/database deployment.
- Cloud Run invocation must remain private. Only the dedicated, owner-approved API Gateway service account may invoke it. Mobile/web business requests must carry a Firebase ID token validated at the gateway and independently verified by the API.
- Browser CORS preflight may be unauthenticated; it must not return business data.
- Deploy a separate persistent database with authentication, TLS, no public IP, constrained private ingress and scheduled snapshots. Preserve existing local customer data without migrating it.
- Install the updated production build on the iPhone 13 Pro Max and verify launch, validation, registration and the Google authentication handoff.

## Billing entity and light branding update

The Profile billing entity must display `Innovease AI & Technology Transformation Consulting LLP` and the registered address `D No, 4/518 Nethaji Garden, Pannimadai Road, Coimbatore North, Coimbatore- 641017, Tamil Nadu, India`. The API supplies these values centrally. Supplier GSTIN is `33AAMFI4627F1ZG`, PAN is `AAMFI4627F`, state is Tamil Nadu, bank is IDFC FIRST Bank and IFSC is `IDFB0080537`. Profile must omit Deployments & environments and support hours; Need help must show only `support@innovease-ai.in`.

Use the owner's latest three-bag icon reference with an ivory/peach and light orange palette and the exact wordmark `LuggEase` at the bottom. Apply consistent artwork to in-app branding, web install icons/favicons, iOS AppIcon assets, and Android adaptive/legacy launcher assets.


## Google Maps address suggestions and sales invoice download

- Pickup and drop each provide Google Places API (New) address suggestions after three characters, debounced by 350 ms. Searches are restricted to India and use separate temporary billing sessions. Selection retrieves the full address and state; customers can add flat numbers or type manually.
- Keep Google Maps attribution visible with suggestions. Do not persist suggestion lists. Publish Terms of Use and Privacy Policy, linked from login, describing Google Maps address processing.
- API credentials remain in Secret Manager, restricted to Places API, and are read only by the API runtime. Require Firebase authentication, validate inputs, cap per-user requests and return safe retry/manual-entry errors. Cloud Run remains private behind its authenticated gateway.
- Paid sales invoices expose Download Sales Invoice PDF on order details for the customer who owns the order and administrators. Other customers and partners cannot download them. Unpaid orders return no sales invoice.
- PDFs contain supplier legal identity, invoice number/date, bill-to details, booking addresses, SAC/place of supply, charges, discounts, applicable GST split, round-off, totals, words and a separately identified tip. Snapshot supplier details on payment confirmation to preserve issued invoices.
- Browser downloads a PDF file; Android 10+ saves to Downloads/LuggEase without broad storage permission; iOS offers its native document menu with Save to Files. Older Android opens its PDF viewer. Protected files must not have public links or credentials in URLs, and responses must not be cached.


## Revised vehicle rates — 15 November 2026

Owner-approved transport base fares include the first 2 km: 2-Wheeler (20 kg) INR 45, then INR 45/km; 3-Wheeler (500 kg) INR 125, then INR 140/km; Mini Truck/Tata Ace (750 kg) INR 150, then INR 175/km. Existing GST, labour, packing, handling, coupons, stops and commission rules continue to apply. Rates apply to newly calculated quotes; stored orders retain their booked quotes.


## Superseding distance-rate clarification — 15 November 2026

The owner explicitly confirmed retaining the first-2-km base fares INR 45/125/150, and charging **each additional kilometre** at INR 45 for 2-Wheeler, INR 140 for 3-Wheeler, and INR 175 for Tata Ace. This supersedes the earlier INR 10/16/23 distance rates. Other vehicles, tax and ancillary services remain unchanged. Existing booked quotes are retained.
