#!/usr/bin/env bash
set -euo pipefail
qweeps_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

qweeps_sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "$qweeps_sdk" && -f "$qweeps_root/android/local.properties" ]]; then
  qweeps_sdk="$(sed -n 's/^sdk.dir=//p' "$qweeps_root/android/local.properties" | head -1)"
fi
qweeps_sdk="${qweeps_sdk:-$HOME/.local/share/qweeps-android-sdk}"
if [[ ! -f "$qweeps_sdk/platforms/android-35/android.jar" || ! -d "$qweeps_sdk/build-tools/35.0.0" ]]; then
  echo 'Android SDK API 35/build-tools 35.0.0 not found. Set ANDROID_HOME to the installed SDK.' >&2
  exit 1
fi
export ANDROID_HOME="$qweeps_sdk"

qweeps_valid_java() {
  [[ -x "${1:-}/bin/java" ]] || return 1
  local qweeps_java_version qweeps_java_pattern='version "(17|21)(\.|")'
  qweeps_java_version="$("$1/bin/java" -version 2>&1)" || return 1
  [[ "$qweeps_java_version" =~ $qweeps_java_pattern ]]
}
qweeps_java="${QWEEPS_JAVA_HOME:-${JAVA_HOME:-}}"
if ! qweeps_valid_java "$qweeps_java"; then
  if [[ -n "${QWEEPS_JAVA_HOME:-}" ]]; then
    echo 'QWEEPS_JAVA_HOME must point to JDK 17 or 21.' >&2
    exit 1
  fi
  if command -v mise >/dev/null; then
    qweeps_java="$(mise where java@temurin-21 2>/dev/null || true)"
  fi
  if ! qweeps_valid_java "$qweeps_java"; then
    echo 'Set QWEEPS_JAVA_HOME to JDK 17 or 21 for the Android build.' >&2
    exit 1
  fi
fi
export JAVA_HOME="$qweeps_java"

if [[ -z "${QWEEPS_BUILD_PYTHON:-}" ]]; then
  QWEEPS_BUILD_PYTHON="$(command -v python3.11 || true)"
  if [[ -z "$QWEEPS_BUILD_PYTHON" ]] && command -v uv >/dev/null; then
    QWEEPS_BUILD_PYTHON="$(uv python find 3.11 2>/dev/null || true)"
  fi
fi
if [[ -z "${QWEEPS_BUILD_PYTHON:-}" ]] || ! "$QWEEPS_BUILD_PYTHON" -c 'import sys; raise SystemExit(sys.version_info[:2] != (3, 11))'; then
  echo 'Set QWEEPS_BUILD_PYTHON to a Python 3.11 interpreter.' >&2
  exit 1
fi
export QWEEPS_BUILD_PYTHON

if [[ "${1:-}" == '--check' ]]; then
  printf 'SDK: %s\nJDK: %s\nPython: %s\n' "$ANDROID_HOME" "$JAVA_HOME" "$QWEEPS_BUILD_PYTHON"
  exit 0
fi
cd "$qweeps_root"
npm run build
cd android
./gradlew --no-daemon :app:assembleDebug
printf '\nAPK: %s/android/app/build/outputs/apk/debug/app-debug.apk\n' "$qweeps_root"
