# Tavera 設計書・引き継ぎ書

**バージョン**: 1.15.1
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
| tavera-kyushoku | 給食献立表の画像/PDF解析（v21・dishes+ingredients・URLモード内部fetch対応・429リトライ＋UA偽装＋マジックバイト判定＋response_schemaでJSON構造強制＋thinking無効化＋認証/利用回数制限） | オン | gemini-2.5-flash |
| tavera-fridge-scan | 冷蔵庫写真→食材認識（v5・認証/利用回数制限＋429リトライ＋thinking無効化＋エラー診断） | オン | gemini-2.5-flash |

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
| source | text | manual（既定）/ kyushoku。給食インポート由来かどうかのフラグ。🍱バッジ表示に使用（v1.9.7） |
| created_by | uuid | |
| created_at | timestamptz | |

UNIQUE制約: `(household_id, date, meal_type)` ※v1.9.6で追加。これが無いと給食一括登録のupsertが全件失敗する（既知の注意事項参照）

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
| feature | text | 'suggest'（AI相談）/ 'kyushoku'（献立取り込み）/ 'fridge'（食材取り込み）。v1.13.0で追加。UNIQUE制約は`(user_id, month, feature)` |
| count | int | 月次利用回数（成功時のみカウント） |
| day_count | int | 当日利用回数（'suggest'のみ使用。kyushoku/fridgeは日次制限なし） |
| last_day | text | 最終利用日（'suggest'のみ使用） |

### 管理用RPC
| 関数名 | 用途 |
|---|---|
| `admin_get_all_users()` | 全ユーザー一覧（SECURITY DEFINER） |

---

## 5. 画面構成

| ファイル | 画面 | 主な機能 |
|----------|------|---------|
| index.html | LP | 機能紹介・料金プラン比較（#pricing）・Googleログイン・`?lp=1`でログイン済みでもLP表示 |
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
- Edge Function: `tavera-fridge-scan`（v1.13.0よりJWT検証オン・認証必須・`TAVERA_GEMINI_API_KEY`使用）

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

### レイアウト（v1.11.1）
- モバイル：ヘッダー左の☰ハンバーガーボタンでサイドバーをドロワー表示（左からスライドイン・背景オーバーレイタップで閉じる）
- iPad/PC（≥769px）：左サイドバーナビ（`.admin-sidebar`）を常時表示。ハンバーガーボタン・オーバーレイは非表示
- `.admin-wrap`をiPad/PC幅でCSS Gridに切替（220px固定サイドバー＋残り幅メイン）
- `showSection('users' | 'aimodel' | 'revenue')` でセクションの表示切替（`.hidden`クラスのトグル）。モバイルではセクション選択時に自動でドロワーを閉じる
- `toggleAdminSidebar()` / `closeAdminSidebar()` でドロワーの開閉。画面幅が769px以上になったら自動クローズ（リサイズ時の表示崩れ防止）

### 機能（ユーザー管理セクション）
- サマリー：総ユーザー数・Premiumユーザー数・今月のAI利用回数
- ユーザーカード：メール・登録日・プラン・AI今月/累計・世帯名
- プラン変更（Free↔Premium）
- メール検索・プランフィルター
- 10件/ページのページネーション

### 機能（AIモデルセクション・v1.10.0新設、v1.10.1で1回あたり目安を追加）
- Tavera内で使用しているAI機能ごとに、使用モデルと単価（2026年6月時点）を一覧表示
- 静的なカード表示（DBから取得しているわけではなく、Edge Functionのコードを元に手動で記載。モデルやプロンプトを変更した際はここも合わせて更新すること）
- 為替レートは社内計算用に**$1=¥160**で簡便計算（2026年6月時点の実勢相場は$1≒¥161〜162。実勢レートとの差は注記済み）

