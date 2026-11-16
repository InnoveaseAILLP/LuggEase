# Oppo Android device test

Device: Oppo CPH2269, Android 12, arm64-v8a. USB debugging was authorized by the owner. Test endpoint: `https://luggease-4oe2nqwp.uc.gateway.dev`, backed by private Cloud Run and Firebase Authentication.

## Device-test signing

The initial Firebase Android app registration had no signing fingerprints because Android compilation/device acceptance had not been performed during the earlier iOS/web work. Google sign-in on Android requires the package name and signing certificate registration. A dedicated private local test certificate is now registered for `in.innovease.luggease`; both SHA-1 and SHA-256 are present. The refreshed `google-services.json` includes the matching Android OAuth client.

The key and its password are stored only in the Git-ignored `frontend/android/.device-test-signing/` directory. They must not be committed or shared. This certificate is for local device testing; Play Store distribution requires separately registering the actual app-signing certificate.

## Acceptance cases

| Case | Expected result |
|---|---|
| Install and cold launch | App opens without Metro or a development server |
| Empty sign-in | Visible required-fields validation |
| Create account | Full-name input starts empty; no sample person's name |
| Password visibility | Toggle changes masking without clearing text |
| Google sign-in | Google account chooser opens and returns to the app |
| Verified identity | API profile exchange succeeds and Home loads |
| Bookings | Authenticated list loads; no test booking/payment created |
| Relaunch | Firebase session restores and profile reloads |
| Stability | No app fatal exception or JavaScript startup failure |

Executed on the physical Oppo: install/cold launch, required-field validation, empty full-name registration, masked/show/hide password with dummy text, owner Google sign-in, saved-login restore, authenticated empty Orders, final Profile legal/tax/bank/support values and logout/relogin all passed. The owner explicitly approved ADB automation and the logout test. No booking or payment was created; other installed applications were preserved.

Evidence: `screenshots/android-oppo-profile-final.png`, `android-oppo-home-branded.png`, `android-oppo-orders.png`, and `android-oppo-launcher.png`.

## Build issue fixed

The first build failed at `react-native-firebase_auth:compileReleaseKotlin`: Firebase Auth 25.0.0 contains Kotlin 2.4 metadata, while the project selected Kotlin 2.2.0. Updated the root Android Kotlin version and explicit plugin dependency to 2.4.0, matching React Native Firebase 27's Android compiler baseline. No SDK metadata compatibility checks were bypassed.

The Release variant bundles JavaScript for standalone testing. Its APK is re-signed locally with the dedicated private device-test certificate before installation. The template's shared Android debug certificate is not registered with Firebase and must not be used as the Google-login acceptance APK. Build and signing outputs are generated files, not source artifacts.

## Reproducing this local test build

With the Android SDK and a compatible JDK configured, run from `frontend/android`:

```sh
./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --max-workers=4
```

Then run `frontend/scripts/sign-android-device-apk.sh` from the repository root. It reads the ignored private signing material, produces `frontend/android/app/build/outputs/apk/release/app-oppo-device-test.apk`, and verifies its certificate. The script never places the signing password in command-line arguments. Preserve the local key for future updates to the same test installation. Do not distribute this APK as a Play Store release.


## Google Maps update

Live Google autocomplete and details succeeded for both pickup (Coimbatore Railway Station) and drop (Coimbatore Airport). Selected addresses and Tamil Nadu state were checked on physical screenshots. No order was submitted. The final build includes independent field sessions, 350 ms debounce, manual fallback and Google Maps attribution above results. PDF MediaStore export is covered by mocked frontend tests and an isolated backend PDF integration test; a paid-order download was not executed on this phone.


## Agreement and map update — 16 November 2026

Signed Android Release update installed on the Oppo successfully with existing application data preserved. The native live-map component is covered by automated status, backgrounding and delayed-permission tests. After the owner unlocked the phone, the saved login restored and the existing unpaid order showed the ETA, INR 958 advance and INR 958 pickup balance. Its live map button was absent and the In-transit-only notice was visible. Agreement download succeeded to Downloads/LuggEase with the Transfer-Agreement filename. Existing order status and accepted agreement were preserved. No real pickup signatures or parcel journey are claimed as tested. Evidence: test_reports/oppo-agreement-map-check.json and screenshots/android-oppo-map-status-gate.png.
