#!/bin/bash
# Quick deploy to Seeker device
# Usage: ./scripts/deploy-seeker.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
SDK_DIR="$APP_DIR/../estream-io/packages/mobile-sdk/react-native"

echo "🔧 Rebuilding SDK..."
cd "$SDK_DIR"
npm run build

echo "📦 Bundling JavaScript..."
cd "$APP_DIR"
npx react-native bundle \
  --platform android \
  --dev false \
  --entry-file index.js \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --assets-dest android/app/src/main/res/

echo "🏗️  Building APK..."
cd "$APP_DIR/android"
./gradlew assembleDebug -q

echo "📱 Installing on device..."
adb install -r "$APP_DIR/android/app/build/outputs/apk/debug/app-debug.apk"

echo "🚀 Launching app..."
adb shell monkey -p io.estream.app -c android.intent.category.LAUNCHER 1

echo "✅ Done! App deployed and running."
