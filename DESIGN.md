# Tavera 設計書・引き継ぎ書

**バージョン**: 1.22.0
**最終更新**: 2026-06-30
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
| `TAVERA_STRIPE_PRICE_ID` | `price_1TmtslBNAV5e5rhcf4Wxvphw`（本番・月払い） |
| `TAVERA_STRIPE_YEARLY_PRICE_ID` | `price_1TngeRBNAV5e5rhc8CHzqEUT`（本番・年払い・¥3,800/年）**要Supabase Secret登録** |
| `TAVERA_STRIPE_WEBHOOK_SECRET` | `whsec_8x4LMUX008s0rlDd99oidTQBjn6EzDCZ`（本番） |
| `SUPABASE_SERVICE_ROLE_KEY` | 既存 |

### Edge Functions

| 関数名 | 用途 | JWT | モデル |
|--------|------|-----|--------|
| tavera-suggest | AI献立提案・プラン判定・利用回数制限 | オン | claude-haiku-4-5 |
| tavera-checkout | Stripe Checkout Session生成 | オン | - |
| tavera-webhook | Stripeイベント受信・DB更新（署名検証あり） | オフ | - |
| tavera-portal | Stripeカスタマーポータルセッション生成 | オン | - |
| tavera-kyushoku | 給食献立表の画像/PDF解析（v24・dishes+ingredients+allergenHits(allergen,reason)・URLモード内部fetch対応・429リトライ＋UA偽装＋マジックバイト判定＋response_schemaでJSON構造強制＋thinking無効化＋認証/利用回数制限・アレルゲン検出＋判断理由対応） | オン | gemini-2.5-flash |
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
| usage_limit_overrides | jsonb | 機能別の利用上限オーバーライド（v1.16.0追加）。`{"suggest":99999,"kyushoku":30,"fridge":100}`のように機能名キーで個別の月次上限を上書き。キーが無い機能はプラン標準値（free/premium）にフォールバック。テストユーザーの上限緩和・特定ユーザーへの優待などに使用 |

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

### 管理用RPC（すべてSECURITY DEFINER・呼び出し元のメールがmstd0520@gmail.comでなければ例外を投げてブロック）
| 関数名 | 用途 |
|---|---|
| `admin_get_all_users()` | 全ユーザー一覧（plan・機能別の今月利用回数・usage_overridesを含む。v1.16.0で拡張） |
| `admin_update_plan(target_user_id, new_plan)` | プラン変更（v1.16.0新設）。**重要**：`menu_members`のRLSは`id = auth.uid()`のみ許可しており、admin（自分以外のユーザー）の行を直接UPDATEすることはできない。以前は`admin.html`から直接`db.from('menu_members').update(...)`していたが、これは他ユーザーに対しては本来RLSで弾かれるはずだった不具合。本RPC（SECURITY DEFINERでRLSをバイパス）に置き換えて修正済み |
| `admin_set_usage_overrides(target_user_id, overrides)` | 機能別利用上限オーバーライドの設定・解除（v1.16.0新設）。`overrides`に`null`を渡すと解除（プラン標準値に戻る） |
| `admin_reset_usage(target_user_id)` | 対象ユーザーの今月の利用回数（suggest/kyushoku/fridge全て）を0にリセット（v1.16.0新設） |

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
| Premium（月払い） | ¥480/月 | 月300回・1日30回 |
| Premium（年払い） | ¥3,800/年（月あたり約¥317・34%OFF） | 同上 |

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

