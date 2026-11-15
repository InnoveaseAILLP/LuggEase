# Google Cloud API deployment preparation

Project `luggease-innovease`; account `hello@innovease-ai.in`. Keep Firebase Hosting for the browser bundle. The mobile binaries are built and installed/distributed separately; both clients call the same API.

The owner selected “Keep Spark free; deploy web and prepare API deployment” on 15 November 2026. Cloud Run requires billing to be enabled, so the API deployment is prepared and intentionally not executed. Do not link billing or upgrade the Spark project without the owner's decision. Cloud Run free usage allowances do not guarantee zero charges. A reachable persistent MongoDB deployment is also required; a Cloud Run container's local filesystem cannot host the application's database.

Prepared artifacts: `backend/Dockerfile` and `deployment/cloud-run.service.yaml`. The service template uses zero minimum instances and a maximum of one instance; its image coordinates, service identity, MongoDB secret and supplier details must be supplied before deployment. It installs only backend runtime dependencies, excludes local secrets, and runs as an unprivileged user. Configure the Cloud Run service's dedicated runtime service account for Firebase Authentication read/revocation checks, and provide the MongoDB connection through Secret Manager. Do not put passwords, ADC JSON or service-account keys in the image.

Required runtime variables are listed in `backend/.env.example`. Set `APP_ENV=production`, `ALLOW_LEGACY_AUTH=false`, `FIREBASE_PROJECT_ID=luggease-innovease`, and explicit CORS origins for `https://luggease-innovease.web.app` and `https://luggease-innovease.firebaseapp.com`. Set real supplier information before taking bookings, plus Razorpay credentials when payments are enabled.

After account reauthentication, billing approval and database provisioning, deploy the backend source to Cloud Run with a low instance cap, zero minimum instances, and the supplied secrets. Keep the HTTP transport endpoint publicly reachable while enforcing Firebase authentication inside the application. Register its HTTPS URL as the frontend production endpoint, rebuild native/web clients, deploy the browser bundle and verify `/api/health`, verified login, quote, booking ownership and cancellation. Configure budgets and usage alerts; budget alerts are not spending caps.

Deployment remains pending until these prerequisites are satisfied. No deployment command should silently select another existing product's project, database or billing account.
