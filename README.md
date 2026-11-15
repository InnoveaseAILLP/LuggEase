# Lugg-Ease

Shared iOS, Android and web moving-service app with a FastAPI/MongoDB business API and Firebase Authentication.

## Project layout

- `frontend/App.tsx`: React Navigation screens and authenticated navigation gates.
- `frontend/android`, `frontend/ios`: standard native application projects; bundle ID `in.innovease.luggease`.
- `frontend/src/firebase.ts` / `firebase.web.ts`: native and browser identity implementations.
- `backend/server.py`: pricing, bookings, partners, settlements and payments.
- `backend/firebase_identity.py`: verified Firebase identity contract.
- `docs/requirements.md`: functional requirements and release gates.
- `docs/test-cases.md`: unit, integration and manual acceptance cases.
- `docs/test-execution.md`: current validation results and limitations.
- `deployment/cloud-run.md`: API hosting prerequisites and prepared container.

## Local setup

Use Node ≥22.11 and Python 3.12 or newer. Install dependencies with `npm ci` in `frontend`. Create a Python virtual environment and install `backend/requirements-dev.txt`. Copy each `.env.example` to its local `.env` and fill the API URL and supplier settings. Use a separate MongoDB database for each environment.

Firebase project: `luggease-innovease`, administered through `hello@innovease-ai.in`. Native client configs and public web config are included. Server credentials are not included: use Application Default Credentials for this project, or an appropriate runtime service identity. Set `FIREBASE_PROJECT_ID=luggease-innovease`; never reuse another product's Firebase configuration.

```sh
cd backend
../.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8012
```

In another terminal:

```sh
cd frontend
npm run web
# or, after native dependencies/signing setup:
npm run android
npm run ios
```

Native configuration reads `APP_BACKEND_URL`, `APP_QA_BACKEND_URL`, `APP_PROD_BACKEND_URL`, `APP_ENV` and `GOOGLE_WEB_CLIENT_ID` through react-native-config. Browser configuration reads the corresponding `VITE_APP_*` values. Device development requires a reachable Mac LAN address; production requires HTTPS. Changing a native configuration requires rebuilding. Firebase manages credential persistence and token renewal.

## Authentication and roles

Registration sends email verification. Continue reloads the Firebase user and refreshes its ID token before creating a business profile. Google and password sign-in use the dedicated Firebase project. Password reset replies do not disclose account existence. Customers and partners choose their own allowed role once; administrators are provisioned by trusted server-side operations. An existing email alone cannot attach a new Firebase UID to a legacy account. No existing users or orders are bulk-migrated by this change.

Legacy backend password routes are disabled by default. An explicitly isolated legacy-development environment can enable `ALLOW_LEGACY_AUTH=true` with a strong `JWT_SECRET`; do not enable it in production. Historical preview-server tests depend on that old interface and are separate from the current Firebase regression suite.

## Verification

```sh
.venv/bin/python -m pytest backend/tests/test_pricing.py backend/tests/review -q --junitxml=test_reports/review-backend.xml
npm --prefix frontend test -- --json --outputFile=../test_reports/review-frontend.json
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build:web
```

See `docs/test-execution.md` for what was actually executed; manual acceptance cases are not automatically considered passed.

## Hosting

Firebase Hosting serves `frontend/dist` with SPA fallback. Build with production `VITE_APP_*` configuration, then deploy with `npx -y firebase-tools@latest deploy --only hosting --project luggease-innovease --account hello@innovease-ai.in`. The Python API/database require separate hosting. Spark supports the configured email/password and Google flows; production SMS is outside this free-plan scope.

## iOS dependency configuration

After `pod install` in `frontend/ios`, run the Swift helper from the repository root:

```sh
swift run --package-path frontend/scripts/xcode-project xcode_spm_setup "$PWD/frontend/ios/LuggEase.xcodeproj"
```

It links the Firebase resource, sets the React Native minimum iOS version (16.1), and configures the real-device UI test target. Use `LuggEase.xcworkspace` in Xcode. The current owner signing team is configured for device testing; other developers must select their own valid signing team.
