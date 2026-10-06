# 30min Task Timer v2（デスクトップ版）

Electron ＋ TypeScript ＋ React で作り直したデスクトップアプリです。
要件は [`../docs/requirements.md`](../docs/requirements.md) を参照してください。

> **現在の状態（P2）**: データは PC 内の JSON ファイルにだけ保存します。Firebase との連携は P3 で追加します。

## 必要なもの

- Node.js 22 以上
- Ubuntu の場合、トレイアイコンの表示には GNOME 拡張機能「AppIndicator and KStatusNotifierItem Support」が必要です（なくてもアプリは動きます）。
- v1 のような `python3-tk` や日本語フォントのインストールは不要です（フォント「Noto Sans JP」をアプリに同梱しています）。

## 起動

```bash
cd v2/desktop
npm install
npm run dev        # 開発モード（コードを保存すると画面が自動で再読み込みされる）
npm run dev:test   # テストモード（30分 → 5秒、スヌーズ 5分 → 10秒、別のデータファイル）
```

## 使い方（v1 との違い）

| 操作 | 内容 |
|------|------|
| タスク選択画面の Esc / ウィンドウを閉じる | 5分後にもう一度表示（v1 ではウィンドウを閉じると二度と出てこなかった） |
| Enter / ダブルクリック | 選択中のタスクをはじめる |
| Backspace | 選択中のタスクを完了にする |
| 退勤時刻 | `2330`、`930`、`9` のように数字だけでも入力できる。過ぎた時刻は翌日として扱う（例：22時に `0100` → 翌日 1:00） |
| 右端の ▶ | マウスを乗せると「完了 ▶」。クリックでセッションを完了し、次のタスクを選ぶ |
| タスク管理画面 | メモの保存、完了済みタスクの「未完了に戻す」、完了済みの表示切り替えに対応 |
| トレイメニュー | 「タスクを選ぶ」「タスク管理」「再起動」「終了」 |
| 作業終了（退勤）画面 | 閉じられない。トレイがない環境でも終われるよう「アプリを終了」ボタンあり |
| 二重起動 | 2つ目を起動すると、起動中のアプリが「前面に表示 / 再起動」を確認する |

## データの保存場所

| OS | 場所 |
|----|------|
| Ubuntu | `~/.config/30min-task-timer-v2/store.json`（`XDG_CONFIG_HOME` があればその下） |
| Windows | `%APPDATA%\30min-task-timer-v2\store.json` |

テストモードでは `store_test.json` を使います。

**v1 からの移行**: `store.json` がまだない状態で起動すると、v1 の `tasks.json`（Ubuntu: `~/.30min-task-timer/tasks.json`、Windows: `%APPDATA%\30min-task-timer\tasks.json`）を読み込みます。v1 のファイルは変更しないので、v1 と並行して使えます（ただしデータは別々になります）。

## テスト

```bash
npm run typecheck   # 型チェック
npm test            # ユニットテスト（セッションの流れ、退勤スケジュール、保存処理など）
npm run e2e         # 実際にアプリを起動して操作するテスト（画面のスクリーンショットを e2e/screenshots/ に保存）
npm run e2e:headless  # 画面のない Linux 環境用（xvfb が必要）
```

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
│  ├─ taskRepository.ts       保存処理（P2: JSON ファイル。P3 で Firestore に置き換え）
│  ├─ sessionService.ts       実行中セッション
│  ├─ leaveScheduleService.ts 退勤スケジュール
│  ├─ timerService.ts         取り消し可能なタイマー
│  ├─ windowManager.ts        ウィンドウの作成と配置
│  ├─ tray.ts / ipc.ts / index.ts
├─ preload/    画面に公開する API（window.api）
└─ renderer/   React の画面（タスク選択・タスク管理・オーバーレイ・退勤）
```
