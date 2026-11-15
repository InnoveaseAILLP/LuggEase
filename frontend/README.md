# Lugg-Ease client

React Native Community CLI for Android/iOS, React Navigation, Firebase Authentication, and Vite/React Native Web.

Run `npm ci`, copy `.env.example` to `.env`, configure the API URL and Google web client ID, then `npm run web`, `npm run android`, or `npm run ios`. See the repository README for backend, authentication, deployment and test instructions.

The iOS Firebase SDK uses Swift Package Manager through the native Firebase dependency tooling; the Podfile uses dynamic linkage. Keep GoogleService-Info.plist linked as an application resource and preserve its callback URL scheme. Physical devices require a reachable API URL and valid Apple signing. Native release builds embed JavaScript and do not require a development server.
