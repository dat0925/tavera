# Tavera 設計書・引き継ぎ書

**バージョン**: 1.9.6
**最終更新**: 2026-06-28
**ステータス**: 一般公開済み・本番Stripe決済稼働中・解約フロー実装済み

---

## 0. 開発背景・プロダクト方針

### 開発の動機

多くの家庭における献立管理は、冷蔵庫の食材・予算・家族の好み・アレルギーなど複数の制約を頭の中で同時に考慮しながら毎日行う、負荷の高いタスクである。従来はホワイトボードや紙への書き出しで運用されることが多く、**ログが残らない・振り返りができない・過去の好評メニューを再現しにくい**という課題があった。

### プロダクトのコアバリュー

| # | バリュー | 説明 |
|---|---------|------|
| 1 | **ログの蓄積** | 日々の献立を記録し、家族に好評だったメニューを振り返れるようにする |
| 2 | **AI提案** | 冷蔵庫の食材・直近の履歴・高評価メニューをもとにAIが献立を提案する |
| 3 | **給食連携** | 給食献立表（写真・PDF）をAI解析して取り込み、アレルギー管理と連動させる |

### ターゲットユーザー

日常的に家族の食事管理を担う主婦・主夫層。特に食物アレルギーを持つ家族がいる世帯や、献立の「考える手間」を削減したいユーザー。専業主婦のヘビーユーザーはカスタードパイを手作りするなど料理に積極的な層。

### ビジネスモデル

- Free: 無料・AI月10回
- Premium: ¥480/月・AI月500回
- 将来: iOSネイティブアプリ展開

### 関連プロダクト

同一開発者による「ra」シリーズ。Taskra（タスク管理）・Flowra（家計管理）と同シリーズ。

---

## 1. プロダクト概要

- **アプリ名**: Tavera（タベラ）
- **公開URL**: https://tavera.taskra.jp
- **GitHubリポジトリ**: https://github.com/dat0925/tavera
- **管理画面**: https://tavera.taskra.jp/admin.html（mstd0520@gmail.comのみアクセス可）

---

## 2. 技術スタック

| 領域 | 技術 | 備考 |
|------|------|------|
| フロントエンド | Vanilla JS + HTML/CSS | ビルドレス。GitHub Pages対応 |
| ホスティング | GitHub Pages + カスタムドメイン | tavera.taskra.jp |
| 認証・DB | Supabase（Taskraと同一PJ） | プレフィックス menu_ で衝突回避 |
| AI提案 | Anthropic Claude Haiku 4.5 | Edge Function経由 |
| 画像認識 | Gemini 2.5 Flash | 給食スキャン・冷蔵庫スキャン |
| 決済 | Stripe | 本番稼働中 |
| アクセス解析 | GTM（GTM-ML7NKTDR）+ GA4（G-XWVMN30LFD） | index.html・settings.html設置済み |
| お問い合わせ | Formspree（xpqbkdea） | Taskraと共有 |

---

## 3. Supabase設定

- **プロジェクト**: Taskraと共有（sfhtvtcmgueystyuhzvd）
- **URL**: https://sfhtvtcmgueystyuhzvd.supabase.co
- **Site URL**: https://app.taskra.jp（Taskraと共有のため変更不可）
- **Redirect URLs**: https://tavera.taskra.jp/home.html 追加済み

### Supabase Secrets

| Secret名 | 内容 |
|---|---|
| `ANTHROPIC_API_KEY` | Taskraと共有 |
| `TAVERA_GEMINI_API_KEY` | Tavera専用Gemini APIキー（2026-06-29以降、`flowra-497313`プロジェクト配下のキーに変更。Flowraの前払いデポジット＝Tier1の枠を共有してレート制限を回避） |
| `TAVERA_STRIPE_SECRET_KEY` | Stripe本番Secret Key |
| `TAVERA_STRIPE_PRICE_ID` | `price_1TmtslBNAV5e5rhcf4Wxvphw`（本番） |
| `TAVERA_STRIPE_WEBHOOK_SECRET` | `whsec_8x4LMUX008s0rlDd99oidTQBjn6EzDCZ`（本番） |
| `SUPABASE_SERVICE_ROLE_KEY` | 既存 |

### Edge Functions

