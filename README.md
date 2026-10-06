# Shiodoki

30分ごとに「今から何をやる？」と作業タスクを選ばせ、タスクごとの作業時間を記録するデスクトップアプリです。
次の予定のために席を立つ時刻（離席時刻）を入れておくと、その少し前に警告し、作業を止めます。
名前は「潮時」（物事を切り替えるのにちょうどよい時）から付けました。
タスクは Firebase（Cloud Firestore）に保存し、スマートフォン（Android アプリ、開発予定）からも確認・編集できるようにします。

Python / Tkinter 版（v1）は [kazi983/30min-task-timer-python](https://github.com/kazi983/30min-task-timer-python) にあります。このリポジトリはその作り直し（v2）です。

## 構成

| フォルダ | 内容 |
|----------|------|
| [`docs/`](docs/requirements.md) | 要件定義書 |
| [`desktop/`](desktop/README.md) | デスクトップアプリ（Electron + TypeScript + React、Ubuntu / Windows） |
| [`firebase/`](firebase/README.md) | Firestore のセキュリティルール、Emulator の設定とテスト |
| `android/` | Android アプリ（Kotlin + Jetpack Compose、開発予定） |

## 進み具合

| フェーズ | 内容 | 状態 |
|---------|------|------|
| P0 | 要件定義 | 完了 |
| P1 | Firebase の準備（ルール・Emulator） | 完了（本番へのルール反映は手作業） |
| P2 | デスクトップ版の作り直し（ローカル保存） | 完了 |
| P3 | Google ログインと Firestore 同期 | 実装済み・本番での動作確認待ち |
| P4 | Android アプリ | 未着手 |

## はじめかた

1. [`firebase/README.md`](firebase/README.md) の手順で、セキュリティルールを Firebase に反映する。
2. [`desktop/README.md`](desktop/README.md) の「初回の準備」で、Google ログインの設定ファイルを置く。
3. デスクトップアプリを起動する。

```bash
cd desktop
npm install
npm run dev
```