### 機能（ユーザー管理セクション、v1.16.0で利用上限の個別調整機能を追加）
- サマリー：総ユーザー数・Premiumユーザー数・今月のAI利用回数
- ユーザーカード：メール・登録日・プラン・機能別の今月利用回数（💬AI相談／📋献立取込／📷食材取込）・世帯名
- プラン変更（Free↔Premium）：`admin_update_plan` RPC経由
- **🧪 テスターにする**：対象ユーザーの3機能すべての上限を99999に一括設定（実質無制限）。テストユーザーへの優待に使用
- **↺ 今月の利用をリセット**：対象ユーザーの今月の利用回数（3機能すべて）を0に戻す。上限到達者に追加で使わせたい場合などに使用
- **機能別の上限を個別に上書き**：AI相談／献立取込／食材取込それぞれに数値を入力して「保存」すると、その値がプラン標準値より優先される（`usage_limit_overrides`）。空欄で保存するとその機能は標準値に戻る。「解除」ボタンで一括クリアも可能
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
- **共有JSのキャッシュ**: `js/auth.js`・`js/supabase.js`・`js/menu-log.js`を変更したら、読み込んでいる8ファイル（admin/history/home/index/kyushoku/log/settings/suggest.html）の`<script src="js/xxx.js?v=YYYYMMDD">`のバージョン文字列を当日の日付に更新すること。しないと古いJSがキャッシュされたまま新しいEdge Function/データ形式と食い違ってエラーになる（v1.18.2で実際に発生）

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
- [x] **記録ハードルの低減（「前日と同じ」ボタン）** ✅ v1.20.0 — log.htmlの新規記録時に前日の同じ食事区分のログがあれば自動表示。タップで料理名・食材・メモ・評価を一括コピー。
- [x] **LP全面改修（給食インポートを主訴求に）** ✅ v1.18.3 — ヒーローバッジ・サブコピーを給食×アレルギー訴求に。#kyushokuセクション新設。featuresグリッド先頭に給食カード追加
- [x] **買い物リスト自動生成** ✅ v1.19.0 — home.htmlに「🛒 今週の買い物リスト」セクション追加。今週7日分のingredients集約→冷蔵庫食材を除外→チェックリスト表示→クリップボードコピー
- [x] **「前日と同じ」ヒントボタン** ✅ v1.20.0 — log.htmlの新規記録時に前日の同じ食事区分のログがあれば自動表示。タップで料理名・食材・メモ・評価を一括コピー
- [x] **年払いプラン追加** ✅ v1.21.0 — Stripe年払いPrice作成（¥3,800/年・price_1TngeRBNAV5e5rhc8CHzqEUT）。tavera-checkoutにbillingCycleパラメータ追加。settings.htmlに月払い/年払いトグルUI。index.htmlLP料金セクションにトグル追加
- [x] **年払いLP全体訴求** ✅ v1.21.1 — ヒーロー下に「月317円〜」アンカー。料金カードにCTAボタン。最下部CTAに年払いバナー追加
- [x] **kyushoku.htmlヘッダー誤字修正** ✅ v1.21.2 — 「&#32231;食」→「給食」（文字参照の誤りで「緒食」と表示されていた）
- [ ] Flowra連携（食費データと連動した予算考慮の献立提案）
- [ ] iOSネイティブアプリ（Webで定着確認後）

---

*このドキュメントはClaudeとのセッション間の文脈維持のために随時更新する。*

---

### LP全面改修・給食インポートを主訴求に変更（v1.18.3）

- **変更内容**：
  1. ヒーローバッジを「🍳 家族の献立をもっとかんたんに」→「🍱 給食とかぶらない夕食を、AIが自動提案」に変更
  2. ヒーローのサブコピーを給食×アレルギー訴求に変更（「冷蔵庫の食材〜」→「給食献立表を写真で撮るだけ〜」）
  3. `#kyushoku` セクションをAIセクション（`#ai`）の直前に新設。写真/PDF取込・アレルギー自動チェック・夕食かぶり防止の3点を訴求するモックアップUI付き
  4. `#features` グリッドの先頭に給食カードを追加（「人気機能」バッジ付き・`feature-card-highlight`クラス）
- **理由**：給食インポートはTaveraの最大の差別化機能でありライバル不在の領域。子育て世帯への訴求として最も強いため、ファーストビュー近くに前出しした
- **ナビ**：headerの`<nav>`には`#kyushoku`リンクは追加していない（既存ナビ項目が増えすぎるため。必要であれば別途追加）

### 買い物リスト自動生成（v1.19.0）

- **場所**：`home.html` の「また食べたいランキング」セクションの下に「🛒 今週の買い物リスト」セクションを追加
- **ロジック**：
  1. 今日〜6日前（7日分）の献立ログを`getLogsByDate()`で取得
  2. 各ログの`ingredients`配列を展開・集約（使用頻度順にソート）
  3. `getFridgeItems()`で冷蔵庫食材を取得し、リストから除外
  4. 残った食材を「買い物が必要な食材」としてリスト表示
- **UI**：
  - チェックボックス形式：タップで購入済みマーク（取り消し線＋淡色化）
  - `「↺ 更新」`ボタンで再生成（冷蔵庫食材を追加した後に使う想定）
  - `「📋 リストをコピー」`でクリップボードへ（「🛒 今週の買い物リスト
・食材名
...」形式）
  - メタ表示：「N品 · 冷蔵庫にM品あり」
- **空状態**：
  - 今週ログが空 → 「献立を記録すると食材リストが自動生成されます」
  - ingredientsがすべて空 → 「今週の献立に食材情報がありません。献立記録時に食材を入力すると表示されます。」
  - 全品冷蔵庫に揃っている → 「今週の食材は冷蔵庫にすべて揃っています 🎉」
- **init()**: `renderShoppingList()`を`renderLikedList()`の後に追加
- **注意点**：ingredientsに情報がある献立ログが少ないと空になる。AI提案経由で記録した場合は食材が入るが、手動記録でingredients未入力の場合は対象外

### 「前日と同じ」ヒントボタンを追加（v1.20.0）

- **場所**：`log.html` の料理名inputと使用食材の間
- **表示条件**（すべて満たす場合のみ）：
  - 新規記録モード（`isEditMode`が`false`）
  - AI提案・URLパラメータ経由でない（`dish`/`ingredients`/`memo`パラメータが空）
  - 既存ログがない（`existingLogId`が`null`）
  - 前日の同じ食事区分に料理名つきのログが存在する