| 関数名 | 用途 | JWT | モデル |
|--------|------|-----|--------|
| tavera-suggest | AI献立提案・プラン判定・利用回数制限 | オン | claude-haiku-4-5 |
| tavera-checkout | Stripe Checkout Session生成 | オン | - |
| tavera-webhook | Stripeイベント受信・DB更新（署名検証あり） | オフ | - |
| tavera-portal | Stripeカスタマーポータルセッション生成 | オン | - |
| tavera-kyushoku | 給食献立表の画像/PDF解析（v20・dishes+ingredients・URLモード内部fetch対応・429リトライ＋UA偽装＋マジックバイト判定＋response_schemaでJSON構造強制＋thinking無効化） | オフ | gemini-2.5-flash |
| tavera-fridge-scan | 冷蔵庫写真→食材認識 | オフ | gemini-2.5-flash |

---

## 4. データベース設計

全テーブルにプレフィックス `menu_` を付与。RLS設定済み。

### menu_households（世帯）
| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid PK | |
| name | text | 世帯名 |
| created_by | uuid | 作成者のuser_id |
| created_at | timestamptz | |

### menu_members（メンバー）
| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid PK | auth.users.idと一致 |
| household_id | uuid FK | |
| name | text | Google表示名 |
| role | text | owner / member |
| plan | text | free / premium |
| plan_expires_at | timestamptz | プレミアム有効期限 |
| stripe_customer_id | text | |
| stripe_subscription_id | text | |
| cancel_at_period_end | boolean | 解約予約フラグ |

### menu_logs（献立ログ）
| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid PK | |
| household_id | uuid FK | |
| date | date | 献立日 |
| meal_type | text | breakfast / lunch / dinner |
| dish_name | text | 料理名 |
| memo | text | |
| rating | int | 1〜5（5=また食べたい） |
| ingredients | text[] | 使用食材 |
| created_by | uuid | |
| created_at | timestamptz | |

### menu_fridge_items（冷蔵庫食材）
| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid PK | |
| household_id | uuid FK | |
| name | text | 食材名（最大20文字） |
| expires_on | date | 消費期限（任意） |
| created_by | uuid | |
| created_at | timestamptz | |

### menu_family_members（家族メンバー）
| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid PK | |
| household_id | uuid FK | |
| nickname | text | 表示名 |
| allergies | text[] | アレルギー食材リスト |
| goals | text[] | 目標・体質タグ（🏃スポーツ・📚受験・🥗ダイエットなど） |
| age_group | text | 年齢層（任意・例：🏫 小学生（7〜12歳）） |
| gender | text | 性別（任意・男性/女性/指定しない） |
| created_by | uuid | |
| created_at | timestamptz | |

### menu_ai_usage（AI利用回数）
| カラム | 型 | 説明 |
|--------|-----|------|
| user_id | uuid | |
| month | text | YYYY-MM形式 |
| count | int | 月次利用回数 |
| day_count | int | 当日利用回数 |
| last_day | text | 最終利用日 |

### 管理用RPC
| 関数名 | 用途 |
|---|---|
| `admin_get_all_users()` | 全ユーザー一覧（SECURITY DEFINER） |

---

## 5. 画面構成

| ファイル | 画面 | 主な機能 |
|----------|------|---------|
| index.html | LP | 機能紹介・Googleログイン・`?lp=1`でログイン済みでもLP表示 |
| home.html | ホーム | 7日間日付ストリップ・朝昼夜グリッド・冷蔵庫食材（写真スキャン対応）・また食べたいランキング |
| log.html | 献立追加/編集 | URLパラメータで動作変化・食材入力・アレルギー警告 |
| history.html | ログ | リスト/カレンダー切替・キーワード検索・詳細モーダル |
| suggest.html | AI提案 | チャット形式・冷蔵庫食材反映・アレルギー警告 |
| kyushoku.html | 給食インポート | ファイル/URLタブ・写真/PDF→Gemini解析→一括登録 |
| settings.html | 設定 | プロフィール・家族メンバー管理・世帯管理・プランカード・管理者リンク（admin専用） |
| admin.html | 管理画面 | Google認証（mstd0520@gmail.comのみ）・ユーザー一覧・AI利用状況・プラン変更 |
| terms.html | 利用規約 | 第11条に解約・返金ポリシーあり |
| privacy.html | プライバシーポリシー | |
| contact.html | お問い合わせ | Formspree経由 |
| tokushoho.html | 特定商取引法 | |