| 機能 | 使用箇所 | モデル | 入力単価 | 出力単価 | 1回あたり目安（想定トークン数） |
|------|---------|--------|---------|---------|---------|
| 💬 AI相談 | suggest.html → tavera-suggest | Claude Haiku 4.5（claude-haiku-4-5-20251001） | $1.00/100万トークン | $5.00/100万トークン | $0.0023（約¥0.4）／入力800・出力300トークン想定 |
| 📋 献立取り込み | kyushoku.html → tavera-kyushoku | Gemini 2.5 Flash | $0.30/100万トークン | $2.50/100万トークン | $0.0087（約¥1.4）／入力4,000・出力3,000トークン想定 |
| 📷 食材を写真で取り込み | home.html → tavera-fridge-scan | Gemini 2.5 Flash | $0.30/100万トークン | $2.50/100万トークン | $0.0004（約¥0.07）／入力600・出力100トークン想定 |

※「1回あたり目安」はあくまで典型的な利用パターンを仮定した推定値。実際は会話の長さ・写真解像度・献立表の複雑さ等で変動する
※Gemini系2機能は`TAVERA_GEMINI_API_KEY`を共有しており、2026-06-29以降`flowra-497313`プロジェクト（Flowraの前払いデポジット＝Tier1枠）配下のキーを使用（詳細は既知の注意事項のレート制限の項を参照）

### データ取得
- RPC `admin_get_all_users()`（SECURITY DEFINER）で全ユーザー情報を取得
- ※v1.13.0で`menu_ai_usage`に`feature`列を追加した影響で、このRPCが返す`ai_total`/`ai_month`は`SUM(a.count)`で集計しているため、**AI相談だけでなく献立取り込み・食材取り込みも合算した「全AI機能の利用回数」**になった（feature列追加前はAI相談のみの回数だった）。ユーザー管理画面で「AI利用回数」として表示している数値はこの合算値である点に注意

### 機能（収益構造セクション・v1.11.0新設、v1.12.0で編集可能なシミュレーターに変更、v1.13.0で実際の上限値に同期）
- フリープラン・プレミアムプランそれぞれの売価・原価・粗利・利益率を表で比較
- 価格はLP（index.html `#pricing`）と同じ値を使用（**手動同期**：プラン価格や各機能の上限回数を変更する際は、index.html・settings.html・tavera-suggest/tavera-kyushoku/tavera-fridge-scan（Edge Function）・admin.htmlの計5箇所を必ず揃えて更新すること。ビルド時に自動参照する仕組みは無い）
- 各機能の「上限回数」をその場で編集できるシミュレーター。数値を変更すると`recalcRevenue()`が原価・粗利・利益率をリアルタイム再計算する
  - 「無制限」チェックボックス＋数値入力。v1.13.0以降は3機能とも実際に上限が存在するため、デフォルトはチェックOFF（数値入力が常に有効）
  - 「↺ デフォルト値に戻す」ボタンで初期状態（実際の現状設定）に復元
  - チェックを入れて「無制限」を試算することも可能（その場合は原価合計・粗利・利益率に⚠️と≥/≤を付けて「その機能を除いた下限/上限」であることを明示）
- 計算ロジックは`REV_RATE_PER_USE`（AI相談¥0.4・献立取り込み¥1.4・食材取り込み¥0.07／1回あたり）と`REV_PRICE`（free:0, premium:480）を`admin.html`内にハードコードして使用。AIモデルタブの単価を変更した場合はこの定数も合わせて更新すること
- **これはあくまで社内シミュレーター**であり、ここで数値を変えても実際のEdge Functionの上限は変わらない。実際に上限を変える場合は、決定した数値を別途Edge Functionのコードに反映してデプロイする必要がある（v1.13.0で実装済みの値が現在のデフォルト）

#### デフォルト値（=実際の運用上限値、2026-06-29実装）

