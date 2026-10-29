# Shiodoki（デスクトップ版）

Electron ＋ TypeScript ＋ React で作り直したデスクトップアプリです。
要件は [`../docs/requirements.md`](../docs/requirements.md) を参照してください。

> Google でログインし、タスクを Firebase（Cloud Firestore）に保存します。オフラインでも使え、オンラインに戻ると自動で同期します。

## 必要なもの

- Node.js 22 以上
- Ubuntu の場合、トレイアイコンの表示には GNOME 拡張機能「AppIndicator and KStatusNotifierItem Support」が必要です（なくてもアプリは動きます）。
- v1 のような `python3-tk` や日本語フォントのインストールは不要です（フォント「Noto Sans JP」をアプリに同梱しています）。

## 初回の準備：Google ログインの設定（1回だけ）

デスクトップアプリは、システムのブラウザで Google にログインします（Electron の画面内でのログインは Google が禁止しているため）。
そのための「OAuth クライアント」を Google Cloud コンソールで作ります。

1. [Google Cloud コンソール](https://console.cloud.google.com/) を開き、上部のプロジェクト選択で **shiodoki-e4e8f** を選ぶ（Firebase プロジェクトと同じもの）。
2. 「API とサービス」→「認証情報」→「認証情報を作成」→「OAuth クライアント ID」。
   - 「OAuth 同意画面を構成してください」と出た場合は、先に同意画面を作る（ユーザーの種類は「外部」、アプリ名とメールアドレスだけ入力すればよい。テストユーザーに自分の Gmail を追加する）。
3. アプリケーションの種類で **「デスクトップ アプリ」** を選び、名前は例として `desktop` で作成。
4. 作成後のダイアログで **「JSON をダウンロード」** を押す。
5. ダウンロードしたファイルを **`desktop/resources/oauth-client.json`** という名前で保存する。
   - このファイルは `.gitignore` 済みで、コミットされません。チャットなどに貼る必要もありません。

あわせて、`firebase/README.md` の手順でセキュリティルールを反映（`npm run deploy:rules`）しておいてください。

### Ubuntu 24.04 以降のみ：サンドボックスの許可（1回だけ）

Ubuntu 24.04 以降では、AppArmor の制限により開発用の Electron がそのままでは起動せず、
`The SUID sandbox helper binary was found, but is not configured correctly` で止まります。
`npm install` のあとに一度だけ次を実行してください（`sudo` のパスワードを聞かれます）。

```bash
cd desktop
npm run setup:linux-sandbox
```

このプロジェクトの Electron だけに、サンドボックスの作成を許可する AppArmor の設定（`/etc/apparmor.d/electron-shiodoki-dev`）を追加します。
プロジェクトのフォルダを移動した場合は、もう一度実行してください。不要になったら `sudo rm /etc/apparmor.d/electron-shiodoki-dev` で削除できます。
`.deb` でインストールした配布版では不要です（インストール時に設定されます）。

## 起動

```bash
cd desktop
npm install
npm run dev         # 開発モード（コードを保存すると画面が自動で再読み込みされる）
npm run dev:test    # テストモード（30分 → 5秒、スヌーズ 5分 → 10秒）
npm run dev:local   # Firebase を使わず、PC 内の JSON ファイルだけで動かす
```

初回はログイン画面が出ます。「Google でログイン」を押すとブラウザが開くので、ログインしてアプリに戻ってください。
この PC にローカルモード（`npm run dev:local`）で作ったタスクがあり、Firebase 側が空なら、コピーするか確認されます。
2回目以降はログイン状態が保たれ、オフラインでもそのまま起動できます。

## 使い方（v1 との違い）

| 操作                                      | 内容                                                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| タスク選択画面の Esc / ウィンドウを閉じる | 5分後にもう一度表示（v1 ではウィンドウを閉じると二度と出てこなかった）                                                                |
| Enter / ダブルクリック                    | 選択中のタスクをはじめる（入力欄が空のときの Enter も同じ）。「前回の続き」カードのクリックでも開始                                   |
| Backspace                                 | 選択中のタスクを完了にする                                                                                                            |
| 離席時刻                                  | `2330`、`930`、`9` のように数字だけでも入力できる。過ぎた時刻は翌日として扱う（例：22時に `0100` → 翌日 1:00）                        |
| 右端のリング                              | 残り分数を表示（残り5分で橙色）。マウスを乗せるとタスク名と「完了して次を選ぶ」ボタン。クリックでセッションを完了し、次のタスクを選ぶ |
| タスク管理画面                            | 左の一覧で選んだタスクを右側で編集。メモの保存、検索、完了済みタスクの「未完了に戻す」、完了済みの表示切り替えに対応                  |
| 作業ストップ5分前の警告                   | カウントダウンと、実行中のタスクのメモ（次回の続き用）を保存する欄                                                                    |
| トレイメニュー                            | 「タスクを選ぶ」「タスク管理」「再起動」「ログアウト」「終了」                                                                        |
| 同期状態                                  | 画面の左上（タスク管理画面は右上）に「同期済み」「送信待ち」「オフライン」を色つきの点で表示                                          |
| 作業ストップ（ブロック）画面              | 今日（4:00 区切り）の作業時間とタスク別の時間を表示。閉じられない。トレイがない環境でも終われるよう「アプリを終了」ボタンあり         |
| 二重起動                                  | 2つ目を起動すると、起動中のアプリが「前面に表示 / 再起動」を確認する                                                                  |

## データの保存場所

| モード                      | 保存先                                                                            |
| --------------------------- | --------------------------------------------------------------------------------- |
| 通常（Firebase）            | Cloud Firestore の `users/{uid}/...`。PC 内にもキャッシュ（オフライン用）を持つ   |
| ローカル（`TIMER_LOCAL=1`） | Ubuntu: `~/.config/shiodoki/store.json`、Windows: `%APPDATA%\shiodoki\store.json` |

テストモード（`TASK_MODE=test`）は v1 と同じく、時間を短縮するだけです。Firebase のデータは本番と同じアカウントに入るので、試すときは `npm run dev:local` も使ってください。

表示言語は、トレイメニューの「言語 / Language」で「OS の設定に従う / 日本語 / English」から選べます（初期値は OS の設定に従う。OS が日本語なら日本語、それ以外は英語）。選んだ言語は再起動すると反映されます。設定は PC ごとに `~/.config/shiodoki/settings.json`（Windows: `%APPDATA%\shiodoki\settings.json`）に保存され、ログアウトしても消えません。開発・テスト用に、環境変数 `SHIODOKI_LOCALE=en`（または `ja`）で設定より優先して上書きできます（例: `SHIODOKI_LOCALE=en npm run dev:local`）。

**PC が Firebase に書き込む内容**

- タスクの追加・編集・完了・削除（変更した項目だけを送信）
- 作業セッションの記録（`sessions`）と、タスクの累計時間の加算
- PC の今の状況（`state/desktop`）：選択画面を表示中 / 作業中（タスク名・開始時刻・次に選択画面が出る時刻）/ スヌーズ中 / 離席のため停止中 / 終了。起動中は 5 分ごとに更新し、Android はこれが古いと「PC オフライン」と判断します。

**v1 のデータ**: v1 の `tasks.json` は読み込みません。v1 と v2 のデータは別々です。

## テスト

Firebase を使うテストは Firebase Emulator（PC 上で動く Firebase の模擬環境）で行い、本番のデータには触れません。
Emulator には Java 21 以上と、`firebase` での `npm install` が必要です。

```bash
npm run typecheck          # 型チェック
npm test                   # ユニットテスト（セッションの流れ、同期キャッシュ、Google ログインの処理など）
npm run test:integration   # Firestore への読み書きを、本番と同じセキュリティルールで確認
npm run e2e                # アプリを起動して操作するテスト（ローカルモード）
npm run e2e:firebase       # アプリを起動して操作するテスト（Firebase：ログイン、移行、スマホ側の変更の反映、PC の状況、再起動後のログイン維持）
npm run e2e:headless       # 上の 2 つを画面のない Linux 環境で実行（xvfb が必要）
```

スクリーンショットは `e2e/screenshots/` に保存されます。

## 配布用ファイルの作成

```bash
npm run dist:linux   # dist/ に .deb を作成
npm run dist:win     # dist/ に Windows インストーラーを作成（Windows 上で実行）
```

### GitHub Actions でのリリース

`v*` のタグを push すると、`.github/workflows/release-desktop.yml` が Ubuntu と Windows でビルドし、.deb と Windows インストーラーを付けた **下書き（draft）の GitHub Release** を作ります。中身を確認してから GitHub 上で「Publish release」を押すと公開されます。

1. 最初の 1 回だけ、`oauth-client.json` をリポジトリの secret に登録する：
   `gh secret set OAUTH_CLIENT_JSON < resources/oauth-client.json`
2. `package.json` の `version` を上げる PR を `main` に merge する（タグと `version` が違うとビルドは失敗する）。
3. `main` の merge commit にタグを付けて push する：
   `git tag v2.0.0-alpha.3 origin/main && git push origin v2.0.0-alpha.3`
4. 下書きの Release を確認する：`Shiodoki-Setup-<version>.exe`、`.exe.blockmap`、`latest.yml`、.deb が揃っていること。本文に変更点を書く（アプリの「変更点を見る」から開くページになる）。
5. 「Publish release」を押す。**この時点で、インストール済みの Windows 版に更新が届きます。**

### Windows 版の更新通知

Windows 版（インストールしたもの）は、起動時に GitHub Releases の最新版を確認します（`electron-updater`）。新しいバージョンがあれば、「更新する / 変更点を見る / あとで」を選ぶダイアログを出します。

- 「更新する」を選ぶまでダウンロードしません。ダウンロードが終わると「今すぐ再起動 / 終了するときに更新」を選べます。
- 「今すぐ再起動」は、計測中のセッションを記録してからインストーラーを動かし、新しいバージョンを起動します。
- 下書き（draft）の Release は見えないので、Publish するまで誰にも届きません。
- インストーラーに署名していないため、更新ファイルの確認は `latest.yml` の `sha512` だけです。これは「途中で壊れていないか」の確認で、「誰が作ったか」は保証しません。GitHub アカウントを守ること（2 段階認証）が前提です。
- Ubuntu（.deb）はこれまでどおり手で更新します。

- `-alpha.3` のように `-` を含むバージョンは pre-release になります。
- Windows インストーラーには署名していないので、初回は SmartScreen の「Windows によって PC が保護されました」が出ます（「詳細情報」→「実行」）。
- Android 版は release 用の署名鍵を GitHub に置かないため、手元でビルドします。
- macOS 版は作っていません（`mac` の target がなく、Apple の署名・公証なしでは Gatekeeper に止められるため）。

## Ubuntu（Wayland）について

Wayland ではアプリがウィンドウを常に最前面にしたり、決まった位置に置いたりできません。
そのため Linux では X11 互換モード（XWayland）で起動します（v1 の Tk と同じ動き）。
`npm run dev` などのスクリプトと、配布版のメニュー登録（.desktop）が `--ozone-platform=x11` を付けて Electron を起動します。
この指定はコマンドラインで渡す必要があります。アプリのコードの中から指定しても、Wayland 環境ではウィンドウが表示されなくなります。
Wayland のまま動かしたい場合は `npx electron-vite dev` を直接実行してください（常に最前面・位置指定は効きません）。

また、Linux では GPU を使わずに描画します（XWayland で GPU の処理がクラッシュしやすいため。画面が単純なので速度に影響はありません）。
GPU を使いたい場合は `TIMER_ENABLE_GPU=1` を付けて起動してください。

## 構成

```
src/
├─ shared/     main と画面の両方で使う型・ロジック（タスク、優先度、離席時刻の計算）
├─ main/       メインプロセス
│  ├─ appController.ts        セッションの流れ全体（開始・30分経過・スヌーズ・離席・終了）
│  ├─ taskService.ts          タスクの追加・編集・完了・削除
│  ├─ taskRepository.ts       保存処理のインターフェースと JSON ファイル版（ローカルモード）
│  ├─ firestoreTaskRepository.ts  Firestore 版（データ用ウィンドウ経由。読み込みはメモリ上のコピーから）
│  ├─ dataBridge.ts           Firebase を動かす見えないウィンドウとのやり取り
│  ├─ googleOAuth.ts          システムのブラウザでの Google ログイン（ループバック + PKCE）
│  ├─ desktopStateReporter.ts PC の状況の書き込みと 5 分ごとの更新
│  ├─ localMigration.ts       初回ログイン時のタスク移行
│  ├─ sessionService.ts       実行中セッション
│  ├─ leaveScheduleService.ts 離席スケジュール
│  ├─ timerService.ts         取り消し可能なタイマー
│  ├─ windowManager.ts        ウィンドウの作成と配置
│  ├─ tray.ts / ipc.ts / index.ts
├─ preload/    画面に公開する API（window.api）
└─ renderer/
   ├─ src/     React の画面（ログイン・タスク選択・タスク管理・オーバーレイ・離席）
   └─ data/    見えないウィンドウで動く Firebase 処理（Firestore のオフライン保存には IndexedDB が必要なため）
```

## うまくいかないとき

| 症状                                                                        | 対処                                                                                                                                                                                                                |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `The SUID sandbox helper binary was found, but is not configured correctly` | Ubuntu 24.04 以降の AppArmor の制限。上の「サンドボックスの許可」で `npm run setup:linux-sandbox` を実行する。`--no-sandbox` での起動はセキュリティが下がるので使わない                                             |
| `GPU process exited unexpectedly: exit_code=139` や `vaInitialize failed`   | GPU まわりのログ。Linux では GPU を使わない設定にしてあるので通常は出ない。`vaInitialize failed`（動画再生支援が使えない）は無視してよい                                                                            |
| `npm run dev` で `Error: Electron uninstall`                                | Electron 本体のダウンロードが済んでいない。`npm install` をもう一度実行する（`postinstall` でダウンロードされる）。それでも出る場合は `npx install-electron`                                                        |
| `npm install` で `vulnerabilities` の警告                                   | 開発用ツールの依存（Firestore の Node.js 用通信ライブラリ、electron-builder）に対する警告で、アプリ本体には含まれない。`npm audit fix --force` は依存のバージョンを大きく変えて動かなくなることがあるので実行しない |
| 「Google ログインの設定ファイルがありません」                               | 上の「初回の準備」で `resources/oauth-client.json` を置く                                                                                                                                                           |
| ブラウザで「このアプリはブロックされています」「アクセスをブロック」        | OAuth 同意画面のテストユーザーに自分の Gmail を追加する                                                                                                                                                             |
| ログイン後に `invalid_idp_response` や audience に関するエラー              | Firebase コンソール →「Authentication」→「Sign-in method」→「Google」→「外部プロジェクトからのクライアント ID をホワイトリストに登録」に、`oauth-client.json` の `client_id` を追加する                             |
| 書き込みが反映されない（ターミナルに `permission-denied`）                  | `firebase` で `npm run deploy:rules` を実行してルールを反映する                                                                                                                                                     |