### LP（index.html）の注意点
- ログイン済みの場合 `home.html` に自動リダイレクト
- `?lp=1` パラメータがあればリダイレクトしない
- 各LPページ（privacy/terms/contact/tokushoho）のロゴも `/?lp=1` に遷移

---

## 6. ナビゲーション設計（v1.8.0）

### ボトムナビ構成（Flowra準拠）

| 位置 | ラベル | リンク | 備考 |
|---|---|---|---|
| 1 | ホーム | home.html | |
| 2 | 履歴 | history.html | ヘッダー「献立履歴」と統一 |
| 3 | ＋ | log.html | 中央・角丸正方形（60px・border-radius:16px）・テラコッタ・ラベルなし |
| 4 | AI提案 | suggest.html | |
| 5 | 設定 | settings.html | |

### ＋ボタンのCSS仕様（重要）
- `flex: 0 0 60px`（flex伸張を無効化 → 楕円にならない）
- `border-radius: 16px`（角丸正方形・Flowra準拠）
- `width/height: 60px`・`margin-bottom: 2px`（Flowra準拠・浮き上がりなし）
- `box-shadow: 0 6px 20px rgba(200,82,42,0.50), 0 2px 8px rgba(200,82,42,0.30)`

### アバターアイコン（home.html）
- タップするとアカウントメニューが表示（メールアドレス・キャンセル・サインアウト）
- 誤タップ防止のため確認ステップを挟む
- 背景タップでメニューを閉じる
- `signOut()` 後は `tavera.taskra.jp/` にリダイレクト（LP = ログアウト後の正しい遷移先）

---

## 7. AI提案の仕組み

### フロー
1. 起動時に今週のログ・高評価メニュー・冷蔵庫食材・家族メンバーを並行取得
2. `{ messages, likedDishes, recentDishes, fridgeItems, familyMembers }` をEdge Functionに送信
3. `tavera-suggest` がsystemPromptにコンテキストを付加してClaude APIを呼び出し

### プロンプトに含まれるコンテキスト
- 【今週の献立】最近の料理名（重複なし・上位7件）
- 【また食べたいメニュー】高評価メニュー（上位5件）
- 【冷蔵庫の食材】登録中の食材
- 【家族構成】メンバーごとに年齢層・性別・目標タグ・アレルギーを付加
  - 例：`太郎（🏫 小学生・男性・🏃スポーツ・運動量多め・卵NG）`

### 利用制限
| プラン | 月次上限 | 日次上限 |
|---|---|---|
| Free | 10回 | 3回 |
| Premium | 500回 | 50回 |

---

## 8. 冷蔵庫食材スキャン（v1.7.1）

- ホーム画面「📷 写真で入力」ボタンをタップ
- iOSシート（写真ライブラリ/カメラ/ファイル選択）が表示
- Gemini 2.5 Flashが食材を認識しJSON配列で返却
- 認識結果をチップ表示 → タップで除外 → 「追加する」で一括登録
- Edge Function: `tavera-fridge-scan`（JWT検証オフ・`TAVERA_GEMINI_API_KEY`使用）

---

## 9. 給食献立インポート

### フロー
1. `kyushoku.html` を開く（ホーム右上「📋 給食」ボタン）
2. 対象年月を選択
3. **ファイルタブ**: 写真・PDFを選択 / **URLタブ**: PDFのURLを入力して読み込み
4. 「AIで解析する」→ `tavera-kyushoku`（Gemini 2.5 Flash）
5. 日付・料理名リストを確認 → チェックで選択 → 一括登録
6. 料理名は「・」区切りで1件のlunch記録として保存

### URLタブの注意
- 直接fetchできないCORSエラーの場合、`tavera-url-fetch` Edge Functionを使ったサーバー経由fetchにフォールバック（※`tavera-url-fetch`は未実装・必要になったら作成）

---

## 10. Stripeサブスク設計