- **UI**：`「↩ 前日と同じ: [料理名]」` という丸ボタン。料理名は最大幅160pxでテキスト省略（ellipsis）
- **動作**：タップで前日ログの料理名・食材・メモ・評価を一括フォームにセット → ヒントボタンを非表示
- **再チェックタイミング**：init()後・朝昼夜タブ切替・日付変更（それぞれ前日の対応区分を再取得）
- **変数**：`yesterdayLog`（モジュールスコープ）に前日ログを保持。`null`のときはボタン非表示
- **`checkYesterdayHint(dateStr, mealType)`**：前日日付を計算→`getLogsByDate()`で取得→`mealType`一致を探す
- **`applyYesterday()`**：`yesterdayLog`の内容をフォームに反映→ヒント非表示
- **教訓（設計判断）**：「昨日と同じ」ではなく「前日と同じ」という命名にしたのは、日付を変えて過去の日付に記録する場合も自然に「選んだ日の前日」を参照するため。固定で「昨日（今日-1日）」を参照すると日付を変えた際に意図と食い違う。

### 年払いプラン追加（v1.21.0）

#### Stripe
- 年払いPrice作成済み（Stripe MCP経由）：`price_1TngeRBNAV5e5rhc8CHzqEUT`（¥3,800/年・本番・livemode）
- 商品は月払いと同じ `prod_UcbnVkrtra20TH`

#### **⚠️ 必須作業：Supabase Secretに追加**
Supabaseダッシュボード → Edge Functions → Secrets で以下を追加：
```
TAVERA_STRIPE_YEARLY_PRICE_ID = price_1TngeRBNAV5e5rhc8CHzqEUT
```
これを追加してから `tavera-checkout` をデプロイすること。追加前にデプロイしても年払いは動作しない。

#### tavera-checkout（更新）
- `billingCycle`パラメータ（`"monthly"` | `"yearly"`）を受け取り、対応するPrice IDを選択
- `monthly`（デフォルト）→ `TAVERA_STRIPE_PRICE_ID`
- `yearly` → `TAVERA_STRIPE_YEARLY_PRICE_ID`
- フォールバックなし（Secretが未設定だとエラーになるため、デプロイ前にSecret追加必須）

#### settings.html（更新）
- フリープランカードに月払い/年払いトグルUIを追加（`.billing-toggle`）
- 月払い：¥480/月　年払い：¥3,800/年（34%OFF・月あたり約¥317・¥1,960お得表示）
- `selectedBilling`変数でサイクルを管理、`startCheckout()`に`billingCycle`を渡す
- `selectBilling(cycle)` 関数で料金表示を動的に切替

#### index.html LP（更新）
- `#pricing`セクションのタイトル下に月払い/年払いトグルを追加
- 年払い選択時：価格を¥3,800/年に変更・「年払いで¥1,960お得」表示
- `lpSelectBilling(cycle)` 関数（インラインJS）

#### Webhookへの影響
- `tavera-webhook`は変更不要。年払いも月払いも `customer.subscription.created/updated` イベントで同じ処理（`plan_expires_at`に次回更新日が入る。年払いなら1年後の日付）

#### 価格根拠
- 月払い ¥480 × 12 = ¥5,760
- 年払い ¥3,800 = 34%引き（LTVは下がるがチャーン防止効果で補う想定）
- 原価 ¥169/月 × 12 = ¥2,028/年 → 年払い粗利 ¥1,772（利益率46.6%）

### LP全面改修・給食インポートを主訴求に（v1.18.3）→ 買い物リスト（v1.19.0）→ 前日と同じボタン（v1.20.0）→ 年払いプラン（v1.21.0〜v1.21.2）

#### v1.18.3 LP全面改修
- ヒーローバッジを「🍱 給食とかぶらない夕食を、AIが自動提案」に変更
- ヒーローサブコピーを給食×アレルギー訴求に変更
- `#kyushoku` セクションをAIセクション直前に新設（写真/PDF取込・アレルギー自動チェック・夕食かぶり防止の3点・モックアップUI付き）
- `#features` グリッド先頭に給食カードを追加（「人気機能」バッジ付き）

#### v1.19.0 買い物リスト自動生成
- `home.html` の「また食べたいランキング」下に「🛒 今週の買い物リスト」セクションを追加
- 今日〜6日前（7日分）の献立ログを取得→`ingredients`を展開・集約（使用頻度順）→冷蔵庫食材と照合して除外
- チェックボックスでタップ購入済みマーク・「↺ 更新」ボタン・「📋 リストをコピー」でクリップボードへ
- `init()`に`renderShoppingList()`を追加
- **注意**：手動記録でingredients未入力の献立は対象外。AI提案経由で記録すると食材が入る

#### v1.20.0 「前日と同じ」ヒントボタン
- `log.html` の料理名inputと使用食材の間に「↩ 前日と同じ: [料理名]」ボタンを追加
- 表示条件：新規記録モード・AI提案/URL経由でない・既存ログなし・前日の同じ食事区分にログあり
- `yesterdayLog`変数（モジュールスコープ）・`checkYesterdayHint(dateStr, mealType)`・`applyYesterday()`の3点セット
- タブ切替・日付変更時も再チェック。「前日」は「選んだ日の前日」（固定で昨日ではない）

