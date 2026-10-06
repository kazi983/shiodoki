# Firebase 設定（v2）

Cloud Firestore のセキュリティルール、インデックス、Emulator の設定です。
データ構造とルールの方針は [`../docs/requirements.md`](../docs/requirements.md) の §5 を参照してください。

| ファイル | 内容 |
|----------|------|
| `firestore.rules` | セキュリティルール（自分の `users/{uid}` 配下のみ読み書き可、項目の型・優先度の値をチェック） |
| `firestore.indexes.json` | 複合インデックス（現時点では不要なので空） |
| `firebase.json` | Firebase CLI と Emulator の設定 |
| `tests/` | ルールのテスト（Emulator 上で実行） |

## ルールのテストを動かす

Node.js 22 以上と Java 21 以上が必要です（Firestore Emulator が Java で動くため）。

```bash
cd v2/firebase
npm install
npm test
```

`npm test` は Firestore Emulator を起動してテストを実行し、終わると Emulator を停止します。
プロジェクト ID は `demo-30min-task-timer`（`demo-` で始まる ID は本物の Firebase プロジェクトにつながらない Emulator 専用 ID）を使うので、Firebase へのログインは不要です。

## Firebase プロジェクトの作成（初回のみ・手作業）

以下は [Firebase コンソール](https://console.firebase.google.com/) で行います。

1. **プロジェクトを作成**
   - 「プロジェクトを追加」→ 名前は例として `30min-task-timer`。
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
5. **Android アプリの登録**は P4（Android アプリ作成時）に行う。署名証明書の SHA-1 の登録が必要。

## ルールを本番に反映する

自分の PC で実行します（ブラウザで Google ログインが開きます）。

```bash
cd v2/firebase
npx firebase login
npx firebase use --add      # 作成したプロジェクトを選び、別名は default
npm run deploy:rules
```

`firebase use --add` で作られる `.firebaserc` にはプロジェクト ID だけが入ります。コミットしても問題ありません。