### プラン
| プラン | 月額 | AI提案 |
|---|---|---|
| Free | 無料 | 月10回・1日3回まで |
| Premium | ¥480 | 月500回・1日50回 |

### 本番稼働状況
- Stripe本番キー登録済み・Webhook署名検証済み
- Price ID: `price_1TmtslBNAV5e5rhcf4Wxvphw`
- Webhookエンドポイント: `https://sfhtvtcmgueystyuhzvd.supabase.co/functions/v1/tavera-webhook`

### 重要な実装上の注意
- **Webhook実装**: `createClient`（esm.sh）を使うと500エラー → **fetch直呼び（Supabase REST API）で実装すること**
- **Stripe新API（2026-04-22.dahlia）**: `current_period_end` がトップレベルにない場合がある → `sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end` でフォールバック

---

## 11. 管理画面（admin.html）

### アクセス制御
- Google認証済みかつ `mstd0520@gmail.com` のみアクセス可
- 他のアカウントは「アクセス権限がありません」表示
- 未ログインはログインページへ誘導

### 機能
- サマリー：総ユーザー数・Premiumユーザー数・今月のAI利用回数
- ユーザーカード：メール・登録日・プラン・AI今月/累計・世帯名
- プラン変更（Free↔Premium）
- メール検索・プランフィルター
- 10件/ページのページネーション

### データ取得
- RPC `admin_get_all_users()`（SECURITY DEFINER）で全ユーザー情報を取得

---

## 12. デザインシステム

| 変数 | 値 | 用途 |
|------|-----|------|
| --terra | #C8522A | メインカラー・CTA・＋ボタン |
| --amber | #E8932A | アクセント・また食べたい度の星 |
| --olive | #6B7A3A | サブアクセント・冷蔵庫UI |
| --brown | #4A2E1A | テキスト |
| --muted | #9B8878 | サブテキスト |
| --border | #EAD9C8 | ボーダー |

フォント: 見出し Kaisei Decol / 本文 Zen Kaku Gothic New（Google Fonts）

---

## 13. ファイル構成

```
/
├── index.html       # LP兼ログイン（?lp=1でリダイレクト無効）
├── home.html        # ホーム（冷蔵庫写真スキャン対応）
├── log.html         # 献立追加/編集
├── history.html     # ログ（旧：履歴）
├── suggest.html     # AI提案
├── kyushoku.html    # 給食献立インポート（ファイル/URLタブ）
├── settings.html    # 設定
├── admin.html       # 管理画面（admin専用）
├── terms.html       # 利用規約（第11条：解約・返金ポリシーあり）
├── privacy.html
├── contact.html
├── tokushoho.html   # 特定商取引法
├── manifest.json
├── DESIGN.md
├── css/
│   └── style.css    # nav-addスタイル追加済み
├── js/
│   ├── supabase.js
│   ├── auth.js
│   └── menu-log.js
└── supabase/
    └── functions/
        ├── tavera-suggest/
        ├── tavera-checkout/
        ├── tavera-webhook/
        ├── tavera-portal/
        ├── tavera-kyushoku/   # gemini-2.5-flash
        └── tavera-fridge-scan/ # gemini-2.5-flash
```

---

## 14. 開発ルール（重要）

### コード変更の手順（必須）
```
1. content.replace() 後は必ず置換が成功したか確認する
   → assert old in content, "ERROR: 挿入ポイントが見つからない"

2. JSを含むHTMLをpushする前に必ずnodeで構文チェック
   → node --check /tmp/extracted_js.js
   → インラインscriptのみ抽出する（外部scriptタグは除く）

3. 挿入に失敗したら即ロールバック（再試行しない）
   → GitHub API: GET /contents/file?ref={sha} で特定コミットから取得

4. 複数回修正が必要な場合はクリーンなコミットのファイルをベースに再構築
```

### その他の注意事項
- **JS生成**: シェルのヒアドキュメントは日本語・クォートが壊れる → **必ずPythonスクリプトで生成**
- **Edge Function**: Supabase MCPコネクタで直接デプロイ可能（`Supabase:deploy_edge_function`）。デプロイ後はリポジトリ内の`supabase/functions/*/index.ts`もコミットして同期すること（実際にv1〜v14がリポジトリに反映されておらず、デプロイ済みコードとgitが食い違っていた事例があった）
- **別アカウントテスト**: シークレット/プライベートウィンドウを使う
- **GitHub Pages**: 短時間に大量pushすると競合することがある。最終ビルドがsuccessならOK