| 項目 | 無料プラン | プレミアムプラン |
|------|----------|----------------|
| 売価（月額） | ¥0 | ¥480 |
| AI相談 上限回数/月（日次） | 10回（3回/日） | 300回（30回/日） |
| AI相談 原価 | ¥4 | ¥120 |
| 献立取り込み 上限回数/月 | 3回 | 30回 |
| 献立取り込み 原価 | ¥4.2 | ¥42 |
| 食材取り込み 上限回数/月 | 30回 | 100回 |
| 食材取り込み 原価 | ¥2.1 | ¥7 |
| 原価合計 | ¥10.3 | ¥169 |
| 粗利 | −¥10.3 | ¥311 |
| 利益率 | ―（売価¥0） | 64.8% |

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
- [x] **3機能すべてに利用回数上限を実装** ✅ v1.13.0 — AI相談10/300(日3/30)・献立取り込み3/30・食材取り込み30/100。menu_ai_usageにfeature列追加、tavera-kyushoku/tavera-fridge-scanに認証+上限チェックを新規実装、LP・admin.html収益構造のデフォルト値も同期（下記参照）
- [x] **収益構造セクションを編集可能なシミュレーターに変更** ✅ v1.12.0 — 各機能の上限回数を編集すると原価/粗利/利益率がリアルタイム再計算。デフォルトは実際の現状設定（AI相談は実際の上限値、献立取り込み/食材取り込みは「無制限」チェックON）
- [x] **admin.htmlモバイルをハンバーガー＋ドロワーメニューに変更** ✅ v1.11.1 — 上部タブ方式から、PC同等の左メニューをそのままドロワー表示する方式に統一
- [x] **LPに料金プランセクション追加＋管理画面「収益構造」メニュー新設** ✅ v1.11.0 — index.html `#pricing`にFree/Premium比較カードを追加。admin.htmlに売価/原価/粗利/利益率の比較表を追加（$1=¥160換算）。献立取り込み・食材写真取り込みに利用上限が無いことが判明（下記参照）
- [x] **admin.htmlにiPad/PC用サイドバー＋AIモデル一覧セクション追加** ✅ v1.10.0 — 左ナビ（ユーザー管理/AIモデル）を新設。AIモデルセクションにAI相談(Claude Haiku 4.5)・献立取り込み/食材写真取り込み(Gemini 2.5 Flash)の使用モデルと単価を掲載
- [x] **URLから給食PDF読み込み** ✅ v1.9.0 — tavera-url-fetchでCORSバイパス・チャンク処理でスタックオーバーフロー対策
- [x] **給食インポート材料取得** ✅ v1.9.2 — ingredients配列形式でGeminiから取得・menu_logs.ingredientsに保存
- [x] **給食インポート一括登録ボタンiPad/PC対応** ✅ v1.9.3 — position:fixedでサイドバーレイアウトでも常時表示（left:220px）
- [x] **給食URLインポートのサイズ上限問題修正** ✅ v1.9.3 — URLモード時はフロントがbase64を中継せずEdge Functionが直接fetch→Gemini呼び出しに変更
- [x] **給食URLインポート：「Gemini returned no text」エラー解決** ✅ v1.9.4 — 真因はGemini APIのレート制限(429)。リトライ＋分かりやすいエラーメッセージで対応（下記参照）
- [x] **給食一括登録が常に0件失敗するバグ修正** ✅ v1.9.6 — menu_logsにUNIQUE制約が無く全件upsert失敗していた。制約追加＋成否を個別追跡するUIに修正（下記参照）
- [x] **給食インポート由来の記録に🍱バッジ表示** ✅ v1.9.7 — menu_logsにsource列追加(manual/kyushoku)。料理名は汚さずhome/history/カレンダー/詳細モーダルにバッジ表示
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

### iPad/PCで献立の削除ボタンが消える問題（v1.9.8・log.html）
- **症状**：iPad/PC幅（≥769px）でlog.htmlを開くと、既存の献立を編集していても画面下部に「この献立を削除する」ボタンが表示されない（保存ボタンの下に何も無い）。モバイル幅では問題なく表示される。
- **原因**：log.htmlのヘッダーにある「← 戻る」ボタンと、削除ボタン（`#deleteBtn`）が**同じ`.btn-ghost`クラスを共有**していた。iPad/PCではサイドバーがあるため戻るボタンを隠す目的で `@media (min-width: 769px) { .btn-ghost { display: none !important; } }` というルールを入れていたが、これがクラス名でしか絞り込んでいなかったため、同じクラスを持つ削除ボタンまで一緒に非表示になっていた。JS側で`deleteBtn.style.display = ''`としても、CSSの`!important`の方が優先されるため上書きできなかった。
- **解決策**：セレクタを`.btn-ghost`→`.app-header .btn-ghost`に変更し、ヘッダー内の戻るボタンだけに絞り込んだ。削除ボタンは`.save-area`内にあり`.app-header`の外なので影響を受けなくなった。
- **教訓**：汎用クラス名（`.btn-ghost`等）に対してブレークポイント別の表示切替を`!important`付きで書く場合、意図せず他の同名クラス要素も巻き込むリスクが高い。画面サイズ別の表示制御は、対象を親要素やIDで明確に絞り込んだセレクタにすること。