#### v1.21.0 年払いプラン追加
- **Stripe**：年払いPrice作成（`price_1TngeRBNAV5e5rhc8CHzqEUT`・¥3,800/年・本番livemode・`prod_UcbnVkrtra20TH`）
- **Supabase Secret**：`TAVERA_STRIPE_YEARLY_PRICE_ID = price_1TngeRBNAV5e5rhc8CHzqEUT` 追加済み
- **tavera-checkout**（v20）：`billingCycle`パラメータ（`"monthly"` | `"yearly"`）を追加。`TAVERA_STRIPE_YEARLY_PRICE_ID` Secretを参照
- **settings.html**：フリープランカードに月払い/年払いトグルUI（`.billing-toggle`）を追加。`selectedBilling`変数・`selectBilling(cycle)`関数。年払い選択時に「月あたり約¥317・¥1,960お得」表示
- **index.html LP**：`#pricing`セクションに月払い/年払いトグル追加。`lpSelectBilling(cycle)`関数

#### v1.21.1 年払いLP全体訴求
- ヒーローCTA下：「✨ プレミアム年払いなら月あたり317円〜 → 料金を見る」アンカーテキスト追加（クリックで#pricingにスクロール＋年払いタブに自動切替）
- 料金カードプレミアム枠：「今すぐ無料で始める →」CTAボタン追加（年払い選択時にテキスト変化）
- 最下部CTAセクション：年払いバナー追加（「¥1,960お得」・「年払いを選ぶ」ボタン）

#### v1.21.2 kyushoku.htmlヘッダー誤字修正
- `<span class="header-title">&#32231;食インポート</span>` → `<span class="header-title">給食インポート</span>`
- `&#32231;`（緒）が`給`（&#32993;）の代わりに入っていた。スクリーンショットで発覚

#### マーケティング施策（このセッション）
- **note記事投稿**：「今日の夕飯どうする？に疲れた妻のために、夫がAI献立アプリを作った話」
  - エンジニア層（iPhone+Claude+GitHub APIでSaaS開発）×子育て層（給食アレルギー・かぶり問題）の両方に訴求
  - X連携投稿済み（@dat0925）
  - ハッシュタグ：#個人開発 #子育て #アレルギー #AI #献立 #Supabase

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

### テストユーザー向けの利用上限カスタマイズ機能を実装（v1.16.0）

- **背景**：テストユーザーにプレミアムプランを無料提供しているが、AI機能の上限（300回/30回/100回）に近づいた場合に手動でリセットしたり、個別に上限を引き上げたりしたいという要望。

#### DBスキーマ
- `menu_members.usage_limit_overrides`（jsonb）を新設。`{"suggest":99999,"kyushoku":30,"fridge":100}`の形で機能別に上限を上書き。キーが存在しない機能はプラン標準値にフォールバック

#### 重要な発見：admin.htmlの既存「プラン変更」機能がRLSで本来失敗するはずだった
- `menu_members`のRLSポリシーは`members_self_update`（`id = auth.uid()`）のみで、**自分以外のユーザーの行はUPDATEできない**設定になっていた
- それにもかかわらず、既存の`changePlan()`は`db.from('menu_members').update(...).eq('id', userId)`と**直接テーブル更新**していた。admin（mstd0520@gmail.com）が他ユーザーのプランを変更しようとすると、本来このRLSに阻まれて失敗するはずだった実装ミスが、今回の調査で発覚した
- **解決策**：admin専用のSECURITY DEFINER RPC（`admin_update_plan`・`admin_set_usage_overrides`・`admin_reset_usage`）を新設し、RPC内で呼び出し元のメールが`mstd0520@gmail.com`かを検証してからRLSをバイパスして更新する方式に統一。`changePlan()`もこのRPC経由に修正した
- **教訓**：管理画面から「他ユーザーのデータを書き換える」操作を実装する際は、素朴に`db.from(...).update(...)`を使うとRLSポリシーに阻まれることが多い（むしろ阻まれるのが正しい）。SECURITY DEFINER RPC＋呼び出し元チェックという形で、明示的に権限を分離するのが正しいパターン。今回のように「一見動いていそうに見えるが実際は失敗していたかもしれない」コードは、関連機能を追加するタイミングで気づくことが多いので、似た処理を追加する際は既存コードのRLS前提も合わせて見直すこと。

#### Edge Function側の対応
- `tavera-suggest`・`tavera-kyushoku`・`tavera-fridge-scan`の3関数すべてで、`menu_members`取得時に`usage_limit_overrides`も取得し、`member.usage_limit_overrides?.[FEATURE]`が数値であればそれを優先的に上限として使用するように変更
- `tavera-suggest`は月次・日次の2種類の上限を持つため、オーバーライドがある場合は両方に同じ値を適用（日次の壁でブロックされてテスターが使えない、という事態を防ぐため）

