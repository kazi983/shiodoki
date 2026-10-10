# 多言語対応（日本語・英語）実装計画

- ステータス: 確定（2026-10-09）
- 関連: `docs/requirements.md` §3.5、`docs/i18n/glossary.md`

## 1. 決定事項

| 項目 | 決定 |
|------|------|
| 対応言語 | 日本語（`ja`）、英語（`en`） |
| 言語の決め方 | 既定は OS の言語に従う。アプリ内の設定で `OS の設定に従う` / `日本語` / `English` を選べる |
| fallback | 英語（OS の言語が日本語以外なら英語） |
| 着手順 | デスクトップ → Android |
| 言語設定の保存先 | 端末ごと（Firestore で同期しない） |
| 開発者向けの文 | 辞書に入れず、英語の文に書き換える（どちらの言語でも英語で出る）。分け方は用語集 §5 |
| 表記の変更（言語に関係なく） | 日本語の「作業終了」を「離席」に揃える（用語集 §6）。累計時間はゼロ埋めをやめて `2h 5m` にする（両アプリ） |
| 日付 | 英語版は `Oct 9`、日本語版は `10-09` のまま |

Firestore には表示文言を保存していない（優先度はキー、`state/desktop` は enum）。そのためデータモデル（§5）とセキュリティルールは変えない。

## 2. デスクトップの設計

### 2.1 辞書
- 外部ライブラリ（i18next など）は使わない。`src/shared/i18n/ja.ts` を基準にし、`en.ts` は `Messages` 型（`ja` から導出）で型付けする。キーの欠けや余りは `npm run typecheck` で検出できる。
- 値は文字列か関数。複数形や埋め込みは関数で書く。
  ```ts
  sessionCount: (n: number) => (n === 1 ? "1 session" : `${n} sessions`),
  ```
- `setLocale(locale)` / `t()` を `shared/i18n` に置く。main、UI の renderer、data window の各プロセスが、起動時に一度だけ `setLocale` を呼ぶ。

### 2.2 言語の決め方
1. `userData/settings.json` の `language`（`system` | `ja` | `en`）を読む。なければ `system`。
2. `system` のときは `app.getLocale()` が `ja` で始まれば `ja`、それ以外は `en`。
3. 環境変数 `SHIODOKI_LOCALE` があれば最優先（テスト・動作確認用）。
- main が決めたロケールを preload 経由で renderer に渡す（`window.api.locale`）。`<html lang>` もこれで設定する。
- `settings.json` はタスクのデータ（`store.json`）とは別ファイルにする。ログアウト時に PC 内のデータを削除しても、言語設定は残すため。

### 2.3 アプリ内の言語設定
- トレイメニューに `言語 / Language` サブメニューを追加し、`OS の設定に従う` / `日本語` / `English` をラジオボタンで出す。
- 変更したら保存して、アプリを再起動して反映する。再起動は既存の「再起動」と同じ処理を使う。実行中のセッションは `finishSession()` を通るので記録が失われない。
- その場で切り替える（トレイ・全ウィンドウ・main のメッセージを作り直す）方式は、言語変更の頻度に対して複雑すぎるため採らない。

### 2.4 エラーメッセージ
- Electron の IPC で Error を送ると `message` しか残らない。そこで throw する側のプロセスで `t()` を使い、翻訳済みの文を入れる（例: `throw new Error(t().errors.taskNotFound)`）。

## 3. Android の設計（デスクトップの完了後に詳細化）

- `values/strings.xml` に英語（default かつ fallback）、`values-ja/strings.xml` に日本語を置く。
- `generateLocaleConfig = true` と `res/resources.properties`（`unqualifiedResLocale=en`）を設定し、Android 13 以降の OS の設定画面にアプリごとの言語選択（per-app language）を出す。
- アプリ内の設定画面に「言語」行を追加する。API 33 以降は `LocaleManager.setApplicationLocales` を使う。minSdk 29〜32 への対応（AppCompat の導入、または OS の言語に従うだけにする）は Android の着手時に決める。
- `Priority` / `SyncStatus` などの enum は `@StringRes` を持つ。ViewModel のエラーは `UiText` として UI state に載せ、Composable で解決する。`Task.kt` の `require { "…" }` は、enum でバリデーション結果を返す形にする。

## 4. 作業の分け方（PR 単位）

| # | ブランチ | 内容 | 動作の変化 |
|---|---------|------|-----------|
| 0 | `docs/i18n-plan` | 本計画、用語集、requirements §3.5 | なし |
| 1 | `refactor/desktop-i18n-extract` | `shared/i18n` の仕組み（`ja` のみ）を作り、日本語文言（約 180 か所）を `t()` に置き換える。ロケールを preload で渡す経路と `<html lang>` を整える。テストのロケールを `ja` に固定 | なし |
| 1.5 | `fix/desktop-leave-wording` | `ja.ts` の「作業終了」を「離席」に揃え、`formatDuration` のゼロ埋めをやめる。使われていない `formatMinutes` を削除。requirements §7.1 と desktop/README.md の画面名を更新。E2E と unit test の期待値も合わせる | 日本語の文言と累計時間の表記が変わる |
| 2 | `feat/desktop-i18n-en` | `en.ts` の追加、英語向けの UI 調整（用語集 §5）、`i18n/` 以外に日本語の literal が残っていないかの検査テスト、E2E の英語 smoke を 1 本 | OS が日本語以外なら英語で表示 |
| 3 | `feat/desktop-language-setting` | `settings.json`、トレイの言語サブメニュー、再起動で反映 | アプリ内で言語を選べる |
| 4 | `refactor/android-i18n-extract` | 日本語文言（約 120 か所）を `values/strings.xml` に移す。`@StringRes` 化、`UiText` の導入 | なし |
| 4.5 | `fix/android-duration-format` | `formatMinutes` のゼロ埋めをやめる（`2h 5m`） | 累計時間の表記が変わる |
| 5 | `feat/android-i18n-en` | `values-ja/` へ移動（`git mv`）、英語版の `values/`、`generateLocaleConfig` | per-app language |
| 6 | `feat/android-language-setting` | 設定画面の「言語」行 | アプリ内で言語を選べる |

## 5. テスト方針
- 既存の unit test と E2E は、ロケールを `ja` に固定してそのまま通す。PR 1・4 では文言の assert を書き換えない。これが「動作が変わっていない」ことの確認になる。
- 英語版は、`en.ts` の関数（複数形、時間表記）の unit test と、E2E の smoke 1 本で確認する。
- Android は lint の `MissingTranslation` を error 扱いにし、`values` と `values-ja` のキーのずれを検出する。