### 障害履歴（2026-06-28）
home.htmlがJS構文エラーで画面破損。`</script>`内にHTMLが混入。原因は`content.replace()`の無音失敗が連鎖したこと。上記ルールを策定して再発防止済み。

---

## 15. 開発ロードマップ

### 完了済み
- MVP（認証・ログCRUD・ホーム・履歴・AI提案・PWA）
- 月間カレンダービュー
- 冷蔵庫食材メモ（消費期限・ボトムシート・写真スキャン）
- 家族メンバー管理（アレルギー・ゴールタグ・年齢層・性別）
- アレルギー照合・NGアラート
- 給食献立インポート（ファイル/URLタブ・Gemini 2.5 Flash）
- Stripeサブスク（本番稼働中・カスタマーポータル・解約フロー）
- 法的ページ（tokushoho・terms解約ポリシー）
- GTM・GA4設置（コンバージョン計測）
- 管理画面（ユーザー管理・プラン変更・AI利用状況）
- ナビゲーション刷新（Flowra準拠・＋中央・「ログ」リネーム）
- AI提案精度向上（家族ゴールタグ・年齢層・性別をプロンプトに反映）

### 次のアクション候補
- [x] **URLから給食PDF読み込み** ✅ v1.9.0 — tavera-url-fetchでCORSバイパス・チャンク処理でスタックオーバーフロー対策
- [x] **給食インポート材料取得** ✅ v1.9.2 — ingredients配列形式でGeminiから取得・menu_logs.ingredientsに保存
- [x] **給食インポート一括登録ボタンiPad/PC対応** ✅ v1.9.3 — position:fixedでサイドバーレイアウトでも常時表示（left:220px）
- [x] **給食URLインポートのサイズ上限問題修正** ✅ v1.9.3 — URLモード時はフロントがbase64を中継せずEdge Functionが直接fetch→Gemini呼び出しに変更
- [x] **給食URLインポート：「Gemini returned no text」エラー解決** ✅ v1.9.4 — 真因はGemini APIのレート制限(429)。リトライ＋分かりやすいエラーメッセージで対応（下記参照）
- [x] **iPad/PCサイドバーレイアウト** ✅ v1.9.0 — ≥769pxで左サイドバー表示・給食メニューも追加
- [x] **iPad/PC各画面グリッド対応** ✅ v1.9.1 — history(toolbar/listView/calView)・suggest(chat-page)・log(ロゴ表示)
- [x] **Pull-to-Refresh** ✅ v1.9.0 — PWAモードのみ有効
- [ ] 記録ハードルの低減（ホームからワンタップ・「昨日と同じ」ボタン）
- [ ] Flowra連携（食費データと連動した予算考慮の献立提案）
- [ ] iOSネイティブアプリ（Webで定着確認後）

---

*このドキュメントはClaudeとのセッション間の文脈維持のために随時更新する。*

---

## 既知の注意事項（v1.9.6時点）

### kyushoku.htmlのデバッグ履歴
- **根本原因だった問題**：`supabase.js`と`kyushoku.html`インラインJSで`const SUPABASE_URL`を二重宣言していたためJSクラッシュ → `switchTab`未定義に見えていた
- **教訓**：タブが反応しない系のバグは必ずブラウザコンソールを確認すること

### tavera-kyushokuのingredients実装の教訓
- Geminiのmemoフィールド（自由文字列）はダブルクォート・改行を含みJSONパースが不安定
- **解決策（v12）：ingredientsを文字列配列（text[]）で返す** → 配列はJSONが安定・DBの`ingredients text[]`カラムに直接格納可能
- 1回のリクエストで dishes+ingredients 両方取得（タイムアウト問題なし）
- kyushoku.html側でUIに【材料】プレフィックスで表示・doImportで `menu_logs.ingredients` に保存

