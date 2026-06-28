# Tavera 設計書・引き継ぎ書

**バージョン**: 1.8.3
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
| `TAVERA_GEMINI_API_KEY` | Tavera専用Gemini APIキー |
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
| tavera-kyushoku | 給食献立表の画像/PDF解析 | オフ | gemini-2.5-flash |
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
- `width/height: 60px`・`margin-top: -28px`（浮き上がり）
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
- **Edge Function**: Supabase MCPコネクタで直接デプロイ可能（`Supabase:deploy_edge_function`）
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
- [ ] 記録ハードルの低減（ホームからワンタップ・「昨日と同じ」ボタン）
- [ ] Flowra連携（食費データと連動した予算考慮の献立提案）
- [ ] iOSネイティブアプリ（Webで定着確認後）

---

*このドキュメントはClaudeとのセッション間の文脈維持のために随時更新する。*