### home.htmlだけiPad/PCでロゴ・ページ名の配置が崩れる問題（v1.9.9）
- **症状**：iPad/PC幅（≥769px）のサイドバー表示で、`home.html`だけ左上のロゴ（Tavera）とページ名（「ホーム」）の配置が他画面（設定・履歴・給食等）と違って詰まって見える。
- **原因**：他画面では`<span class="header-title">ページ名</span>`が`<div class="logo">`の**外側**（`.app-header`の直接の子・`.logo`の兄弟要素）に置かれているのに対し、`home.html`だけ`header-title`が`.logo`内部の入れ子divの中に`logo-text`と一緒に入っていた。CSS側の`.app-header .header-title { display:block; margin-top:6px; ... }`（サイドバー時にページ名をロゴの下に独立した行として表示するルール）はdescendantセレクタなので入れ子の深さに関わらず適用されるが、`.logo`自体が`display:flex;align-items:center`の行レイアウトのため、本来「ロゴ行の下にもう1行」となるべきページ名が「ロゴ画像の右の縦積みテキスト内」に押し込まれてしまい、画像とテキストの縦位置・余白がおかしくなっていた。
- **解決策**：`home.html`のヘッダー構造を他画面と同じパターン（`.logo`→`header-title`→`header-right`を`.app-header`の直接の子として並列に配置）に統一。
- **教訓**：共通レイアウト（ヘッダー等）を複数画面で使うときは、CSSのセレクタだけでなくHTMLのDOM構造（どの要素がどの階層にあるか）も画面間で完全に一致させること。CSSのdescendantセレクタは深さを問わず効いてしまうため、構造がズレていても一見「動いているように見える」ことがあり、見た目の微妙な崩れとして現れるまで気づきにくい。

### 3機能すべてに利用回数上限を実装（v1.13.0・2026-06-29）

収益構造シミュレーターで検討した結果、以下の上限を実際に導入した。

| 機能 | 無料プラン | プレミアムプラン |
|------|----------|----------------|
| 💬 AI相談（tavera-suggest） | 10回/月（1日3回） | 300回/月（1日30回）※旧500/50から変更 |
| 📋 献立取り込み（tavera-kyushoku） | 3回/月 | 30回/月 ※新規導入 |
| 📷 食材取り込み（tavera-fridge-scan） | 30回/月 | 100回/月 ※新規導入 |

#### DBスキーマ変更
- `menu_ai_usage`に`feature`列を追加（text, NOT NULL, DEFAULT 'suggest'）。既存行は自動的に`feature='suggest'`になるため後方互換あり
- UNIQUE制約を`(user_id, month)`→`(user_id, month, feature)`に変更（制約名: `menu_ai_usage_user_month_feature_key`）
- これにより1テーブルで3機能分の月次利用回数を管理できるようになった（day_count/last_dayは現状'suggest'のみ使用、kyushoku/fridgeは日次制限なし・月次のみ）

#### tavera-suggest（v23）の変更
- `PREMIUM_LIMIT`を500→300、`PREMIUM_DAY_LIMIT`を50→30に変更（比率10:1を維持）
- 全クエリ・upsertに`.eq("feature", "suggest")` / `feature: "suggest"`を明示的に追加（feature列追加に伴う必須対応。これをやらないと将来kyushoku/fridgeの利用行が増えた際に`.maybeSingle()`が複数行マッチで例外を起こす）
- `onConflict`を`"user_id,month"`→`"user_id,month,feature"`に変更