### CORS回避パターン（v1.9.3改訂）
- 学校給食PDFなど外部サーバーはCORSヘッダーなし → 直接fetchは失敗
- フロントがCORSエラーを検知 → `pendingUrl` にURLをセットして「解析する」ボタンを有効化
- 「解析する」押下時に `{ url, year, month }` だけを `tavera-kyushoku` に送信
- `tavera-kyushoku`（v17）がサーバー側でURLをfetch → base64化 → Gemini呼び出しまで完結
- **重要：フロントにbase64を返さない** → Supabase Edge Functionのリクエストサイズ上限（約6MB）を回避
- `tavera-url-fetch` はファイルタブの直接fetch成功ケースでは不要になったが関数は残存

### 給食URLインポートで「Gemini returned no text」が出る問題（v1.9.4・重要・原因再特定）
- **症状**：特定のURLでPDFを読み込むと「エラー: Gemini returned no text」が発生。実行時間が0.4〜1.3秒と短く、Gemini解析（通常18〜40秒）に到達する前に失敗していた。
- **誤った仮説（v15で対応・実際は無関係）**：当初はUser-Agentの`"Bot"`文字列が給食サイトのWAFにブロックされ、HTMLブロックページがPDFとして送られているのでは、と推測。User-Agentをブラウザ相当に変更し、拡張子だけでなくマジックバイト（`%PDF`等）で実体を判定する処理を追加（v15）。これ自体は妥当な防御的改善だが、**今回の問題の真因ではなかった**。
- **真の原因（v17で特定・解決）**：実際はGemini API側の**レート制限（429 RESOURCE_EXHAUSTED）**。エラーレスポンスに`https://ai.google.dev/gemini-api/docs/rate-limits`への案内が含まれていたことで判明。短時間に複数回テストを繰り返したことで、`TAVERA_GEMINI_API_KEY`のRPM/RPD上限に達していた可能性が高い。
- **解決策（v17）**：
  1. Gemini呼び出しを`callGeminiWithRetry()`でラップし、429時に1.5秒→3秒のバックオフで最大3回リトライ
  2. リトライしても解決しない場合は、`detail`にGeminiの生エラーを残しつつ、ユーザー向けには「AI解析の利用が集中しているため処理できませんでした。1〜2分待ってから再試行してください。」という分かりやすいメッセージを返す
- **教訓**：
  - 実行時間が極端に短い失敗（数百ms〜1秒程度）は、Gemini呼び出しの前段（fetch/JSON解析）ではなく、**Gemini API自体が即座にエラーを返している**ケースを最初に疑うべき（429・400等）。
  - デバッグ時は`error`フィールドに`detail`（Geminiの生エラー）の内容を一時的に混ぜて返すと、フロント側のtoastだけで原因を特定できて早い。原因判明後は分かりやすい日本語メッセージに戻すこと。
  - 短時間に同じEdge Functionへ繰り返しテスト呼び出しをすると、自分自身でレート制限を引き起こすことがある（特に無料/低ティアのAPIキー）。Google AI StudioでTAVERA_GEMINI_API_KEYのクォータ・課金プランを確認することを推奨。
- **最終確認（2026-06-28）**：`TAVERA_GEMINI_API_KEY`（プロジェクト名 `gen-lang-client-0761554430` / Tavera Gemini API Key）はAI Studio上で2026/06/28作成・課金実績なしのため、実質**無料枠（Gemini 2.5 Flashで10RPM/250RPD程度）**で動作していたことが判明。Flowra用キー（`flowra-497313`プロジェクト）は既に2,000円の前払いデポジットがあり、こちらは制限が緩い。
- **最終対応（2026-06-29）**：Geminiのレート制限は**APIキー単位ではなくGoogle Cloudプロジェクト単位**であるため、`flowra-497313`プロジェクト配下で新規にAPIキーを発行し、Supabaseの`TAVERA_GEMINI_API_KEY`シークレットをそのキーに更新。Tavera専用にデポジットせず、Flowraの既存デポジット（Tier1）の枠を共有する形でレート制限を解消した。
  - 同一プロジェクトの請求枠・レート制限をFlowraと共有するため、両アプリを同時にヘビーに使うと理論上は競合し得るが、個人利用規模では問題にならない見込み
  - シークレット更新はSupabaseダッシュボード側操作のため、Claude側からは直接変更できない