#### admin.html側の対応
- ユーザーカードに機能別の今月利用回数（💬AI相談／📋献立取込／📷食材取込）を表示（オーバーライドがある場合は`使用数/上限`の形で表示）
- 「🧪 テスターにする」ボタン：3機能の上限を99999に一括設定
- 「↺ 今月の利用をリセット」ボタン：当月の利用回数（3機能とも）を0に戻す
- 機能別の数値入力＋「保存」ボタンで個別の上限を設定可能。「解除」ボタンで標準値に戻す

### AI提案をスクロールしようとするとPull-to-Refreshが誤発動し内容が消える問題（v1.16.1）

- **症状**：`suggest.html`でAI提案の結果を読もうとチャット欄を下にスワイプ（指を下方向にドラッグして上の内容を見る動き）すると、Pull-to-Refreshが反応してしまい、`init()`が呼ばれてチャット内容が welcome 画面にリセットされ、提案結果が消えてしまう。
- **原因**：`js/auth.js`の`initPullToRefresh()`は「ページ最上部にいるか」を`window.scrollY === 0`だけで判定していた。しかし`suggest.html`の`.chat-messages`は`flex:1; overflow-y:auto;`で**ページ自体（window/body）ではなく内部のdivだけがスクロールする**レイアウトのため、チャット欄をどれだけスクロールしても`window.scrollY`は常に0のままになる。そのため、チャット欄内を下方向にドラッグするとPTRの`touchstart`が常に`pulling=true`になり、72px以上ドラッグすると`onRefresh()`（`init()`）が発火していた。
  - `home.html`・`history.html`・`settings.html`は内部に`overflow-y:auto`なコンテナを持たず、ページ自体（window）がスクロールする構成のため、この問題は発生していなかった（影響範囲は`suggest.html`のみ）。
- **解決策**：`initPullToRefresh()`を以下のように修正。
  1. `touchstart`時、タッチした要素の祖先をたどり、実際にスクロール可能な内部コンテナ（`overflow-y:auto`/`scroll`かつ`scrollHeight > clientHeight`）を探す（`findScrollableAncestor()`）
  2. `window.scrollY === 0`に加えて、**その内部コンテナが見つからない、または見つかった場合はその`scrollTop`も0**であることを確認してから`pulling = true`にする
  3. `touchmove`中に内部コンテナの`scrollTop`が0より大きくなった（＝そのコンテナ内をスクロールし始めた）場合はpullingを中断する
  4. `home.html`等のように内部スクロールコンテナを持たないページでは`findScrollableAncestor()`が`null`を返すため、従来通りの挙動のまま変化なし
- **教訓**：Pull-to-Refreshのような「ページ最上部での操作」を検出する処理を複数画面で共通化する場合、各画面のレイアウトが本当に**window/bodyをスクロールしているか**を確認すること。flexレイアウト＋内部`overflow-y:auto`でコンテンツ領域だけをスクロールさせる構成（チャットUIなどでよく使う）の画面では`window.scrollY`は機能しないため、対象のスクロールコンテナのscrollTopを直接見る必要がある。

### AI提案を記録する際に日付・朝昼夜を選べるモーダルを追加（v1.17.0）

- **背景**：従来、suggest.htmlで「📝 {料理名}を記録する」を押すと、`date=今日`のみを渡してlog.htmlに直接遷移し、`meal`パラメータを渡していなかった。log.html側は`meal`パラメータが無い場合**常に「夜」固定**にフォールバックしていたため、時間帯に関わらず必ず「今日の夜」に記録される動きになっていた。さらに、すでに「今日の夜」が登録済みだった場合、既存データがAI提案の内容（料理名・食材・メモ）を静かに上書きしてしまい、提案内容が消えるという問題があった（ユーザーからの質問で発覚）。

#### 実装
- `js/menu-log.js`に`getDefaultMealSlot()`を追加。現在時刻から「次に記録するのに最も近い」食事区分・日付を推定する
  - 0:00〜8:59　→ 今日の朝
  - 9:00〜13:59　→ 今日の昼
  - 14:00〜20:59　→ 今日の夜
  - 21:00〜23:59　→ 翌日の朝（夜も終わっているため次は翌朝という想定）
- 合わせて`toDateStr()`のタイムゾーンバグも修正。`date.toISOString().split('T')[0]`はUTCに変換してから日付部分を取るため、日本時間0:00〜8:59台に呼ぶと**前日の日付**になってしまっていた（`getDefaultMealSlot()`の早朝判定と直接関わるため、このタイミングで合わせて修正）。`getFullYear()`/`getMonth()`/`getDate()`でローカルの年月日を直接組み立てる方式に変更
- `suggest.html`：「📝 {料理名}を記録する」ボタンの動作を変更
  - 直接log.htmlへ遷移する代わりに、日付（`<input type="date">`）と朝昼夜タブを選べる記録モーダル（`history.html`と同じ`.modal-overlay`/`.modal-sheet`パターンを再利用）を開く
  - モーダルを開いた時点の既定選択は`getDefaultMealSlot()`の結果
  - 日付・朝昼夜タブを変更するたびに`getLogsByDate()`でその日のログを取得し、すでに登録済みの区分には朝/昼/夜タブに「済」バッジを表示。選択中の区分が登録済みの場合は「⚠️ ◯月◯日の夜にはすでに「××」が登録されています。記録すると上書きされます。」という警告文をモーダル内に表示する
  - 「記録する」を押すと、選んだ`date`・`meal`を明示的なURLパラメータとしてlog.htmlに渡す
