#!/usr/bin/env bash
set -euo pipefail

frontend_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
sdk_dir="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
tools_version="${ANDROID_BUILD_TOOLS:-37.0.0}"
signing_dir="$frontend_dir/android/.device-test-signing"
input="${1:-$frontend_dir/android/app/build/outputs/apk/release/app-release.apk}"
output="${2:-$frontend_dir/android/app/build/outputs/apk/release/app-oppo-device-test.apk}"

for required in "$input" "$signing_dir/luggease-device-test.p12" "$signing_dir/password"; do
  if [[ ! -f "$required" ]]; then
    echo "Missing device-test signing input: $required" >&2
    exit 1
  fi
done

"$sdk_dir/build-tools/$tools_version/apksigner" sign \
  --ks "$signing_dir/luggease-device-test.p12" \
  --ks-key-alias luggease-device-test \
  --ks-pass "file:$signing_dir/password" \
  --out "$output" "$input"
"$sdk_dir/build-tools/$tools_version/apksigner" verify --print-certs "$output"
echo "Device-test APK: $output"
