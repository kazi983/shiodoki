# 30min Task Timer v2（デスクトップ版）

Electron ＋ TypeScript ＋ React で作り直したデスクトップアプリです。
要件は [`../docs/requirements.md`](../docs/requirements.md) を参照してください。

> **現在の状態（P3）**: Google でログインし、タスクを Firebase（Cloud Firestore）に保存します。オフラインでも使え、オンラインに戻ると自動で同期します。

## 必要なもの

- Node.js 22 以上
- Ubuntu の場合、トレイアイコンの表示には GNOME 拡張機能「AppIndicator and KStatusNotifierItem Support」が必要です（なくてもアプリは動きます）。
- v1 のような `python3-tk` や日本語フォントのインストールは不要です（フォント「Noto Sans JP」をアプリに同梱しています）。

## 初回の準備：Google ログインの設定（1回だけ）

デスクトップアプリは、システムのブラウザで Google にログインします（Electron の画面内でのログインは Google が禁止しているため）。
そのための「OAuth クライアント」を Google Cloud コンソールで作ります。

1. [Google Cloud コンソール](https://console.cloud.google.com/) を開き、上部のプロジェクト選択で **min-task-timer** を選ぶ（Firebase プロジェクトと同じもの）。
2. 「API とサービス」→「認証情報」→「認証情報を作成」→「OAuth クライアント ID」。
   - 「OAuth 同意画面を構成してください」と出た場合は、先に同意画面を作る（ユーザーの種類は「外部」、アプリ名とメールアドレスだけ入力すればよい。テストユーザーに自分の Gmail を追加する）。
3. アプリケーションの種類で **「デスクトップ アプリ」** を選び、名前は例として `desktop` で作成。
4. 作成後のダイアログで **「JSON をダウンロード」** を押す。
5. ダウンロードしたファイルを **`v2/desktop/resources/oauth-client.json`** という名前で保存する。
   - このファイルは `.gitignore` 済みで、コミットされません。チャットなどに貼る必要もありません。

あわせて、`v2/firebase/README.md` の手順でセキュリティルールを反映（`npm run deploy:rules`）しておいてください。

## 起動

```bash
cd v2/desktop
npm install
npm run dev         # 開発モード（コードを保存すると画面が自動で再読み込みされる）
npm run dev:test    # テストモード（30分 → 5秒、スヌーズ 5分 → 10秒）
npm run dev:local   # Firebase を使わず、PC 内の JSON ファイルだけで動かす
```

初回はログイン画面が出ます。「Google でログイン」を押すとブラウザが開くので、ログインしてアプリに戻ってください。
この PC にタスク（v1 の `tasks.json`、またはローカルモードのデータ）があり、Firebase 側が空なら、コピーするか確認されます。
2回目以降はログイン状態が保たれ、オフラインでもそのまま起動できます。

## 使い方（v1 との違い）

| 操作 | 内容 |
|------|------|
| タスク選択画面の Esc / ウィンドウを閉じる | 5分後にもう一度表示（v1 ではウィンドウを閉じると二度と出てこなかった） |
| Enter / ダブルクリック | 選択中のタスクをはじめる |
| Backspace | 選択中のタスクを完了にする |
| 退勤時刻 | `2330`、`930`、`9` のように数字だけでも入力できる。過ぎた時刻は翌日として扱う（例：22時に `0100` → 翌日 1:00） |
| 右端の ▶ | マウスを乗せると「完了 ▶」。クリックでセッションを完了し、次のタスクを選ぶ |
| タスク管理画面 | メモの保存、完了済みタスクの「未完了に戻す」、完了済みの表示切り替えに対応 |
| トレイメニュー | 「タスクを選ぶ」「タスク管理」「再起動」「ログアウト」「終了」 |
| 同期状態 | 画面の左上（タスク管理画面は右上）に「☁ 同期済み」「⏳ 送信待ち」「⚠ オフライン」を表示 |
| 作業終了（退勤）画面 | 閉じられない。トレイがない環境でも終われるよう「アプリを終了」ボタンあり |
| 二重起動 | 2つ目を起動すると、起動中のアプリが「前面に表示 / 再起動」を確認する |

## データの保存場所

| モード | 保存先 |
|--------|--------|
| 通常（Firebase） | Cloud Firestore の `users/{uid}/...`。PC 内にもキャッシュ（オフライン用）を持つ |
| ローカル（`TIMER_LOCAL=1`） | Ubuntu: `~/.config/30min-task-timer-v2/store.json`、Windows: `%APPDATA%\30min-task-timer-v2\store.json` |

テストモード（`TASK_MODE=test`）は v1 と同じく、時間を短縮するだけです。Firebase のデータは本番と同じアカウントに入るので、試すときは `npm run dev:local` も使ってください。

**PC が Firebase に書き込む内容**
- タスクの追加・編集・完了・削除（変更した項目だけを送信）
- 作業セッションの記録（`sessions`）と、タスクの累計時間の加算
- PC の今の状況（`state/desktop`）：選択画面を表示中 / 作業中（タスク名・開始時刻・次に選択画面が出る時刻）/ スヌーズ中 / 退勤で停止中 / 終了。起動中は 5 分ごとに更新し、Android はこれが古いと「PC オフライン」と判断します。

**v1 からの移行**: 初回ログイン時に確認されます。v1 の `tasks.json` は変更しないので、v1 と並行して使えます（ただしデータは別々になります）。

## テスト

Firebase を使うテストは Firebase Emulator（PC 上で動く Firebase の模擬環境）で行い、本番のデータには触れません。
Emulator には Java 21 以上と、`v2/firebase` での `npm install` が必要です。

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
npm run dist:linux   # dist/ に AppImage と .deb を作成
npm run dist:win     # dist/ に Windows インストーラーを作成（Windows 上で実行）
```

## Ubuntu（Wayland）について

Wayland ではアプリがウィンドウを常に最前面にしたり、決まった位置に置いたりできません。
そのため Linux では X11 互換モード（XWayland）で起動します（v1 の Tk と同じ動き）。
Wayland のまま動かしたい場合は `TIMER_ALLOW_WAYLAND=1` を付けて起動してください。

## 構成

```
src/
├─ shared/     main と画面の両方で使う型・ロジック（タスク、優先度、退勤時刻の計算、v1 データの変換）
├─ main/       メインプロセス
│  ├─ appController.ts        セッションの流れ全体（開始・30分経過・スヌーズ・退勤・終了）
│  ├─ taskService.ts          タスクの追加・編集・完了・削除
│  ├─ taskRepository.ts       保存処理のインターフェースと JSON ファイル版（ローカルモード）
│  ├─ firestoreTaskRepository.ts  Firestore 版（データ用ウィンドウ経由。読み込みはメモリ上のコピーから）
│  ├─ dataBridge.ts           Firebase を動かす見えないウィンドウとのやり取り
│  ├─ googleOAuth.ts          システムのブラウザでの Google ログイン（ループバック + PKCE）
│  ├─ desktopStateReporter.ts PC の状況の書き込みと 5 分ごとの更新
│  ├─ localMigration.ts       初回ログイン時のタスク移行
│  ├─ sessionService.ts       実行中セッション
│  ├─ leaveScheduleService.ts 退勤スケジュール
│  ├─ timerService.ts         取り消し可能なタイマー
│  ├─ windowManager.ts        ウィンドウの作成と配置
│  ├─ tray.ts / ipc.ts / index.ts
├─ preload/    画面に公開する API（window.api）
└─ renderer/
   ├─ src/     React の画面（ログイン・タスク選択・タスク管理・オーバーレイ・退勤）
   └─ data/    見えないウィンドウで動く Firebase 処理（Firestore のオフライン保存には IndexedDB が必要なため）
```

## うまくいかないとき

| 症状 | 対処 |
|------|------|
| 「Google ログインの設定ファイルがありません」 | 上の「初回の準備」で `resources/oauth-client.json` を置く |
| ブラウザで「このアプリはブロックされています」「アクセスをブロック」 | OAuth 同意画面のテストユーザーに自分の Gmail を追加する |
| ログイン後に `invalid_idp_response` や audience に関するエラー | Firebase コンソール →「Authentication」→「Sign-in method」→「Google」→「外部プロジェクトからのクライアント ID をホワイトリストに登録」に、`oauth-client.json` の `client_id` を追加する |
| 書き込みが反映されない（ターミナルに `permission-denied`） | `v2/firebase` で `npm run deploy:rules` を実行してルールを反映する |