- `log.html`：2点修正
  1. URLに`dish`/`ingredients`/`memo`パラメータが付いている場合（AI提案からの遷移）は、既存ログがあってもそれらのフィールドを既存データで上書きしないように変更（`loadExisting()`に`presetFlags`を渡し、フィールドごとに優先度を制御）。手動でlog.htmlを開いて既存ログを編集する通常フロー（パラメータ無し）は従来通り「既存データ優先」のまま変更なし
  2. パラメータ無しでlog.htmlを直接開いた場合（ボトムナビの＋ボタン等）の既定値も、固定の「今日の夜」から`getDefaultMealSlot()`ベースに変更。記録ハードル低減ロードマップ（「ホームからワンタップ」等）にも活用できる想定
- **教訓**：AI提案やボトムナビからの「新規記録」フローを作るときは、(1)「いつの・どの食事区分として保存するか」をどう決めるか（固定値で決め打ちにすると、ユーザーの直感（時間帯に応じた近い食事区分）と食い違う）、(2)「すでに同じ枠にデータがある場合どう振る舞うか」（既存データ優先で静かに上書き・消失させない）の2点を最初から設計しておくこと。今回は両方とも後から発覚したため、ユーザーからの「タップすると何が起きるのか」という質問が無ければ気づきにくかった。

### AI提案の会話が画面遷移後に消える問題を修正（記載漏れ・実際はv1.17.0の一部としてリリース済み）

- **症状**：suggest.htmlで別画面に移動して戻ってくると、毎回`init()`が再実行されて会話がwelcome画面にリセットされ、提案結果が消えていた（ユーザーからの指摘で発覚）。
- **解決策**：
  - `chatMessages`と直近の利用回数バー状態を、ユーザーIDごとのキーで`localStorage`に保存（`tavera_suggest_chat_<user.id>`）。アプリを完全に閉じても次回起動時まで残る
  - `init()`は保存済み会話があればそれを復元（assistantの返信は`renderAssistantReply()`で記録ボタン・食材プレビュー・アレルギー警告まで再描画）し、無ければ従来通りwelcome表示
  - アシスタント返信の描画ロジックを`renderAssistantReply(reply, pushToHistory)`として`sendMessage()`から分離し、復元時にも再利用できるようにした
  - 明示的に会話をリセットできる「🆕 新しい相談を始める」リンクを`.chat-page`内に追加（確認ダイアログ付き）。`.app-header .header-right`/`.kyushoku-btn`はiPad/PCレイアウトで`display:none!important`になる既存ルールがあるため、それに巻き込まれないよう独立したツールバー（`.chat-toolbar`）として配置
  - Pull-to-Refreshのコールバックは変更なし。`init()`が保存済み会話を復元するようになったため、PTRも会話を消さない「データだけ再取得するソフトリフレッシュ」になった

### 給食取込時にアレルギー検出・警告を追加（v1.18.0）

- **背景**：子にアレルギーがある場合の機能設計について相談。優れたプロダクトデザイナーならどう設計するか、「機能の高度さ」と「記録を続けられること（継続率）」を両立させる方針を検討した。

#### 設計方針（3接点で警告の強さを変える）

| 接点 | 誰が選んだ料理か | リスク | 方針 |
|---|---|---|---|
| 給食取込 | 学校（親は選べない） | 高（気づく手段がこれだけ） | 強め・目立つ表示だが**登録は止めない** |
| 手動記録(log.html) | 親自身（料理した本人） | 低（すでに避けているはず） | 既存のまま（控えめなインライン注記のみ）。これ以上強めない |
| AI提案(suggest.html) | AI | 中（提案前に防げる） | 既にプロンプトでアレルギー考慮＋事後チェックの二重構造あり。今回は対象外 |

最重要原則：**どの接点でも保存・登録を物理的にブロックしない**。誤検知で保存できない事態が起きると、機能ごと信用されなくなり記録自体をやめるリスクがあるため、「教えるが、決めるのは親」という距離感を徹底する。

#### 実装（給食取込＝今回のリリース対象）

