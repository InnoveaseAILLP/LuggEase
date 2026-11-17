# LuggEase roles, administrator setup and reports

Updated 17 November 2026 (India time).

## Roles and login

The public login screen offers only Customer and Delivery Partner. Administrator sign-in is available at the separate, unlisted URL https://luggease.innovease-ai.in/staff-access/le-486fcbf0f847745b0313870027057766. No administrator link, role choice or prefilled administrator email appears on public login. This is a login preference, not a permission grant. Existing accounts open the saved role returned by the API; a visible Home label explains any difference from the requested role. Profile also shows the saved role.

New customers and partners explicitly confirm their role after email verification. A partner's vehicle/profile must still be approved before jobs are available. Role selection is atomic and cannot overwrite a concurrent selection. There is no self-service Admin signup, promotion or role-switch control.

The owner requested administrator **rmanojananth@innovease-ai.in**. A new identity was provisioned in **luggease-innovease** with the Firebase custom claim `luggeaseAdmin: true`. No password was chosen, no email was marked verified and no transactional email was sent by the agent. The application accepts this claim only after Firebase identity verification (including verified email). A matching email alone grants nothing. Claim-managed administrator profiles reject requests without their required signed claim. Other existing users and administrator records were not modified.

To choose a password:

1. Open https://luggease.innovease-ai.in/staff-access/le-486fcbf0f847745b0313870027057766. The requested email is prefilled and fixed for this administrator entry.
2. Press **Set / reset admin password** to request the secure email link yourself.
3. Open the email from **LuggEase <luggease@innovease-ai.in>** and choose your password privately.
4. Return and sign in. If asked to verify email, use **Resend verification email**, open that link and press **Continue after verification**. Google sign-in with the nominated account is also available.

The administrator profile appears in the account directory after its first verified sign-in. The directory is read-only, with role filters, name/email search and pagination. It does not return bank details, identity documents, passwords, claims or phone numbers.

## Reports

Admin dashboard → **Reports and account directory** → **Reports**. Choose the last 7, 30 or 90 days, or apply a custom range of at most 366 days. The loaded report states its actual date range in India time.

Available reports and CSV downloads:

- Consolidated booking, invoice, GST, collection, commission, balance, refund-obligation and settlement overview.
- Daily and monthly invoiced sales and posted provider collections.
- Recorded transactions, including instalment stage, payment reference, customer-confirmed traffic cash, settlement metadata and refunds due.
- Pickup and destination city/state demand and invoiced values.
- Current status distribution of bookings created in the selected period and service-category demand.
- Provider captures awaiting reconciliation/refund review, separately identified from payments posted to an order.

The on-screen table previews at most 50 records; CSV includes the complete generated dataset. Queries exceeding 10,000 relevant orders or reconciliation records return a clear request to narrow the range. They do not silently truncate. CSV cells are escaped against formula injection. Native exports use the existing private cache/OS save flow; web exports use a local Blob download.

### Financial definitions

Demand counts use booking creation dates. Invoice totals use invoice dates; posted collections use payment dates. All boundaries use Asia/Kolkata and amount arithmetic uses integer paise. Gross invoice value excludes tips and includes subsequently cancelled invoices, with those invoices identified separately. GST and pre-GST invoiced sales are distinct. Quoted platform commission is not presented as recognized revenue. Current unpaid balances reflect the latest state of invoices issued within the selected period, not a reconstructed historical balance.

Traffic supplements are separate invoices; cash receipts are customer declarations. Refund amounts in this application's cancellation flow are amounts due, not proof that a provider refunded them. Partner settlement records are external-transfer metadata, not bank confirmations. These are operational reports, not a replacement for a bank/provider settlement ledger or statutory financial statements.

Historical orders have no structured city in many cases. They remain **Unspecified** rather than guessing from free-text addresses. New booking forms capture pickup and destination cities, filled from Google Places locality when available and confirmed/entered by the customer. No historical order, accepted agreement, invoice or payment was rewritten.

## Branding and public policies