#### tavera-kyushoku（v21）・tavera-fridge-scan（v4）の変更（新規実装）
- **これらの関数は元々完全に匿名・無認証だった**（`verify_jwt:false`、コード内でもユーザー認証処理が一切無かった）。上限管理にはユーザー識別が必須なため、`tavera-suggest`と同じパターン（`createClient`でservice roleクライアントを作り`supabase.auth.getUser(token)`でユーザー特定→`menu_members`でplan判定）を新規追加した
- `verify_jwt`を`false`→`true`に変更（Supabaseゲートウェイレベルでも有効なJWTを要求するようになった）
- 利用回数のカウントアップは**成功時のみ**実施（Gemini呼び出し失敗・JSONパース失敗・食材0件などの場合はカウントしない＝失敗した試行はユーザーの不利益にならないようにしている）
- 上限超過時は429・分かりやすい日本語エラーメッセージ（例：「今月の給食取り込み回数の上限（3回）に達しました。プレミアムプランなら月30回まで利用できます。」）を返す

#### フロントエンド側の対応
- **kyushoku.html**：元から`Authorization: Bearer <session.access_token>`を送信していたため**変更不要**だった（`verify_jwt:true`化に対応済み）
- **home.html（冷蔵庫食材スキャン）**：`tavera-fridge-scan`へのfetchに認証ヘッダーが**付いていなかった**ため追加必須だった。これを追加しないと`verify_jwt:true`化した瞬間に全ユーザーが401で使えなくなるため、Edge Function側のデプロイと同時に必ず直す必要があった項目。`getSession()`から取得した`access_token`をAuthorizationヘッダーに付与し、エラー時も`d.error`をそのまま表示するように修正（従来は常に「エラーが発生しました。」という固定文言だった）
- **教訓**：Edge Functionに`verify_jwt:true`や新規の認証チェックを追加する際は、その関数を呼んでいる**全てのフロントエンドのfetch呼び出し**がAuthorizationヘッダーを送っているか必ず確認すること。送っていないfetchが1つでも残っていると、デプロイした瞬間にその画面の機能が全ユーザーに対して即時停止する（サイレント障害になりやすい）

#### LP・管理画面の同期
- `index.html`の`#pricing`：各機能の上限回数をプラン別に明記（従来は「給食献立のAIインポート」のように上限の記載が無かった）
- `admin.html`の収益構造シミュレーター：デフォルト値を上記の実際の値に更新。「無制限」チェックボックスはデフォルトOFF（3機能とも実際に上限が存在するため）
- **今後、上限値を再度変更する場合に同期が必要な箇所（計5箇所）**：`index.html`（LP表記）・`settings.html`（プラン案内文。現状は具体的回数を出していないため変更不要なケースもある）・`tavera-suggest`/`tavera-kyushoku`/`tavera-fridge-scan`（実際の制限値）・`admin.html`（シミュレーターのデフォルト値とREV_DEFAULTS）

### settings.html・suggest.htmlの「AI提案は無制限」表記が事実と異なる問題（v1.13.1）
- **症状**：v1.13.0でAI相談のプレミアム上限を300回/月に確定させたにもかかわらず、`settings.html`のプランカードには「AI提案は**無制限**でご利用いただけます。」、`suggest.html`の上限超過時メッセージにも「プレミアムプランなら**無制限**でご利用いただけます。」という、実態と異なる表記が残っていた（ユーザーからの指摘で発覚）。
- **合わせて発見した二次バグ**：`settings.html`の`renderPlanCard()`は`menu_ai_usage`を`.eq('month', month).maybeSingle()`で取得していたが、v1.13.0で`feature`列を追加した影響で、同じユーザー・同じ月に複数機能（suggest/kyushoku/fridge）の行が存在するようになった。`feature`で絞り込んでいないこの箇所は、ユーザーが2機能以上を同月に使うと`.maybeSingle()`が複数行マッチで例外を起こす状態になっていた（実害が出る前に修正）。
- **解決策**：
  1. `settings.html`：プレミアムの表示を無料プランと同じ「使用数 / 上限（300回）」形式に統一し、「無制限」の文字は使わず「（実質無制限）」という補足に変更。`menu_ai_usage`のクエリに`.eq('feature', 'suggest')`を追加
  2. `tavera-suggest`（v24）：`remaining`をプレミアムでも常に算出するように変更（旧コードは`if (!isPremium)`でフリーのみ計算）。レスポンスに`limit`フィールドも追加
  3. `suggest.html`：利用回数バーをプレミアムでも非表示にせず、`data.limit`/`data.remaining`/`data.plan`から動的に表示するよう変更。プレミアムの場合は「プレミアムにする」リンクのみ隠す。`showPaywall()`の文言も「プレミアムプランなら月300回まで」に修正し、プレミアム自身が上限に達した場合は「来月また利用できます」に分岐
