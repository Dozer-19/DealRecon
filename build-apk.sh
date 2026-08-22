#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SDK="$ROOT/.android-sdk"
TOOLS_ZIP="$ROOT/.commandlinetools.zip"
GRADLE_ZIP="$ROOT/.gradle.zip"
GRADLE_DIR="$ROOT/.gradle-dist"

export ANDROID_HOME="$SDK"
export ANDROID_SDK_ROOT="$SDK"

if ! command -v java >/dev/null 2>&1; then
  echo "Java is required. Install OpenJDK 17 or newer, then run this script again."
  exit 1
fi

mkdir -p "$SDK/cmdline-tools" "$GRADLE_DIR"

if [ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" ]; then
  echo "Downloading Android command-line tools..."
  wget -q --show-progress "https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip" -O "$TOOLS_ZIP"
  rm -rf "$SDK/cmdline-tools/latest" "$SDK/cmdline-tools/cmdline-tools"
  unzip -q "$TOOLS_ZIP" -d "$SDK/cmdline-tools"
  mv "$SDK/cmdline-tools/cmdline-tools" "$SDK/cmdline-tools/latest"
fi

export PATH="$SDK/cmdline-tools/latest/bin:$SDK/platform-tools:$PATH"

echo "Accepting Android SDK licenses..."
yes | sdkmanager --sdk_root="$SDK" --licenses >/dev/null || true

echo "Installing Android SDK 35 build tools..."
sdkmanager --sdk_root="$SDK" "platform-tools" "platforms;android-35" "build-tools;35.0.0"

if [ ! -x "$GRADLE_DIR/gradle-8.11.1/bin/gradle" ]; then
  echo "Downloading Gradle..."
  wget -q --show-progress "https://services.gradle.org/distributions/gradle-8.11.1-bin.zip" -O "$GRADLE_ZIP"
  unzip -q -o "$GRADLE_ZIP" -d "$GRADLE_DIR"
fi

cd "$ROOT"
echo "Building Deal Recon APK..."
"$GRADLE_DIR/gradle-8.11.1/bin/gradle" --no-daemon assembleDebug

APK="$ROOT/app/build/outputs/apk/debug/app-debug.apk"
if [ -f "$APK" ]; then
  cp "$APK" "$ROOT/Deal-Recon-v1.apk"
  echo
  echo "SUCCESS: $ROOT/Deal-Recon-v1.apk"
else
  echo "Build finished but APK was not found at expected path."
  exit 2
fi
