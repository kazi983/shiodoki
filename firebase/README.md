# Firebase 設定（v2）

Cloud Firestore のセキュリティルール、インデックス、Emulator の設定です。
データ構造とルールの方針は [`../docs/requirements.md`](../docs/requirements.md) の §5 を参照してください。

| ファイル                 | 内容                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `firestore.rules`        | セキュリティルール（自分の `users/{uid}` 配下のみ読み書き可、項目の型・優先度の値をチェック） |
| `firestore.indexes.json` | 複合インデックス（現時点では不要なので空）                                                    |
| `firebase.json`          | Firebase CLI と Emulator の設定                                                               |
| `tests/`                 | ルールとバックアップのテスト（Emulator 上で実行）                                             |
| `scripts/backup.mjs`     | 1 人分のデータを本番から読み出して保存する（読み取りだけ）                                    |

## ルールのテストを動かす

Node.js 22 以上と Java 21 以上が必要です（Firestore Emulator が Java で動くため）。shell の `java` が古くても、npm scripts（`scripts/firebase.mjs`）が `/usr/lib/jvm` と Android Studio の JDK から 21 以上を探して使います。別の JDK を使うときは `FIREBASE_JAVA_HOME` を指定します。

```bash
cd firebase
npm install
npm test
```

`npm test` は Firestore Emulator を起動してテストを実行し、終わると Emulator を停止します。
プロジェクト ID は `demo-shiodoki`（`demo-` で始まる ID は本物の Firebase プロジェクトにつながらない Emulator 専用 ID）を使うので、Firebase へのログインは不要です。

## クラウドのデータをバックアップする

`scripts/backup.mjs` は、1 人分のデータ（タスク・セッション・`state`）を本番の Firestore から読み出して、新しいフォルダに
2 つのファイルとして保存します。Firestore には書き込みません。

| ファイル     | 内容                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `store.json` | デスクトップのローカルモードの形式（タスク名などは平文）。この PC のデータとして置いてログインすると、初回のコピーで暗号化してアップロードされる |
| `raw.json`   | すべてのドキュメントを保存されたまま（暗号文は暗号文のまま）。念のための控え                                                                     |

どちらも平文の個人データなので、リポジトリの外に保存されます（フォルダは本人だけ読める権限で作ります）。

認証はサービスアカウントの鍵を使わず、自分の Google アカウントのアプリケーションのデフォルト認証情報（ADC）を使います。
Admin SDK はセキュリティルールを通らないので、プロジェクトのオーナーのアカウントで認証してください。

```bash
# 初回のみ：gcloud を入れる（Ubuntu）
sudo snap install google-cloud-cli --classic

# ブラウザで Google アカウントを選ぶ
gcloud auth application-default login
gcloud auth application-default set-quota-project shiodoki-e4e8f

cd firebase
npm install
npm run backup -- --email you@gmail.com --out ~/shiodoki-backup-2026-10-29
```

- 暗号化したデータ（`e1:` で始まる値）があると、パスフレーズを聞かれます（画面には出ません）。環境変数 `SHIODOKI_PASSPHRASE` でも渡せます。
- 結果には件数だけを表示し、タスク名は表示しません。
- 移行が終わったら、ADC は不要なので取り消してください：`gcloud auth application-default revoke`

## Firebase プロジェクトの作成（初回のみ・手作業）

以下は [Firebase コンソール](https://console.firebase.google.com/) で行います。

1. **プロジェクトを作成**
   - 「プロジェクトを追加」→ 名前は例として `shiodoki`（プロジェクト ID は `shiodoki-e4e8f` のように自動で末尾が付く）。
   - Google アナリティクスは不要なのでオフにしてよい。
   - 料金プランは **Spark（無料）のまま** にする。課金アカウントは登録しない（登録しなければ無料枠を超えても請求されない）。
2. **Google ログインを有効化**
   - 「Authentication」→「始める」→「Sign-in method」→「Google」を有効にする。
   - サポートメールに自分のアドレスを設定して保存。
3. **Firestore を作成**
   - 「Firestore Database」→「データベースの作成」。
   - ロケーションは **後から変更できない** ので、普段いる地域に近いものを選ぶ（例：日本なら `asia-northeast1`（東京））。
   - 「本番環境モード」で作成する（ルールは次の手順で上書きする）。
4. **Web アプリを登録（デスクトップ版で使う）**
   - 「プロジェクトの設定」→「マイアプリ」→ Web アイコン `</>` → ニックネーム `desktop` で登録。
   - 表示される `firebaseConfig`（`apiKey`、`projectId` など）は、P3 でデスクトップアプリの設定に使うので控えておく。
   - この値はアプリに埋め込む前提の公開情報で、秘密ではない。データはセキュリティルールで守る。
5. **Android アプリの登録**：手順は [android/README.md](../android/README.md) の「Firebase への登録」を参照。署名証明書の SHA-1 の登録が必要。

## ルールを本番に反映する

プロジェクト `shiodoki-e4e8f` は `.firebaserc` に設定済みです。自分の PC で実行します（ブラウザで Google ログインが開きます）。

```bash
cd firebase
npm install
npx firebase login
npm run deploy:rules
```

ルールを変更したときも、同じ `npm run deploy:rules` で反映します。
