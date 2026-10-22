# Shiodoki Android

Kotlin + Jetpack Compose. Design: [docs/android/design.md](../docs/android/design.md).

## Release vs debug

Two separate apps. You can install both on one phone.

|             | Release (daily use)          | Debug (development)                         |
| ----------- | ---------------------------- | ------------------------------------------- |
| Package     | `dev.kaorukajihara.shiodoki` | `dev.kaorukajihara.shiodoki.debug`          |
| App name    | Shiodoki                     | Shiodoki (debug), orange icon               |
| Timer       | Real (30 min)                | Test mode (30 s)                            |
| Firebase    | Real project                 | Real project, or local emulators (optional) |
| Signed with | Your release key             | The SDK debug key                           |

Both use the same Firestore data when signed in with the same account.

## Setup (once)

```bash
export JAVA_HOME=/snap/android-studio/current/jbr
export PATH="$HOME/Android/Sdk/platform-tools:$HOME/Android/Sdk/emulator:$PATH"
```

- `android/local.properties`: `sdk.dir=/home/<user>/Android/Sdk` (do not commit).
- Firebase: both packages are registered in project `shiodoki-e4e8f`, each with the SHA-1 of its signing key.
  Google sign-in fails without it. After adding a SHA-1, download `app/google-services.json` again and commit it
  (it is public).
- Release only: create a signing key and `android/keystore.properties` (never commit; back up the key, or you can
  never update the installed app):

  ```bash
  keytool -genkeypair -v -keystore ~/keys/shiodoki-release.jks -alias shiodoki -keyalg RSA -keysize 2048 -validity 10000
  keytool -list -v -keystore ~/keys/shiodoki-release.jks -alias shiodoki | grep SHA1   # register in Firebase
  ```

  ```properties
  storeFile=/home/<user>/keys/shiodoki-release.jks
  storePassword=<password>
  keyAlias=shiodoki
  keyPassword=<password>
  ```

## Connect a phone

1. On the phone: Developer options → USB debugging or Wireless debugging.
2. Wireless only, once: `adb pair <IP>:<port> <code>` (from "Pair device with pairing code").
3. `adb devices -l` shows the serial for `adb -s <serial>`. One phone may appear twice over Wi-Fi; pick either.

## Install the release build

1. Bump `versionCode` (+1) and `versionName` in `app/build.gradle.kts`, and merge to `main`.
2. Build from a clean `main` and install:

   ```bash
   git checkout main && git pull origin main
   cd android
   ./gradlew testDebugUnitTest assembleRelease \
     && adb -s <serial> install -r app/build/outputs/apk/release/app-release.apk
   ```

3. Check that it works, then tag it: `git tag android-v<versionName> origin/main && git push origin android-v<versionName>`.

## Install the debug build

```bash
cd android
./gradlew assembleDebug testDebugUnitTest \
  && adb -s <serial> install -r -g app/build/outputs/apk/debug/app-debug.apk
```

`-r` keeps the app data. `-g` grants runtime permissions (needed for the Firebase emulators).

### With the Firebase emulators (Android Emulator only)

1. Add `shiodoki.useFirebaseEmulator=true` to `local.properties`, then rebuild.
2. Start them: `cd firebase && npx firebase emulators:start --only auth,firestore --project shiodoki-e4e8f`.
3. Start an Android Emulator (`emulator -avd <name>`) and install with the command above.

The app connects to `10.0.2.2`, which only works from the Android Emulator, so turn this off for a real phone.
It signs in as the fake account `e2e@example.com`.

## Troubleshooting

- `INSTALL_FAILED_UPDATE_INCOMPATIBLE`: the installed app has a different signature. Sync, then uninstall it.
- `INSTALL_FAILED_VERSION_DOWNGRADE`: bump `versionCode`.
- Only Google sign-in fails: the SHA-1 is missing in Firebase, or `google-services.json` is old.
- `does not provide the required capabilities: [JAVA_COMPILER]`: set `JAVA_HOME` as in Setup.