- `tavera-kyushoku`（v23）：リクエストに家族のアレルゲン一覧`allergies`（フロントから送信）を受け取れるように変更。指定されている場合のみ、Geminiに「食材一覧に明記がなくても、料理名から一般的に含まれると判断できる場合はallergenHitsに含めること（例:「うどん」→小麦、「プリン」→卵・乳）」という指示とレスポンス項目を追加。アレルゲン未指定（家族メンバー未設定）の場合はプロンプト・レスポンス形式とも完全に従来通り
- `js/menu-log.js`：`mapAllergensToMembers()`（AIが返したアレルゲン名配列を家族メンバーに割り当てる）・`dedupeAllergyHits()`（重複除去）を追加
- `kyushoku.html`：
  - `init()`で家族メンバーを読み込み、世帯の登録アレルゲン一覧をEdge Functionに送信
  - 解析結果は①Geminiの`allergenHits`（料理名からの推測・食材表記に無い暗黙のアレルゲンも拾える）と②食材・料理名の文字列一致（`checkAllergies`、保険のダブルチェック）の両方をマージして判定（二重構造）
  - アレルギーの可能性がある日は、一括登録で見落とさないよう**既定でチェックを外す**（「すべて選択」で上書き可能・登録自体は止めない）
  - 該当日のカードに「⚠️ 太郎：卵が含まれる可能性があります」のように対象の家族名・アレルゲン名を表示。結果欄の先頭に、チェックを外している理由を説明する注記を一度だけ表示

#### 判断理由(reason)の追加表示（v1.18.1）

ユーザーから「警告は出たが何を根拠に判断したのか分からない」とのフィードバックがあり追加。

- `allergenHits`を文字列配列から`{allergen, reason}`のオブジェクト配列に変更。Geminiには「食材一覧のどの記載からそう判断したか、記載が無い場合は一般的な調理法からの推測根拠」を一文で返すよう指示
- `checkAllergies()`（文字列一致による保険のダブルチェック）にも、どの記載にマッチしたかを示す`reason`を追加
- `mapAllergensToMembers()`は旧形式（文字列配列）が来ても後方互換で動作するようガード（`typeof`で分岐）
- 表示は「⚠️ 太郎：豆乳が含まれる可能性があります」の下に「└ みそ汁に『豆乳』と記載されているため」のように理由を1行追加。複数アレルゲンがヒットした場合は、従来のメンバーごとの一括表示（理由を出せない）からアレルゲンごとの個別表示に変更

#### 既知の制限・今後の検討事項

- 一覧で料理名を手動編集（✏️）した場合、編集後のテキストに対してアレルギー判定は再実行されない（編集前の判定がそのまま表示され続ける）
- `allergenHits`・判定結果は`menu_logs`には保存していない（インポート時の確認用途のみ）。履歴(history.html)側で後から「この日は卵の可能性があった」と振り返れるようにするかは別途検討
- 手動記録(log.html)・AI提案(suggest.html)は今回スコープ外（設計方針の表の通り、現状の強度が適切と判断）

### 共有JS（js/auth.js・js/supabase.js・js/menu-log.js）のキャッシュにより新旧不整合エラーが発生（v1.18.2）

- **症状**：`allergenHits`の形式変更（v1.18.1）の直後、給食取込でエラー`a.includes is not a function`が発生。
- **原因**：各HTML自体には`Cache-Control: no-cache`のmetaタグがあり常に最新化されるが、`<script src="js/menu-log.js">`にはバージョン指定が無く、ブラウザ（またはCDN）にキャッシュされた**古い**`js/menu-log.js`が読み込まれることがあった。古い`mapAllergensToMembers()`は`allergenHits`が文字列配列である前提で`a.includes(allergen)`を呼んでいたが、Edge Function側は既に`{allergen, reason}`のオブジェクト配列を返すようになっていたため、`a`（オブジェクト）に`.includes`が無くエラーになった。
- **解決策**：`admin/history/home/index/kyushoku/log/settings/suggest.html`の計8ファイルで、`js/supabase.js`・`js/auth.js`・`js/menu-log.js`の読み込みに`?v=20260629`というバージョンクエリを付与。クエリ文字列が変わるとブラウザはキャッシュを使わず新しいファイルとして取得し直す。
- **運用ルール（今後必ず守ること）**：`js/auth.js`・`js/supabase.js`・`js/menu-log.js`のいずれかを変更してpushする際は、上記8ファイル全てで`?v=`の値を当日の日付（`YYYYMMDD`）など新しい値に更新すること。HTML自体（home.html等）を変更しただけのときは不要。`grep -rn 'js/menu-log.js?v=' *.html`等で現状のバージョン文字列を確認できる。
- **教訓**：「ページのHTMLはキャッシュしない設定にしてあるから大丈夫」と思っていても、`<script src>`で読み込む共有JSは別物としてキャッシュされる。複数ページで共有するJSファイルを頻繁に更新するなら、最初からバージョンクエリ（またはファイル名にハッシュを含める運用）を入れておくべきだった。
- ユーザーにより動作確認済み（2026-06-29）。

---

## 16. マーケティング戦略（有料会員1000人達成プラン）

> このセクションはClaudeとのセッションで策定した戦略メモ。実行時に参照・更新すること。

### 現状の強み（2026-06-30時点）

| 強み | 詳細 |
|---|---|
| **給食×アレルギー連携** | 競合ほぼゼロの唯一機能。料理名から暗黙アレルゲンまで推測（例：「うどん」→小麦） |
| **ログ蓄積＋買い物リスト** | 献立→食材→買い物リストの自動生成まで一気通貫 |
| **Stripe本番稼働済み** | 年払い（¥3,800）まで実装済み。あとは送客するだけ |
| **LP給食訴求に改修済み** | v1.18.3でヒーローを「給食とかぶらない夕食を、AIが自動提案」に変更済み |