### 「Gemini returned no text」解決後に発生したJSONパースエラー（v1.9.4・v19）
- **症状**：レート制限解消後、Gemini解析自体は約20秒で完了するようになったが、「エラー: Expected ',' or '}' after property value in JSON at position...」が発生。
- **原因**：プロンプトで「この形式のJSONのみで返して」と自然文で指示する方式は、料理名・食材名にクォートや特殊文字が混ざった際にGeminiの出力するJSON文字列が壊れることがある（フリーテキスト生成のため構造が保証されない）。
- **解決策（v19）**：Gemini APIの`generationConfig.responseSchema`（Structured Output）でJSON配列の構造（date/dishes/ingredientsを持つオブジェクトの配列）をスキーマとして強制する方式に変更。これによりGemini側でJSON構造が保証されるため、文字列内の特殊文字によるパース崩れが原理的に発生しなくなる。プロンプトも「JSON形式で返してください」という冗長な指示が不要になり簡潔化した。
  - 念のため、`JSON.parse(text)`が万が一失敗した場合のフォールバック（正規表現で配列部分を再抽出して再パース）も残している。
- **教訓**：LLMにJSONを返させる場合、プロンプトでの自然文指示より`responseSchema`によるStructured Outputの方が構造的に堅牢。今後同様のJSON生成タスク（`tavera-fridge-scan`等）でも同方式への切り替えを検討する価値がある。

### 給食一括登録が常に0日分になる重大バグ（v1.9.6・根本原因はDBスキーマ）
- **症状**：給食インポートで複数日選択し「選択した献立をインポート（N日分）」を実行しても、トーストには常に「0日分の給食を登録しました」と表示される。しかも対象日は無条件で「登録済み」バッジが付くため、見た目上は成功したように見えるが、実際は履歴（home.html等）に何も反映されない。
- **根本原因**：`menu_logs`テーブルに、コードが前提としていたユニーク制約 `(household_id, date, meal_type)` が**そもそも存在していなかった**。`doImport()`は`db.from('menu_logs').upsert(..., { onConflict: 'household_id,date,meal_type' })`という形でupsertしていたが、対応するUNIQUE制約／インデックスがDB側に無いと、PostgreSQLは`there is no unique or exclusion constraint matching the ON CONFLICT specification`（42P10）エラーを返す。これが**選択した全件で毎回**発生していたため、`success`カウンタが常に0になっていた。
- **誘発した副次バグ（UI側）**：`doImport()`はupsertの結果（成功/失敗）を見ずに、チェックされていた全項目を無条件で「登録済み」（`alreadyExists = true`）にしていた。そのため実際にはDBへの書き込みが1件も成功していなくても、画面上は「登録済み」と表示されてしまい、不具合の発覚が遅れた。
- **解決策（v1.9.6）**：
  1. `ALTER TABLE menu_logs ADD CONSTRAINT menu_logs_household_date_meal_unique UNIQUE (household_id, date, meal_type);` をマイグレーションとして適用（事前に重複行が無いことを確認済み）
  2. `doImport()`を、各アイテムごとのupsert結果を個別に追跡する実装に変更。成功した項目のインデックスのみ`succeededIndexes`に記録し、その分だけ「登録済み」バッジを表示・チェック解除する。失敗した項目はチェック状態を維持し、再試行可能にする
  3. 失敗があった場合はトーストに「N日分登録・M日分失敗しました（エラー内容）」と表示し、`console.error`にも詳細を出力するようにした
- **教訓**：
  - `upsert`の`onConflict`はDB側に対応するUNIQUE制約／インデックスが存在することが前提。フロントのコードだけ見て「ロジックは正しいはず」と判断せず、**実際のテーブル定義（制約・インデックス）をSupabase側で確認する**ことが重要。今回はコードを何度読んでも問題なく見えたが、`pg_constraint`を見て初めて原因が判明した。
  - UI側で「成功した前提」で見た目を更新する処理（バッジ表示など）は、必ずAPI呼び出しの結果を見てから行うこと。一括処理（ループでupsertを複数回呼ぶ等）では、成功・失敗を個別に追跡し、失敗時に分かるようにする。

