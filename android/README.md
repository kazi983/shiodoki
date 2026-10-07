# Shiodoki Android

Kotlin ＋ Jetpack Compose の Android アプリです。設計は [docs/android/design.md](../docs/android/design.md) を参照してください。

- パッケージ名（`applicationId`）：`dev.kaorukajihara.shiodoki`
- `minSdk` 29（Android 10）、`compileSdk` / `targetSdk` 37
- AGP 9.4.1、Gradle 9.6.0、Kotlin 2.4.20

## 準備

1. Android Studio（Android SDK 37 を含む）を入れる。コマンドラインでビルドするときは、Android Studio に同梱の JDK を使う。

   ```bash
   export JAVA_HOME=/snap/android-studio/current/jbr
   ```

2. `android/local.properties` に SDK の場所を書く（Android Studio で開くと自動で作られる。コミットしない）。

   ```properties
   sdk.dir=/home/<user>/Android/Sdk
   ```

3. `app/google-services.json` を置く（次の「Firebase への登録」を参照）。このファイルがないとビルドできない。

## Firebase への登録（最初の 1 回だけ）

1. [Firebase コンソール](https://console.firebase.google.com/) → プロジェクト `shiodoki-e4e8f` → 「プロジェクトの設定」→「マイアプリ」→ Android アイコン。
2. パッケージ名に `dev.kaorukajihara.shiodoki`、ニックネームに `android` を入れる。
3. **署名証明書の SHA-1** を登録する。Google ログインに必須。debug 用は次のコマンドで確認できる。

   ```bash
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android | grep SHA1
   ```

   release 用の鍵を作ったら、その SHA-1 も「フィンガープリントを追加」で登録する。
4. `google-services.json` をダウンロードして `android/app/` に置き、コミットする。中身はアプリに埋め込む前提の公開情報（デスクトップの `firebaseConfig.ts` と同じ）。
5. SHA-1 を後から追加したときは、`google-services.json` をダウンロードし直す。

## ビルドと実行

```bash
cd android
./gradlew assembleDebug          # app/build/outputs/apk/debug/app-debug.apk
./gradlew installDebug           # 接続中の端末にインストール
./gradlew testDebugUnitTest      # JVM のユニットテスト
```

## Firebase Emulator につなぐ（debug ビルドのみ）

本物の Firebase プロジェクトを使わずに、PC の Emulator で動かします。Google ログインの代わりに、デスクトップの E2E と同じ偽の Google アカウント（`e2e@example.com`）でログインします。

1. `android/local.properties` に次の行を足す。

   ```properties
   shiodoki.useFirebaseEmulator=true
   ```

2. PC で Emulator を起動する。

   ```bash
   cd firebase
   npm run emulators
   ```

3. Android Emulator にインストールする。**`-g` を付けて実行時の権限を許可しておく**。Android 17（API 37）以降では、`10.0.2.2`（Android Emulator から見たホスト PC）のようなローカルネットワークのアドレスに接続するのに `ACCESS_LOCAL_NETWORK` 権限が要るため。

   ```bash
   ./gradlew assembleDebug
   adb install -r -g app/build/outputs/apk/debug/app-debug.apk
   ```

注意：Android アプリは Emulator でも `google-services.json` のプロジェクト ID（`shiodoki-e4e8f`）を使います。`npm run emulators`（`demo-shiodoki`）でも警告付きで動きますが、Emulator のデータとユーザーはプロジェクト ID ごとに分かれるため、デスクトップの Emulator モードとはデータを共有しません。Android だけを確かめるときは、`npx firebase emulators:start --only auth,firestore --project shiodoki-e4e8f` で起動すると警告が出ません。

元に戻すときは、`local.properties` の行を消すか、値を `false` にしてビルドし直します。release ビルドは、この設定に関係なく常に本物のプロジェクトにつながります。