- **教訓**：
  - 利用上限の具体的な数値を変更したら、コード中の固定文言（「無制限」「10回まで」等）も**全文検索して洗い出す**こと。サーバー側のロジックだけ直してフロント側の説明文を直さないと、機能と表記が食い違ったまま気づかれにくい。
  - 既存テーブルに新しい絞り込み列（今回の`feature`）を追加する場合は、**そのテーブルを参照している箇所を全文検索**（`grep -rn "テーブル名"`）して、フィルタ漏れが無いか確認すること。`.single()`/`.maybeSingle()`は行数が想定と異なると例外を投げるため、サイレントに壊れるのではなく実行時エラーとして表面化するが、気づくのはユーザーが実際に複数機能を使った後になりがちで発見が遅れる。

### PWA起動時にLPが一瞬表示される問題の解消（v1.14.0・スプラッシュ追加）

- **症状**：ログイン済みユーザーがPWAでアプリを開くと、`index.html`（LP）の内容が一瞬見えてから`home.html`にリダイレクトされる、という「LPのちらつき」が発生していた。
- **原因**：`index.html`はLP兼ログイン状態の振り分け役を兼任しており、ページ全体（LPのHTML/CSS）が先にレンダリングされたあと、画面最下部の`<script>`内で非同期に`getUser()`を呼んでログイン済みかどうかを判定し、ログイン済みなら`home.html`へ`location.href`で遷移する、という実装だった。この判定が終わるまでの間（Supabaseセッション確認の往復がある）、LPの内容がそのまま見えてしまう。
- **解決策**：Flowra（`dat0925/flowra`）と同じ「スプラッシュオーバーレイ」方式を導入。
  1. `<body>`の先頭に`#splash`（Taveraロゴ＋ロゴテキスト、`position:fixed;inset:0;z-index:9999`、背景は`var(--cream)`=manifest.jsonの`background_color`と統一）を配置。これによりページが読み込まれた瞬間、LPの内容より先にスプラッシュが画面全体を覆う
  2. 認証チェックのIIFEを修正：
     - `?lp=1`指定時 → 即座に`hideSplash()`してLPを表示
     - ログイン済み → スプラッシュを**そのまま表示し続けたまま**`home.html`へ`location.href`遷移（リダイレクトが完了するまでLPの内容は一切見えない）
     - 未ログイン → `hideSplash()`でフェードアウトしてLPを表示
     - `getUser()`が例外を投げた場合もcatchして`hideSplash()`するフォールバックを追加（元のコードには無かった）
  3. `hideSplash()`は`fade-out`クラスでopacity遷移（0.4s）→`hidden`クラスで`display:none`という、Flowraと同じ2段階の隠し方を採用
- **教訓**：LPと「ログイン済みなら別ページにリダイレクト」を1ファイルで兼任する構成では、リダイレクト判定が終わるまでLPの内容を完全に覆い隠すオーバーレイを先頭に置くのが最も簡単な対策。Flowraのように最初からLPをルート（`/`）から分離し、ルートは認証ゲート専用にする設計の方がそもそもこの問題が起きないが、今回はTaveraの既存構成（`index.html`がLP兼ゲート）を変えずに対応した。大規模な構成変更（LPを別パスに切り出す等）が必要であれば別途相談。

### 「実質無制限」の補足表現も削除（v1.14.1）
- v1.13.1で「無制限」→「300回」に直した際、`settings.html`と`index.html`に「（実質無制限）」という補足を残していたが、ユーザーから「この訴求も削除して」と指摘があり削除。具体的な上限回数（300回）のみを表示する形に統一。
- `index.html`に残っていた「献立記録・履歴は無制限」は実際に上限が無い機能（menu_logsへの記録数）についての記述であり、こちらは正確なので変更していない。
- **教訓**：数値で正確な上限を示せる場合、「実質無制限」のような曖昧な補足は不要であり、誤解や不信感の元になりうる。具体的な数字だけを淡々と示す方が誠実。

### settings.htmlのプランカードに3機能すべての利用状況を表示（v1.15.0）