Google's saved app name, project display name and all four Auth email sender names are LuggEase. The verified innovease-ai.in email sender domain is active, with sender local part luggease. Existing SPF/DKIM records were already correct; only `firebase=luggease-innovease` was added as a TXT record, preserving HealthEase and other mail records.

Web Firebase authDomain is luggease.innovease-ai.in. Its OAuth JavaScript origin and /__/auth/handler callback were verified in the registered Google web client. Google can show the actual domain as part of its own security UI; changing an app name does not remove Google's identity-provider branding.

Privacy and terms pages are deployed at /privacy.html and /terms.html; /Privacy.html redirects to /privacy.html. The policies include the company name, support address, icon and links from login and Google's branding settings.

**Remaining provider limitation:** Google rejected attempts to change the account-management email action URL with EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED, including through the Firebase console. Existing verification/reset links therefore retain the Firebase-hosted action handler. The visible sender name and From address were successfully changed and verified; action links are not claimed as customized. No email-delivery or private password-entry test was performed in simulation scope.


## Release verification

API image 80465362-4de6-4620-9220-9ce1b02c60fe; revision luggease-api-00015-x2d, serving 100% of traffic. Final Hosting version 154feff39fdcc68d. Private gateway-only invocation was retained. Anonymous reports/users calls through the gateway return 401; direct private Cloud Run calls return 403.

Backend configured suite: 119 passed, including against real isolated MongoDB. Frontend: 74 passed across 17 suites; targeted report/role reruns also passed. Typecheck, lint, web production build, signed Android arm64 release and iOS release builds passed. No updated app was installed on a physical phone in this simulation continuation.

Live browser checks confirmed Customer / Delivery Partner / Admin login controls, partner signup fields, disabled Admin signup, the nominated administrator email/password-link control, and the saved Customer role on an existing customer Home. A web checked-state accessibility defect was found and fixed, then verified on the final deployment (Customer and Admin selection correctly announced). No administrator password was entered, no setup email was requested by the agent, and no claim is made that the new administrator's private first login or report exports were tested on a physical phone.

The public policy URLs and capitalized privacy redirect return the branded documents. Google branding settings and all four email sender names/addresses were verified. Actual email delivery was not tested. Test fixtures cleaned their unique local databases; no customer order or payment was changed by these tests.


## Separate administrator entry — 17 November 2026

The unlisted administrator URL is a web UI entry, not an authorization mechanism. Verified Firebase identity, the signed administrator claim and API authorization remain mandatory. A signed-in customer, partner or account without a role sees an administrator-account barrier at this entry, rather than customer onboarding or reports. The public/native login ignores stale Admin preferences and exposes only Customer/Delivery Partner choices. Existing administrator permissions and reports were preserved.

The entry has no public navigation link, no signup, an exact-path check, no-index/no-follow/no-archive response headers, a no-referrer policy and no-store caching. It is not placed in robots.txt or a public sitemap. Direct visits and refreshes use the existing SPA Hosting rewrite.


## Separate administrator entry release — 17 November 2026

Published Hosting version sites/luggease-innovease/versions/6ca15eb5128056fe. Public login was visually verified with only Customer and Delivery Partner, no Admin control and no administrator email. The dedicated entry was visually verified with the nominated email fixed, password sign-in and set/reset-password action, and no signup. A live administrator credential attempt was not certified successful; password setup and credential entry remain private user actions.

78 frontend tests passed across 18 suites, including exact-path matching, stale preference isolation, native/public behavior, private form setup and non-admin account barrier checks. Typecheck, lint, web production build, signed Android arm64 Release and iOS Release builds passed. The backend and its assigned roles were not changed. Direct private API rejection remains 403, and tokenless gateway access remains 401.

Both dedicated pathname variants returned 200 with X-Robots-Tag noindex/nofollow/noarchive, Cache-Control no-store and Referrer-Policy no-referrer. Root, privacy and terms pages remained available. Deployment used the official Firebase Hosting REST API with the renewed authorized account after the CLI's stored credentials/token handling failed. Reference: https://firebase.google.com/docs/hosting/api-deploy . No additional service-account key or public API access was created.