---

### 戦略の3本柱

#### 柱1：SNSバイラル（0→100人フェーズ）

**コンテンツ案（給食×アレルギーが最強ネタ）**

以下を動画でX（@dat0925）に投稿する：
1. 「給食の献立表を写真に撮って→アレルゲン自動警告」のデモ動画（20秒）
2. 「今週の夕食、給食とかぶってない？をAIが自動チェック」
3. 「卵アレルギーの子がいる家庭での使い方」（実体験ベース）

**推奨ハッシュタグ**：`#個人開発` `#子育て` `#アレルギー` `#AI` `#献立` `#給食` `#Supabase`

**招待ボーナス（要実装）**
- 招待した側・された側、双方にAI相談+5回/月をプレゼント
- `usage_limit_overrides` jsonbが既存のため、招待コード経由でDB更新するだけで実装可能

---

#### 柱2：SEOとコンテンツ（100→500人フェーズ）

**狙うキーワード（競合薄いロングテール優先）**

| キーワード | 理由 |
|---|---|
| 給食 アレルギー アプリ | ライバルほぼゼロ・ニーズ強 |
| 献立 給食 かぶらない | Taveraの訴求そのもの |
| 子供 アレルギー 献立 管理 | 検索者の課題が明確 |
| 献立アプリ 家族共有 | まだ取れる枠 |

**note記事の展開計画**
- 第1話（投稿済み）：「今日の夕飯どうする？に疲れた妻のために、夫がAI献立アプリを作った話」
- 第2話：「子供のアレルギーをアプリが自動チェックする仕組みを作った」
- 第3話：「給食×夕食のかぶり防止機能を実装した話（Gemini活用）」

---

#### 柱3：課金転換率の向上（500→1000人フェーズ）

**無料→有料の転換トリガー分析**

| 機能 | 無料上限 | 有料上限 | 転換力 |
|---|---|---|---|
| 給食取込 | 3回/月 | 30回/月 | ★★★ 毎月使うと2〜3ヶ月で上限。最強トリガー |
| AI相談 | 10回/月 | 300回/月 | ★★★ 30倍差。ヘビーユーザーが課金する |
| 食材取込 | 30回/月 | 100回/月 | ★★ 毎日使う人には壁になる |

**給食取込3回/月制限が最強の転換トリガー**：学校給食は毎月献立が変わる→毎月1回は使いたい→3回/月は2〜3ヶ月で上限到達。これが最も自然な課金理由。

**追加で実装すると効果的な施策**

| 施策 | 実装難度 | 効果 | 備考 |
|---|---|---|---|
| 上限到達時の誘導メッセージ強化 | 低 | 高 | 下記「今すぐできる改修」参照 |
| 招待ボーナス | 中 | 高 | `usage_limit_overrides`活用 |
| 週次サマリーPush通知 | 高 | 中 | PWA Push通知は実装コスト高め |

---

### 数値目標

| 時期 | 新規登録/月 | 累計登録 | 有料転換率 | 有料会員数 |
|---|---|---|---|---|
| 1ヶ月後 | 200 | 200 | 3% | 6 |
| 3ヶ月後 | 500 | 1,200 | 6% | 72 |
| 6ヶ月後 | 1,000 | 4,000 | 10% | 400 |
| 12ヶ月後 | 2,000 | 15,000 | 8% | 1,200 |

粗利目標：1,000人×¥311/月 = 月31万円。年払い比率が高まれば利益率46.6%で安定。

---

### 今すぐできる改修（優先順）

#### ① SNSに給食デモ動画を投稿（コスト0・時間30分）
「給食献立表→写真→アレルギー自動チェック」の画面録画をXに投稿。子育てアカウントにタグ付け。

#### ② 上限到達時の誘導メッセージ強化（実装1〜2時間）

**現在の文言**（tavera-kyushoku等）：
> 「今月の給食取り込み回数の上限（3回）に達しました。プレミアムプランなら月30回まで利用できます。」

**改善案**：
> 「今月の給食チェックを使い切りました（3/3回）。来月もお子さんの給食アレルギーを確認し続けるなら、プレミアムプランへ。月480円で月30回・年払いなら月317円」＋アップグレードCTAボタン

変更箇所：tavera-kyushoku・tavera-fridge-scan・tavera-suggestの429エラーメッセージ、およびsuggest.htmlの`showPaywall()`。

#### ③ LPヒーローにアレルギーを明示（実装2〜3時間）
現在のヒーローコピーは「給食とかぶらない夕食」訴求。ここに「アレルギー自動チェック」の文字を加えるとSEOとCVRの両方に効く。index.htmlの`#hero`セクションを修正。

---

### 実施記録（施策ごとに追記していく）

| 日付 | 施策 | 結果 |
|---|---|---|
| 2026-06-30 | 戦略策定 | 本セクション作成 |
| （随時追記） | | |