### 給食インポートボタンのラベル崩れ（v1.9.5・kyushoku.html）
- **症状**：給食インポート実行後、ボタンのラベルが「&#10003; 選択した献立をインポート（&lt;span id="importCount"&gt;0&lt;/span&gt;日分）」のようにHTMLタグ・実体参照がそのまま画面に表示されてしまう。
- **原因**：`doImport()`内でボタンラベルを元に戻す際、`btn.textContent = '...(HTMLタグ入り文字列)...'`としていたため、ブラウザがHTMLとして解釈せずプレーンテキストとして表示していた。さらにこの代入により`<span id="importCount">`要素自体がDOMから消滅するため、以降の`updateImportBar()`（`document.getElementById('importCount').textContent = count`）が`null`参照エラーになり、チェック数表示が更新されなくなる副作用もあった。
- **解決策**：`btn.textContent`→`btn.innerHTML`に変更。1行の修正で表示崩れと`importCount`要素消失の両方を解決。
- **教訓**：ボタン等のラベルをHTMLタグ込みの文字列で動的に書き換える処理では`innerHTML`を使うこと。`textContent`はHTMLをエスケープして表示するため、タグや`&#xxxx;`形式の実体参照がそのまま見えてしまう。また、内部に`id`付き子要素（`<span id="...">`）を含むラベルを再代入する処理は、その後その`id`を参照するコードが他にないか合わせて確認すること。

### response_schema導入後もJSONが崩れる問題（v20・最終解決）
- **症状**：v19（response_schema導入）後も「解析結果の読み取りに失敗しました」エラーが継続。約20秒かかって失敗していた（＝Geminiは何らかの応答をしたが、それでもパースできなかった）。
- **原因（推定・有力）**：Gemini 2.5 Flashは内部的に「thinking（思考）」トークンを使用する場合があり、これが`maxOutputTokens`の予算を消費してしまう。結果として実際のJSON出力部分が`maxOutputTokens: 8192`の上限で途中で切れ（`finishReason: MAX_TOKENS`）、閉じ括弧が欠けた不完全なJSONになっていた可能性が高い。月間カレンダー全体（約20日分×料理名・食材情報）を一度に出力するため、トークン消費量が多い。
- **解決策（v20）**：
  1. `generationConfig.thinkingConfig.thinkingBudget: 0` でthinkingを無効化し、出力トークンを丸ごとJSON生成に使う
  2. `maxOutputTokens`を8192→16384に増量（安全マージン確保）
  3. パース失敗時のエラーレスポンスに`finishReason`を含め、`MAX_TOKENS`の場合は「出力が長すぎて途中で切れました」と明示するようにし、今後同種の問題が再発した際に即座に判別できるようにした
- **教訓**：Gemini 2.5系モデルでJSON構造化出力を使う際は、`thinkingBudget: 0`を明示しないと予期せぬトークン消費でレスポンスが途中で切れることがある。特に出力量が多くなりがちなタスク（月間カレンダー全件抽出など）では要注意。`finishReason`を必ずログ・エラーに含めておくと原因特定が早い。

### 給食サイトのアクセス制限対策（v1.9.4・防御的改善・上記とは別件）
- `fetchUrlAsBase64`のUser-Agentを"Bot"を含まないブラウザ相当の文字列に変更
- 拡張子だけでなく、取得したバイト列のマジックバイト（`%PDF`・PNG・JPEG signature）で実体を判定
- マジックバイトがPDF/画像と一致せず、HTMLらしき内容（`<!doctype`等）の場合は「URLからPDF/画像を取得できませんでした（サーバーがHTMLを返却・アクセス制限の可能性があります）」と明示的にエラーを返す
- これは実際に起きた不具合の直接的な原因ではなかったが、今後同様のサイトブロックが発生した際の防御として残している

### 大きなPDFのbase64変換
- `btoa(String.fromCharCode(...bytes))` は大きなファイルでスタックオーバーフロー
- チャンク処理（8192バイト単位）で対処済み（tavera-kyushoku内の`fetchUrlAsBase64`関数）

### 給食インポート一括登録ボタン（iPad/PC）
- `.ky-import-bar` を `position: fixed` に変更
- モバイル: `bottom: calc(60px + safe-area-inset-bottom)`（ボトムナビの上）
- iPad/PC（≥769px）: `left: 220px; bottom: 0`（サイドバー右側・画面最下部）
