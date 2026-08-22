# Deal Recon Android

Native Android wrapper for the Deal Recon real estate investment analyzer.

## Fastest Linux / Chromebook VM build
Open a terminal in this folder and run:

```bash
./build-apk.sh
```

The script downloads the Android SDK and Gradle, builds the app, and places the install file here:

`Deal-Recon-v1.apk`

## Android Studio build
1. Open this folder in Android Studio.
2. Allow Gradle sync to finish.
3. Choose Build > Build Bundle(s) / APK(s) > Build APK(s).
4. The debug APK is generated under `app/build/outputs/apk/debug/app-debug.apk`.

Package: `com.kenleposa.dealrecon`
Version: 1.0.0
Minimum Android: Android 8.0 (API 26)
Target SDK: Android API 35

The calculator is bundled locally and does not require an internet connection after installation. Saved deals and deal criteria are stored locally on the device.
