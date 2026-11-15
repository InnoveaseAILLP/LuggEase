# Lugg-Ease Google Cloud deployment

Project: `luggease-innovease` (366550426105). Account: `hello@innovease-ai.in`. Always pass this project explicitly; the account also owns other products.

On 15 November 2026 the owner authorized enabling billing and deploying the API, superseding the earlier Spark-only choice. Linking Firebase Payment failed with a Google billing-project quota error. The owner then selected My Billing Account (`01A51C-F537C2-D1A8A6`), and billing was enabled successfully. This is a billed project; free usage allowances and instance limits do not cap charges.

## Infrastructure

- Firebase Hosting serves the React Native Web bundle. Custom domain: `luggease.innovease-ai.in`, CNAME to `luggease-innovease.web.app`; Firebase manages HTTPS. Certificate verification uses the `_acme-challenge.luggease` TXT record returned by the Hosting API.
- Cloud Run: `luggease-api`, `us-central1`, 1 CPU / 512 MiB, minimum 0 and maximum 1 instance, dedicated `luggease-api` runtime identity. Private IAM invocation, granted only to `luggease-gateway@luggease-innovease.iam.gserviceaccount.com`. API Gateway validates Firebase JWTs before forwarding business requests; the backend independently verifies the forwarded original token, revocation, email verification and application authorization. Only CORS OPTIONS requests bypass gateway authentication.
- MongoDB 8: dedicated `luggease-mongo` Debian 12 VM, `e2-small`, `us-central1-a`, retained 20 GB standard boot disk containing the Docker volume. No public IP or public MongoDB/SSH firewall rule. Internal IP `10.24.0.10`. Cloud Run uses Direct VPC egress on `luggease-private` / `luggease-central` (`10.24.0.0/24`). The only database ingress rule allows TCP 27017 from that subnet.
- Database is new and empty apart from application-created indexes/profiles. No existing local customer data is migrated.
- MongoDB requires authentication and TLS. Secret Manager stores the connection URL, trusted certificate, and VM bootstrap material. Runtime access is scoped to the specific secrets each identity needs. Application database roles are scoped to `luggease_production`. No service-account key is created.
- `luggease-builder` can read the build source bucket, write the `apps` Artifact Registry repository, and write build logs. `deployment/cloudbuild.yaml` builds the backend Dockerfile.
- Temporary Cloud NAT (`bootstrap-egress`, router `luggease-bootstrap`) permits initial Debian/Docker installation on the private VM. Remove it after bootstrap is verified; recreate outbound access for package/image upgrades. The database keeps its local image and restarts without internet access.

## Operations and limitations

The database VM/disk incur ongoing charges even when Cloud Run scales to zero. It is a single-zone database, not a high availability cluster. Daily disk snapshots are scheduled at 03:00 UTC and retained for seven days, including when the disk is deleted. Retaining the disk and crash-consistent snapshots do not replace a verified database restore procedure. Verify restores before taking real customer bookings. The private MongoDB certificate lasts 365 days from provisioning; rotate the server PEM and the trusted CA secret before expiry, restart MongoDB and roll a Cloud Run revision. Keep bootstrap and runtime secrets out of Git and build contexts.

Existing supplier configuration is retained in the deployment environment. Confirm legal/tax/bank details before commercial use. Razorpay credentials are not deployed; checkout remains unavailable until payment configuration is supplied. Legacy authentication and demo seeding remain disabled.

Rebuild the web bundle with `VITE_APP_ENV=production` and `VITE_APP_PROD_BACKEND_URL` set to the deployed service URL. Rebuild native clients with the corresponding `APP_ENV` / `APP_PROD_BACKEND_URL`. Firebase Authentication must authorize the custom domain. Validate health, unauthenticated rejection, verified login and profile creation, role selection, and booking ownership after each release. Budget alerts are recommended and do not enforce a spending cap.

Deployment URLs and verification results are recorded in `docs/test-execution.md` after deployment completes.

The owner explicitly selected private API invocation. No `allUsers` invoker binding was applied (the attempted grant was rejected by organization policy). An IAP SSH firewall change was rejected by automatic approval review and was not applied; database diagnostics use startup serial logs. No SSH ingress was opened.

## Deployed endpoints

- Web: https://luggease.innovease-ai.in
- Client API Gateway: https://luggease-4oe2nqwp.uc.gateway.dev
- Private backend: https://luggease-api-366550426105.us-central1.run.app
- Container release: `543172a4-f9a1-4846-addc-2119c3432137`; revision `luggease-api-00002-7sr`.

Do not configure clients with the private backend URL. Gateway `luggease` uses `firebase-v1` and the dedicated approved gateway identity. The only unauthenticated operation is OPTIONS for browser preflight; GET and POST require Firebase JWTs. Existing application checks remain authoritative for user verification, roles and record ownership.


## Address suggestions and invoice PDFs

Final API image build: `4096bed5-17ef-44af-a5bb-c79a47d98144`; revision `luggease-api-00007-zzm`. Authenticated `/api/places/autocomplete` and `/api/places/details/{place_id}` proxy Google Places API (New). `GOOGLE_MAPS_API_KEY` is injected from `luggease-google-places-key:1`, restricted to `places.googleapis.com`; only the runtime receives secret access. Browser/native clients use their existing Firebase ID token, never this Google key. Each field uses its own autocomplete session; details terminate the selected session. No Places suggestions are stored. Per-user limit: 60 upstream requests/minute per Cloud Run instance (currently max one instance). This limiter is not a billing budget.

The gateway wildcard already covers `/api/orders/{order_id}/invoice.pdf`. The API checks customer ownership or administrator role and requires an issued invoice number/date. PDF responses use `private, no-store`; no public download URL is created. Supplier metadata is snapshotted on payment confirmation. Existing invoices without snapshots fall back to current supplier configuration. Newly generated PDFs include only selected invoice fields, never pickup OTPs or partner settlement data.

Public Terms and Privacy pages are included in Hosting at `/terms.html` and `/privacy.html`. Tracked `frontend/.env.production` contains only the public production gateway URL and environment; secrets belong exclusively in Secret Manager/local ignored environment files.

Implementation references: [Google Places autocomplete](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete), [session tokens](https://developers.google.com/maps/documentation/places/web-service/using-session-tokens), [attribution and address-storage policies](https://developers.google.com/maps/documentation/places/web-service/policies).

Latest pricing deployment: image build `ed407853-a422-41ea-b64c-51686368f46f`, revision `luggease-api-00008-96l`, 100% traffic. Live catalog verification confirmed the owner-approved base/per-km rates 45/10, 125/16 and 150/23. No IAM, secret, network or existing-order changes were made.

Superseding owner-confirmed pricing deployment: build `f74ed8d3-ff6a-48eb-a1d0-1f0dd2b0815a`, revision `luggease-api-00009-kwg`, 100% traffic. Live verified base/per-additional-km: 45/45 (two-wheeler), 125/140 (three-wheeler), 150/175 (Tata Ace), first 2 km included. Existing runtime configuration and invocation policy were preserved.