- **背景**：v1.13.0で3機能（AI相談・献立取り込み・食材取り込み）すべてに利用上限を実装したが、`settings.html`のプランカードには**AI相談の利用回数しか表示されていなかった**。ユーザーから「献立取り込み・食材取り込みの上限・利用回数も見えるようにしてほしい」と指摘があり対応。
- **実装**：
  - `USAGE_LIMITS`（free/premium × suggest/kyushoku/fridgeの上限値）と`FEATURE_LABELS`（表示名）を`settings.html`内に定義
  - `menu_ai_usage`から該当ユーザー・該当月の行を`feature`で絞らず全件取得し、`{feature: count}`のマップに変換
  - `buildUsageRows()`で3行分（💬AI提案／📋献立取り込み／📷食材取り込み）の「使用数 / 上限回数」をまとめて生成し、プランカード内に`.plan-usage-list`として表示
  - 残り回数が少ない（上限の10%以下、最低2）場合は`.warn`クラスでテラコッタ色に強調
  - フリー/プレミアムどちらでも同じ`buildUsageRows()`を使い、`USAGE_LIMITS`の値だけ切り替える設計にして表示ロジックの重複を排除
- **教訓**：複数機能に同じ仕組み（利用上限）を導入したら、ユーザーが状況を確認できるUIも全機能分そろえること。1機能だけ作って終わりにすると「他の機能はどうなってるのか分からない」という不透明感が残る。

### tavera-fridge-scanで明らかに認識できるはずの画像が「認識できませんでした」になる問題（v1.15.1）

- **症状**：食材がはっきり写った写真（卵・牛乳・チーズ・野菜・果物・肉類など）でも「食材を認識できませんでした。別の写真を試してください。」と表示されることがある、とユーザーから報告。
- **判明した根本原因**：`tavera-fridge-scan`は、`tavera-kyushoku`で過去に発見・修正した2つの既知の問題が**未適用のまま**だった。
  1. **Gemini呼び出しにリトライ機構が無い** — レート制限(429)が発生してもそのまま失敗扱いになっていた（`tavera-kyushoku`・`tavera-suggest`にはv17で実装済みだったが、`tavera-fridge-scan`には一度も適用されていなかった）
  2. **thinkingトークン消費への対策が無い** — `maxOutputTokens: 512`のままthinking無効化(`thinkingConfig.thinkingBudget: 0`)もしておらず、内部思考にトークンを消費されて実際の出力が削られる可能性があった（`tavera-kyushoku`はv20でこの対策をしていたが、`tavera-fridge-scan`は未対応）
  3. **Geminiのエラー詳細を一切診断していない** — `result.candidates?.[0]?.content?.parts?.[0]?.text || "[]"`で常に`"[]"`にフォールバックしていたため、Geminiが本当に「食材なし」と判断したのか、API側のエラー（レート制限等）で何も返せなかったのかを区別できず、すべて「認識できませんでした」という同じメッセージになっていた
- **解決策（v5）**：`tavera-kyushoku`と同じ対策を移植
  1. `callGeminiWithRetry()`を追加（429時に1.5秒→3秒のバックオフで最大3回リトライ）
  2. `thinkingConfig: { thinkingBudget: 0 }`を追加、`maxOutputTokens`を512→1024に増量
  3. テキストが空の場合は`result.error`/`result.promptFeedback`を診断し、レート制限なら「AI解析の利用が集中しているため...」、それ以外なら「AIが画像を解析できませんでした。もう一度お試しください。」と、原因に応じたメッセージを返すように変更
  4. 配列抽出後も空だった場合（本当に食材が見つからなかった/パース失敗）は`finishReason`と`rawPreview`をレスポンスに含めてログ・デバッグしやすくした（フロント表示は従来通り「別の写真を試してください」のまま、ユーザーには技術的詳細を見せない）
- **教訓**：同じGemini呼び出しパターンを複数のEdge Functionで使っている場合、1つの関数で発見した不具合・対策は**他の同様の関数にも横展開して確認する**こと。`tavera-kyushoku`の対策だけ覚えていて`tavera-fridge-scan`に適用し忘れていたのが今回の根本原因。今後Gemini呼び出しを新規実装する際は、この2機能の最新コードをテンプレートとして使うこと。

