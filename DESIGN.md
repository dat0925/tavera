# Tavera 設計書・引き継ぎ書

**バージョン**: 1.25.4
**最終更新**: 2026-07-10
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
| `TAVERA_LINE_CHANNEL_SECRET` | 登録済み・稼働確認済み（2026-07-09時点。LINE経由の献立記録・通知が実際に動作していることをユーザーが確認。以前の版で「要登録」としていたのは実態と合っていなかった古い記載） |
| `TAVERA_LINE_CHANNEL_ACCESS_TOKEN` | 登録済み・稼働確認済み（同上） |

### Edge Functions

| 関数名 | 用途 | JWT | モデル |
|--------|------|-----|--------|
| tavera-suggest | AI献立提案・プラン判定・利用回数制限 | オン | claude-haiku-4-5 |
| tavera-checkout | Stripe Checkout Session生成 | オン | - |
| tavera-webhook | Stripeイベント受信・DB更新（署名検証あり） | オフ | - |
| tavera-portal | Stripeカスタマーポータルセッション生成 | オン | - |
| tavera-kyushoku | 給食献立表の画像/PDF解析（v24・dishes+ingredients+allergenHits(allergen,reason)・URLモード内部fetch対応・429リトライ＋UA偽装＋マジックバイト判定＋response_schemaでJSON構造強制＋thinking無効化＋認証/利用回数制限・アレルゲン検出＋判断理由対応） | オン | gemini-2.5-flash |
| tavera-fridge-scan | 冷蔵庫写真→食材認識（v5・認証/利用回数制限＋429リトライ＋thinking無効化＋エラー診断） | オン | gemini-2.5-flash |
| tavera-comment-notify | 献立コメント投稿時にLINE Pushで他メンバーへ通知（アプリ→LINE） | オン | - |
| tavera-line-webhook | Tavera公式LINEのWebhook受信。友だち追加時の案内・連携コード受付・LINE返信をコメントとして記録＋他メンバーへ再通知（署名検証あり）。自動記録の確認メッセージにはクイックリプライで日付・食事区分の訂正ボタンを付与（v1.23.4） | オフ | - |

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
| line_user_id | text UNIQUE | LINE連携済みの場合のLINE userId（v1.23.0追加） |
| line_linked_at | timestamptz | LINE連携日時（v1.23.0追加） |

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

### menu_meal_comments（献立コメント・v1.23.0新設）
| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid PK | |
| household_id | uuid FK | |
| date | date | コメント対象の日付 |
| meal_type | text | breakfast / lunch / dinner |
| author_id | uuid FK→menu_members | 投稿者。LINE経由の場合もLINE連携済みメンバーのIDが入る |
| stamp | text | 定型スタンプキー（eating_out / side_only / tasty / thanks）。null可 |
| body | text | 自由記述。null可（ただしstampとbodyの両方nullは不可・CHECK制約あり） |
| source | text | 'app'（Tavera上で投稿）/ 'line'（LINE返信経由） |
| edited_at | timestamptz | 編集された日時（v1.23.2追加）。nullなら未編集。UIでは「（編集済み HH:MM）」として表示 |
| created_at | timestamptz | |

**RLS（v1.23.2でALLポリシーから4分割に変更）**：SELECT/INSERTは同じ`household_id`のメンバー全員に許可。UPDATE/DELETEは`author_id = auth.uid()`（投稿者本人）のみに限定。INSERTのWITH CHECKにも`author_id = auth.uid()`を追加し、他メンバーへのなりすまし投稿を防止（LINE経由の投稿はservice roleでRLSをバイパスするため対象外）。

**重要**：`menu_logs`と異なり日付＋食事区分のUNIQUE制約は無い（複数コメントが積み上がるスレッド形式）。また`menu_logs`が無くてもコメントだけ先に投稿できる（「今日は外食する」等、記録前の献立への先出し連絡に対応するため意図的にログと分離した設計）。

### menu_line_link_codes（LINEアカウント連携コード・v1.23.0新設）
| カラム | 型 | 説明 |
|--------|-----|------|
| code | text PK | 8桁のランダムコード（`generateLineLinkCode()`で発行、紛らわしい文字（0/O/1/I）を除いた32文字セットから生成） |
| member_id | uuid FK→menu_members | |
| expires_at | timestamptz | 発行から30分 |
| used_at | timestamptz | 使用済みになった日時。null＝未使用 |

### menu_line_contexts（LINE返信の文脈・v1.23.0新設）
| カラム | 型 | 説明 |
|--------|-----|------|
| member_id | uuid PK / FK→menu_members | |
| household_id | uuid FK | |
| date | date | 直近その人が話題にしていた献立の日付 |
| meal_type | text | 同・食事区分 |
| updated_at | timestamptz | |

LINEでのフリーテキスト返信が「どの日付・食事区分へのコメントか」を判定するための文脈テーブル。Push通知を送るたびに送信先の文脈を更新し、LINE側から返信があった時点で6時間以内の文脈が残っていればそれを使う。6時間を超えている場合は`getDefaultMealSlot()`相当のロジック（現在時刻から本日の朝/昼/夜を推定）にフォールバックする。RLSは有効化のみ（クライアント向けポリシー無し）で、Edge Function（service role）のみがアクセス可能。

### menu_shopping_dismissed（買い物リストの削除指定・v1.23.3新設）
| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid PK | |
| household_id | uuid FK | |
| name | text | 削除指定した食材名（`(household_id, name)`でUNIQUE） |
| dismissed_at | timestamptz | 削除した日時 |

買い物リストは「直近7日分の献立ログのingredients集計 − 冷蔵庫食材」で毎回動的に生成される揮発性の一覧のため、個別の行を直接管理していない。「削除」は該当食材名を本テーブルに記録し、`dismissed_at`が7日以内のものをリスト生成時に除外する形で実現している。7日を超えると献立ログの集計対象期間そのものがズレるため、古い削除指定も自然に無効化される（別途クリーンアップ処理は無い）。

### menu_ai_usage（AI利用回数・v1.24.0で世帯単位に変更）
| カラム | 型 | 説明 |
|--------|-----|------|
| household_id | uuid | 集計単位（v1.24.0追加）。**利用回数の上限判定・カウントはこちらが主キーの一部**。UNIQUE制約は`(household_id, month, feature)` |
| user_id | uuid | 直近そのカウントを実際に使ったメンバー（参考情報。nullable、集計キーではない） |
| month | text | YYYY-MM形式 |
| feature | text | 'suggest'（AI相談）/ 'kyushoku'（献立取り込み）/ 'fridge'（食材取り込み）。v1.13.0で追加 |
| count | int | 月次利用回数（成功時のみカウント）。**世帯内の全メンバーの利用が同じ行に合算される** |
| day_count | int | 当日利用回数（'suggest'のみ使用。kyushoku/fridgeは日次制限なし） |
| last_day | text | 最終利用日（'suggest'のみ使用） |

### 管理用RPC（すべてSECURITY DEFINER・呼び出し元のメールがmstd0520@gmail.comでなければ例外を投げてブロック）
| 関数名 | 用途 |
|---|---|
| `admin_get_all_users()` | 全ユーザー一覧（plan・機能別の今月利用回数・usage_overridesを含む。v1.16.0で拡張） |
| `admin_update_plan(target_user_id, new_plan)` | プラン変更（v1.16.0新設）。**重要**：`menu_members`のRLSは`id = auth.uid()`のみ許可しており、admin（自分以外のユーザー）の行を直接UPDATEすることはできない。以前は`admin.html`から直接`db.from('menu_members').update(...)`していたが、これは他ユーザーに対しては本来RLSで弾かれるはずだった不具合。本RPC（SECURITY DEFINERでRLSをバイパス）に置き換えて修正済み |
| `admin_set_usage_overrides(target_user_id, overrides)` | 機能別利用上限オーバーライドの設定・解除（v1.16.0新設）。`overrides`に`null`を渡すと解除（プラン標準値に戻る） |
| `household_has_premium(target_household_id)` | 世帯内に有効なプレミアムメンバーが1人でもいるかを判定（v1.24.0新設・SECURITY DEFINER）。ファミリープレミアムの中核ロジック。`tavera-suggest`/`tavera-kyushoku`/`tavera-fridge-scan`から共通利用 |
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
- 直接fetchできないCORSエラーの場合、URLをそのまま`tavera-kyushoku`に渡し、Edge Function側の内部fetchで取得する方式になっている（`pendingUrl`を`tavera-kyushoku`のリクエストボディに含めるだけで、フロントから独立したURL取得エンドポイントは呼んでいない）
- **2026-07-09調査で判明した齟齬**：`tavera-url-fetch`という同名のEdge Function自体はSupabaseに実際にデプロイ済み（version 8時点で存在）だが、リポジトリ内のどのHTML/JSからも呼び出されていない**未使用・孤立した関数**。以前の版では「未実装・必要になったら作成」と記載していたが誤り。実装当初はこの関数を使う設計だったが、最終的に`tavera-kyushoku`が自前でURLをfetchする方式に統合され、`tavera-url-fetch`だけが削除されずSupabase上に残った可能性が高い。実害は無いが、整理するなら削除候補

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
- **GitHub Pages / Jekyll**: リポジトリ直下に`.nojekyll`（空ファイル）を配置済み（v1.23.3）。無いとGitHub PagesがデフォルトでJekyll変換を経由し、素のHTML/JS構成のTaveraでは不要な処理でビルド失敗（`Page build failed`）を起こすことがある。**このファイルは削除しないこと**
- **GitHub Pages のデプロイ方式は「ブランチからデプロイ（legacy）」のまま維持すること**：GitHub Actions公式ワークフロー方式への切り替えは、以前試して「全然更新されない・エラーが出まくる」という悪い経験があるとのことなので**今後も提案・実施しない**。現状、`pages build and deployment`という自動生成ワークフロー（`deploy`ステップ）が体感15〜20%程度の頻度でランダムに失敗し、GitHubアプリの通知が届くことがあるが、実害（サイトが更新されない）は無い（失敗しても裏で自動リトライされるか、手動で`POST /repos/{owner}/{repo}/pages/builds`を叩けば即座に再ビルドされ、最終的には毎回正しく反映されている）。気になる場合はGitHub側の通知設定（Notifications）を調整する方向で対応し、デプロイ方式自体は変更しない
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
- [x] **suggest.htmlチャット欄スクロール不可バグ修正** ✅ v1.22.1 — 下記「既知の注意事項」参照
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

### 追記（2026-07-09セッション）：フェーズ別実行プランと計測基盤

> 上記の「戦略の3本柱」を補完する追記。前提の数式と実行順序を明確化したもの。方針に矛盾はなく、両方あわせて参照すること。

#### 前提の数式

有料1000人 = 累計登録 約2〜3万人 × 転換率3〜5%（献立系フリーミアムの一般的な相場）。「流入」と「転換率」の両輪が必要で、どちらか片方の施策だけでは届かない。広告費は使わない方針のため、流入は資産型チャネル（SEO・SNS・紹介）の積み上げが前提。現実的なスパンは12〜18ヶ月。

#### フェーズ別プラン

**Phase 1（〜1ヶ月）：転換の土台づくり（最優先）**

| 施策 | 内容 | 状態 |
|---|---|---|
| ファネル計測の導入 | GA4等で「登録→AI初回利用→上限到達→課金」の各ステップを計測。**現在の転換率を数値で把握するのが全施策の起点**。admin.htmlの集計と併用 | 未着手 |
| 上限到達時の課金導線最適化 | 柱3の「今すぐできる改修②」と同一。上限到達の瞬間が最大の課金モーメント | 未着手 |
| 年払いプラン | — | **実装済み（¥3,800/年）**。訴求強化のみ残タスク |

**Phase 2（1〜6ヶ月）：資産型の流入獲得**

| 施策 | 内容 |
|---|---|
| 給食SEOページ | 「〇〇市 給食献立 アレルギー」等の自治体別・アレルギー対応の情報ページを量産。競合が薄い検索領域（柱2のロングテール戦略の具体化） |
| Instagram発信 | 主婦・主夫層のリーチはInstagramが最重要チャネル。「今週の献立」「アレルギーっ子の献立」系リール/フィードを週2〜3本。AIで下書き量産すれば運用コストは時間のみ。X（柱1）と併走 |
| 紹介プログラム | 「友達招待でAI提案+α回/月」。柱1の招待ボーナスと同一。原価はAPI呼び出し数円で実質ゼロコスト。`usage_limit_overrides` jsonb活用で実装可能 |
| プレスリリース | PR TIMESのスタートアップ無料枠を利用。「給食×AI×アレルギー」は媒体が拾いやすいネタ |

**Phase 3（6ヶ月〜）：定着とLTV**

| 施策 | 内容 |
|---|---|
| 記録ハードルの低減 | ロードマップ既載の「昨日と同じ」ボタン等。継続率が転換率の前提 |
| Flowra連携 | 食費×献立の連携で「ra」シリーズ内の相互送客（Taskra・Flowraユーザーへのクロスセル） |

#### 方針判断：機能追加 vs マーケティング

プロダクトは既に課金に値する完成度のため、**大型機能追加よりPhase 1の計測→Phase 2の流入獲得を優先**する。力点の最終判断には現在の登録者数・有料者数・転換率の実数が必要（admin.htmlで確認可能）。実数が判明したら中間KPI（例：3ヶ月で有料50人）をこのセクションに追記すること。

#### リスク方針

広告費投入（例：50万円規模）などの先行投資型・回収不確実な施策は行わない。コストゼロ〜数千円の資産型施策のみで構成する。

---

### 実施記録（施策ごとに追記していく）

| 日付 | 施策 | 結果 |
|---|---|---|
| 2026-06-30 | 戦略策定 | 本セクション作成 |
| （随時追記） | | |

### suggest.htmlのチャット欄がスクロールできないバグ（v1.22.1）

- **症状**：AI提案結果が表示された状態でチャット欄をスワイプしても上下にスクロールできない。上のテキストも下の入力欄も見えない。
- **原因**：`height:calc(100vh - 57px - 60px)` という固定計算が実態と合っていなかった。`.usage-bar`（約33px）が`.chat-page`の**外**に配置されており、かつ`.chat-toolbar`（約36px）が`.chat-page`の**内**に存在したことで、`.chat-messages`（`flex:1`）に割り当てられる高さがコンテンツ量より小さくなり、スクロールできなかった。
- **解決策（v1.22.1）**：
  1. `suggest.html`専用で`.app-container`を`display:flex; flex-direction:column; height:100dvh; overflow:hidden`に上書き（`100dvh` = iOSのアドレスバーを考慮したdynamic viewport height）
  2. `#usageBar`を`.chat-page`の**内部**（`chat-toolbar`の前）に移動
  3. `.chat-page`を`height`固定から`flex:1; min-height:0; overflow:hidden`に変更し、高さの計算式を排除
  4. これにより`.chat-messages`（`flex:1`）が正しく残り高さ全体を占有し、スクロール可能になった
- **教訓**：チャットUIのような「上部に固定バー・中央がスクロール領域・下部に入力欄」の3層構造は、`height`の固定計算より`flex`の親子関係で高さを管理する方が堅牢。`calc(100vh - Npx)`は要素が増えるたびに計算し直す必要があり、追加要素を見落とすと即座にスクロール破損につながる。`dvh`はiOS Safari のアドレスバーの出し入れに対応するため、モバイルPWAでは`vh`より`dvh`が適切。

### 履歴画面：開いた直後に本日の記録位置へ自動スクロール（v1.22.2）

- **要望**：`history.html`（履歴タブ）を開いた直後、リスト最上部＝「一番新しい記録」が表示されていた。記録日が本日と一致しないケース（数日記録を忘れている／先の予定を先に登録している等）では、開いてすぐ「今日は何か」が分かりにくかった。
- **対応**：
  1. `renderHistory()`で各ログの`date`を`data-date`属性としてDOMに持たせ、本日分には`.is-today`クラスと「本日」ラベルを付与（`--terra`色で強調）
  2. キーワード検索なしの初期表示時のみ`scrollToToday()`を呼び出し、本日の日付に一致する行を`scrollIntoView({block:'center'})`
  3. 本日の記録がまだ無い場合は、本日以前で最も新しい記録（＝本日の位置に一番近い行）にフォールバックしてスクロール
  4. 検索実行時（`keyword`あり）はスクロール処理をスキップし、検索結果の先頭表示を維持
- **教訓**：日付降順リストの「先頭＝最新」は必ずしも「先頭＝今日」ではない。特に給食インポートで未来日の献立を先に登録できる仕様（本アプリ）や、記録を数日サボる運用が普通にあり得るアプリでは、「一覧の先頭」と「今日」を同一視した初期表示は罠になりやすい。今日の行を明示的に探してスクロール＋ハイライトする方がUXとして誠実。

### 仕様確認：招待参加＝世帯の完全切り替え（個人記録との併存・切替は不可）（v1.22.3）

- **仕様の再確認**：`menu_logs`・`menu_fridge_items`・`menu_family_members`は`user_id`ではなく`household_id`に紐づく設計。招待コードで参加すると`joinHouseholdByCode()`が`menu_members.household_id`を招待先のIDに**上書き**するだけで、個人の記録を招待先にマージする処理は無い。
- そのため参加した瞬間、home/history/logなど全画面が新しい`household_id`のみを見るようになり、**「自分だけの献立記録画面」という概念が無くなる**。参加前の個人記録はDBには残るが、アプリ上からは二度とアクセスできない（世帯切替UIが存在しないため）。
- 「世帯を離れる」を実行しても**元の世帯には戻れず**、新しい空の個人世帯が作られるだけ（settings.htmlの`leaveHousehold()`と同じ挙動）。
- Flowraの家計管理（個人の家計簿を保持したままパートナーと共有台帳を併用できる設計）とは根本的に異なる仕様であるため、**「個人も保有し続けて切り替える」という使い方はTaveraでは成立しない**。この非対称性（離脱時には警告があるが参加時には無かった）を修正した。
- **対応（v1.22.3）**：
  1. `settings.html`の招待コード入力欄（`joinSection`）に、常時表示の警告バナー（`.join-warning`）を追加し、コードを打つ前から注意喚起
  2. `joinHousehold()`実行時、参加前に現在の世帯（＝自分の個人世帯であることが多い）の`menu_logs`件数を`count`クエリで取得し、件数がある場合は`（◯件）`と明示した`confirm()`ダイアログを表示
  3. ダイアログ文言で「Flowraの家計管理とは異なる仕様」であることを明記し、個人／世帯の切り替えができない旨と、離脱しても元の記録には戻れない旨を明記
- **今後の検討候補（未実装）**：本質的な解決には、`menu_members`を「1ユーザー1世帯」から「1ユーザーが複数の世帯に所属し、UI上で世帯を切り替えられる」多対多構造への変更が必要（Flowra方式に近づける場合）。ただし影響範囲が大きい（RLS・全クエリの見直し）ため、現時点では警告強化のみで対応。

### 「＋」で新規記録を開いたら食材が勝手に埋まっていた問題（バグではなく仕様・v1.22.4でバナー追加）

- **症状**：ボトムナビ中央の＋ボタンをタップして「献立を記録」画面を開くと、料理名・食材が最初から大量に入力済みの状態になっていた（バグと誤認されやすい）。
- **原因（バグではない）**：
  1. `menu_logs`は`UNIQUE(household_id, date, meal_type)`制約により、1世帯・1日・1食につき記録は1件までしか持てない
  2. ＋ボタンは`getDefaultMealSlot()`で現在時刻から「次に記録すべき食事区分」を自動選択する（例：12時台なら本日の昼食）
  3. `log.html`の`loadExisting()`は、選択中の日付・食事区分に**既存レコードがあれば`isEditMode`に関わらず常に読み込む**設計になっている（そうしないと保存時に既存の給食インポートデータを気づかず上書き・消失させてしまうため）
  4. 今回のケースでは「本日の昼食」がすでに給食インポート（`source: 'kyushoku'`）で登録済みだったため、その内容がそのまま新規記録画面に読み込まれていた
- **問題点**：動作自体は正しい（データ消失防止のための仕様）が、画面タイトルが「献立を記録」のままで「これは既存データです」という表示が無く、ユーザーが誤動作だと感じてしまっていた
- **対応（v1.22.4）**：
  1. `log.html`に`.existing-banner`を追加。`loadExisting()`で既存ログが見つかった時点で、画面上部に「🍱 この食事はすでに給食インポートで記録済みです」（`source==='kyushoku'`の場合）または「📝 この日・この食事区分はすでに記録済みです」（それ以外）というバナーを表示
  2. 食事タブ切替・日付変更時は、再判定前に一旦バナーを非表示にしてから`loadExisting()`を呼び直す
- **教訓**：ユニーク制約による「既存データの自動読み込み」自体は安全側に倒した正しい設計だが、UI上の状態変化（画面タイトルは変わらないのに中身だけ変わる）を伴う仕様変更は、ユーザーに明示的なフィードバックを返さないと簡単に「バグではないか」という問い合わせにつながる。データの自動読込・自動上書き系の挙動は、常に画面上に「なぜこうなっているか」を一言添えるのが安全。

### 献立コメント機能＋LINE連携（双方向）の追加（v1.23.0）

- **背景**：「今日ご飯たべてくる」「おかずだけ食べたい」「すごくおいしかったよ」を家族間で摩擦なく伝え合いたい、という要望。プロダクト全体としてではなく開発者本人が欲しい機能として着手。
- **設計判断**：
  1. **コメントの単位は「日付＋食事区分」**（`menu_meal_comments`）にし、`menu_logs`とは意図的に分離。「今日食べてくる」は記録前の献立に対する先出し連絡であり、既存ログへの紐づけだと最も使いたい場面（未記録の今日の夜）で使えなくなるため
  2. **入力は定型スタンプ＋自由記述の併用**。家族アプリでは自由記述だけだと入力コストが心理的障壁になり使われなくなるため、よくある4パターン（🍽️食べてくる／🙅おかずだけ／😋おいしかった／🙏ごちそうさま）をワンタップ化
  3. **LINE連携は双方向**（v1で一気に実装）。Tavera公式LINEアカウント（1個。世帯ごとではない）を作り、招待コードと同じ発想の連携コードで`menu_members.line_user_id`と紐づけ。コメント投稿→LINE Push通知、LINE返信→Taveraにコメントとして記録、の両方向に対応
  4. LINE側の返信がどの日付・食事区分への発言かを判定するため、`menu_line_contexts`で「直近6時間以内に通知を送った/受けた文脈」を保持。文脈が無ければ`getDefaultMealSlot()`相当のロジック（現在時刻から本日の朝/昼/夜を推定）にフォールバック。LINEのFlexメッセージ＋postbackボタンによる厳密な紐づけも検討したが、家族間の軽いやり取りには過剰と判断し見送り（将来的な改善候補）
- **実装**：
  - DBマイグレーション：`menu_meal_comments`・`menu_line_link_codes`・`menu_line_contexts`を新設、`menu_members`に`line_user_id`（UNIQUE）・`line_linked_at`を追加。RLSは`menu_logs`と同じ「自分の`household_id`に一致」パターンを踏襲（`menu_line_contexts`のみservice role専用でクライアント向けポリシー無し）
  - `home.html`：本日の朝/昼/夜カードそれぞれに💬ボタン（件数バッジ付き）を追加。タップでボトムシートを開き、コメント一覧＋スタンプ＋自由記述入力を表示（`event.stopPropagation()`でカード本体のタップ＝ログ編集への遷移とは独立させている）
  - `settings.html`：「LINE連携」セクションを追加。連携コード発行・コピー、連携済み表示
  - `js/menu-log.js`：`getMealCommentCounts` / `getMealComments` / `postMealComment` / `generateLineLinkCode`を追加。**menu-log.jsを読み込む6ファイル全て（history/home/kyushoku/log/settings/suggest.html）のキャッシュバスターを一斉更新**（既存ルール通り）
  - Edge Function `tavera-comment-notify`（新規・JWT ON）：アプリでのコメント投稿後にクライアントから呼び出し、その世帯でLINE連携済みの他メンバーへPush通知。あわせて通知先の`menu_line_contexts`を更新
  - Edge Function `tavera-line-webhook`（新規・JWT OFF・署名検証あり）：LINE公式アカウントのWebhook受信口。友だち追加時の案内、連携コードの受付、連携済みユーザーの発言をコメントとして記録（文脈推定つき）、他の連携済みメンバーへの再通知まで一括処理。`line-webhook`（Taskra用）・`foodai-send-reply`（FoodAI用）の既存パターンを踏襲
  - 上記2つのEdge FunctionはSupabase MCP経由で直接デプロイ済み（コード編集は本リポジトリでは管理していない。Taskra/Flowraと同じ運用）

- **⚠️ 未完了・要手動対応（本セッションでは実施不可）**：
  1. **LINE Developersコンソールで「Tavera」のMessaging APIチャンネルを新規作成**する必要がある（LINE公式アカウントの作成含む）
  2. チャンネル作成後、**チャネルシークレット**と**チャネルアクセストークン（長期）**を取得し、Supabaseの Edge Functions → Secrets に以下を登録：
     - `TAVERA_LINE_CHANNEL_SECRET`
     - `TAVERA_LINE_CHANNEL_ACCESS_TOKEN`
  3. LINE Developersコンソールの Messaging API設定で、Webhook URLを `https://sfhtvtcmgueystyuhzvd.supabase.co/functions/v1/tavera-line-webhook` に設定し、Webhookを有効化
  4. LINE公式アカウントマネージャー側で「応答メッセージ」「あいさつメッセージ」の自動応答をOFFにする（Webhook側の`follow`イベント処理と重複させないため）
  5. `settings.html`の`LINE_ADD_FRIEND_URL`定数（現在`'#'`のプレースホルダー）を、実際の友だち追加URL（`https://line.me/R/ti/p/@xxxxx`形式）に差し替える
  6. 上記が完了するまでは、アプリ側の「コメント投稿→LINE通知」「LINE返信→コメント記録」は動作しない（コメント機能自体、LINE連携なしのアプリ内完結利用は今すぐ動作する）
- **今後の検討候補（未実装）**：LINEのFlexメッセージ＋postbackボタンによる厳密な文脈紐づけ（現状は時間ベースの推定文脈）。history.html側の過去ログ詳細画面へのコメント欄追加（現状はhome.htmlの本日3食のみ）。

### LINE連携の本番稼働確認・log.htmlへのコメント欄追加（v1.23.1）

- **LINE連携が実際に完了**：LINE公式アカウント「Tavera」（@930xwljc）を作成、Messaging APIチャンネルのシークレット・アクセストークンをSupabase Secretsに登録、Webhook URL設定・検証まで完了。開発者本人のアカウントで実機連携テストを実施し、`menu_members.line_user_id`が正しく設定されることを確認済み（今後は他の家族が連携すればアプリ↔LINE双方向が実際に機能する）
- **settings.htmlにQRコード表示を追加**：友だち追加URL（`https://lin.ee/8azlJ3Z`）を`api.qrserver.com`でQR画像化し、連携コード入力欄の上に表示。スマホのカメラでスキャンして友だち追加できるように
- **log.html（献立の記録・編集画面）にもコメント機能を追加**：当初はhome.htmlの本日3食カードのみにコメント機能を実装していたが、「また食べたい度を入れて、そのままコメントも投稿したい」という動線の要望を受けて追加。「また食べたい度」の直後に💬トグルボタン（件数バッジ付き）を配置し、タップでインラインパネルが展開してスタンプ＋自由記述で投稿できる。`postMealComment`/`getMealComments`/`getMealCommentCounts`（`js/menu-log.js`）をhome.htmlと共通利用しているため、コメント関連のロジックは1箇所に集約されたまま画面だけ増やせている
- **教訓**：コメントを「日付＋食事区分」単位で`menu_logs`から独立させた設計（v1.23.0の判断）が早速効いた。log.html側は保存前の献立でもコメントパネルが独立して動作し、「記録の保存」と「コメント投稿」を別々のタイミングで行える。仮にコメントが`menu_logs.id`に紐づく設計だったら、この画面追加はもっと複雑になっていた

### コメントのスタンプ文言変更・編集/削除機能の追加（v1.23.2）

- **スタンプ文言変更**：「🍽️ 食べてくる」→「🍽️ 外で食べてきます」、「🙅 おかずだけ」→「🙅 おかずだけ食べたいな」に変更。`stamp`カラムに保存されるキー自体（`eating_out`/`side_only`）は変更していないため、過去の投稿データもそのまま新しい表示文言で表示される。`js/menu-log.js`の`MEAL_COMMENT_STAMPS`・home.html/log.htmlのボタンラベル・`tavera-comment-notify`Edge FunctionのSTAMP_LABELの3箇所を同時に更新
- **コメントの編集・削除機能を追加**：
  1. `menu_meal_comments`に`edited_at`カラムを追加。編集すると「（編集済み HH:MM）」がコメント一覧に表示される
  2. RLSを見直し、投稿者本人（`author_id = auth.uid()`）のみが編集・削除できるようポリシーを分割（詳細は上記テーブル定義を参照）
  3. home.html・log.htmlの両方のコメント一覧で、自分が投稿したコメントにのみ「編集」「削除」リンクを表示
  4. 編集時は同じスタンプ・自由記述入力欄を再利用（新規投稿とUIを共用）。入力欄の上に「✏️ コメントを編集中」バーとキャンセルボタンを表示し、誤操作を防止
  5. 編集時にスタンプボタンを押すとスタンプ自体も変更されるが、送信ボタン（➤）のみを押した場合は元のスタンプを保持したまま本文だけを更新する仕様（`editingStamp`/`editingLogStamp`で編集開始時のスタンプを保持し、明示的なスタンプ選択が無い限り上書きしない）
- **教訓**：編集機能を「新規投稿と同じ入力UIを使い回す」設計にしたことで実装コストを抑えられたが、「スタンプは維持したまま本文だけ直したい」という自然な操作を成立させるには、send時のstamp引数を「明示的な選択」と「未選択（＝元の値を維持）」で区別する必要があった。単純に`stamp || null`をそのまま保存すると、本文だけ直したいときに元のスタンプが意図せず消えるバグになるところだった。

### 買い物リストの削除機能・冷蔵庫自動登録／レイアウト崩れの修正／GitHub Pagesビルド障害の解消（v1.23.3）

- **買い物リストに削除（非表示）ボタンを追加**：`menu_shopping_dismissed`テーブルを新設。食材名＋世帯単位で「直近7日以内に削除指定されたか」を判定し、該当すればリストから除外する。買い物リスト自体が「直近7日分の献立ログの食材を毎回集計し直す」揮発性の一覧のため、7日を超えれば集計対象期間そのものがズレて削除指定も自然に意味を失う＝有効期限切れの掃除処理は不要という設計
- **チェックを入れると冷蔵庫に自動登録**：`toggleShoppingItem()`でチェックON時のみ`addFridgeItem()`を呼ぶ。チェックを外しても冷蔵庫からは削除しない（誤操作でうっかり消えると困るため片方向のみ）。冷蔵庫の登録上限（`FRIDGE_MAX=30`）に達している場合はトースト表示してスキップ
- **【重大】レイアウト崩れの原因判明・修正**：`home.html`の「また食べたいランキング」セクション直後に、過去のどこかの編集で紛れ込んだと思われる**余分な`</div>`**があり、ページ全体に下部80pxの余白（ボトムナビとの重なり防止）を持たせている`.page`コンテナがそこで途切れていた。結果、それより後ろの「買い物リスト」セクション（コピー ボタン含む）が`.page`の外側に出てしまい、固定表示のボトムナビの裏に隠れて操作できない状態になっていた。該当`</div>`を正しい位置（買い物リストセクションの直後）に移動して解消
- **GitHub Pagesのビルド失敗・反映遅延を解消**：`tavera-comment-notify`関連のコミットで2回連続`Page build failed`が発生していたことをGitHub API（`/repos/{owner}/{repo}/pages/builds`）で確認。原因はリポジトリに`.nojekyll`が無く、素のHTML/JS構成なのにGitHub Pagesがデフォルトで不要なJekyll変換を経由していたためと推定。リポジトリ直下に空の`.nojekyll`を追加してJekyll処理をスキップするよう修正。以降のビルドは正常終了を確認済み
- **教訓**：デプロイ結果が「反映されない」「不安定」という申告があった際、ブラウザキャッシュを疑う前に、まず`gh api /repos/{owner}/{repo}/pages`や`.../pages/builds`でビルド自体が成功しているかを確認すべき。今回はビルドそのものが落ちていたため、ユーザー側でどれだけキャッシュをクリアしても解決しなかった。GitHub Pagesで素のHTML/JS（Jekyll不使用）サイトを新規に構築する際は、最初から`.nojekyll`を置いておくのが望ましい

### LINE自動記録の日付・食事区分をクイックリプライで訂正できるように（v1.23.4）

- **背景**：LINEからの発言は文脈推定（直近6時間のプッシュ通知 or 現在時刻からのデフォルト食事区分）で自動的に日付・食事区分へ割り振られる。推定を外した場合に訂正する手段が無かった
- **設計判断**：事前確認（「7/3の朝でいいですか？」）は毎回の往復を増やし、LINE経由でコメントする最大の価値（アプリを開かず一言で済む）を損なうため不採用。代わりに「先に自動記録し、間違っていた時だけ軽く直せる」事後訂正モデルを採用。LINEのクイックリプライ（送信直後だけ表示され、トーク履歴を汚さずに消える）を使い、確認の心理的コストをゼロに近づけた
- **実装**：`tavera-line-webhook`の自動記録確認メッセージに、クイックリプライボタンを追加
  - 現在の食事区分**以外**の2つ（例：朝食に記録されていれば「☀️昼」「🌙夜」のみを表示。同じ区分を選ぶ無意味な選択肢は出さない）
  - 「📅前日」「📅翌日」（±1日）
  - ボタンはpostbackアクションで、`data`に`fixmeal:{commentId}:{mealType}`または`fixdate:{commentId}:{±1}`を埋め込み
  - タップ時（`event.type === 'postback'`）、該当コメントの`author_id`が押した本人と一致するかを確認した上で`date`/`meal_type`を更新し、`menu_line_contexts`も追従させ、「✅ 7/3の朝食に変更しました」と返信
- **スコープ外（v1で見送り）**：±1日を超える訂正（例：3日前に記録し直したい）は自由文パース（Taskraの`line-webhook`のようなAI解析）が必要になるため今回は対応せず、その場合はアプリ側で直接編集してもらう想定。また、他の連携済みメンバーへの再通知（訂正後の内容で再度プッシュ）も行っていない（頻繁な通知を避けるため。送信者本人への確認のみ）
- **教訓**：「確認してから実行」と「実行してから訂正できるようにする」は似ているようで体験の質が大きく異なる。前者は毎回コストを払うが、後者はほとんどのケース（＝推定が当たっている場合）でコストがゼロになる。特にLINE Botのような「ながら操作」が前提のインターフェースでは、後者を基本方針にすべき。

### LINE通知の日付表示ズレ＋前日/翌日ボタンの実害バグ修正（v1.23.5）

- **症状**：深夜0時台にLINEで発言すると、Taveraからの返信では「7/2の朝食に記録しました」と表示されるのに、実際に`menu_meal_comments`に保存された`date`は7/3だった（ユーザー申告により発覚）
- **原因**：`tavera-line-webhook`・`tavera-comment-notify`の両方で、日付ラベルを`new Date(dateStr + 'T00:00:00+09:00')`のようにJST時刻としてDateオブジェクトを組み立てた後、`.getMonth()`/`.getDate()`（Deno実行環境のローカルタイムゾーン＝UTCで解釈される）を使って表示用の月日を取り出していた。深夜帯（JSTの日付が変わった直後でUTCではまだ前日）はUTCとJSTの暦日がズレるため、表示だけ1日前にズレる
- **実害**：さらに「📅前日／📅翌日」クイックリプライボタンの日付計算（`d.setDate(d.getDate() + days)`）も同じ原因で**実際にバグっていた**。「翌日」を押しても日付が変わらず、「前日」を押すと2日前に飛んでしまう状態だった（表示だけでなくデータ自体が壊れる実害バグ）
- **対応**：
  1. `formatDateLabel(dateStr)`を新設し、日付文字列を直接パースしてラベルを組み立てる方式に変更（Dateオブジェクト・タイムゾーン変換を経由しない）
  2. `addDaysToDateStr(dateStr, days)`を新設し、`Date.UTC()`でカレンダー日付として構築した上で`setUTCDate`/`getUTCDate`のみを使うことで、実行環境のタイムゾーンに一切依存しない日付加算に変更
  3. 両Edge Functionをデプロイし直し
- **教訓**：サーバーサイド（Deno/Node等）で日付を扱う際、`new Date(dateStr + 'T00:00:00+09:00')`のようにタイムゾーン付きで構築したDateオブジェクトに対して`.getDate()`/`.getMonth()`等の**ローカルタイムゾーン依存メソッド**を呼ぶのは危険。実行環境のタイムゾーンが常にJSTとは限らない（Denoデプロイ環境は通常UTC）ため、表示だけでなく実際の日付計算まで静かに壊れることがある。日付文字列の表示・加算は、Dateオブジェクトの時刻表現を経由せず、文字列パースまたは`Date.UTC`＋`UTC*`系メソッドで完結させるのが安全。

### LINE文脈（どの日付・食事区分への発言か）が訂正後も無関係な発言に引き継がれる不具合の修正（v1.23.6）

- **症状**：0:39にクイックリプライで「7/3の夕食」に訂正した39分後、1:18に全く別の話題（「朝ごはん楽しみ」＝翌朝への言及）を送ったところ、時刻的には本来「本日（7/3）の朝食」がデフォルトになるはずが、直前に訂正した「7/3の夕食」に記録されてしまった
- **原因**：`menu_line_contexts`の文脈保持ロジックが2つの点で過剰に「粘着」していた
  1. クイックリプライでの訂正操作自体が、訂正後の内容で文脈を再度上書き保存していた。訂正は本来「その話題の終わり」であり、後に続く無関係な発言にまで引き継ぐべきではなかった
  2. 文脈の有効期間が6時間と長すぎた。数十分〜数時間後の発言は大抵の場合「別の新しい話題」であり、6時間は「返信の流れ」として扱うには過剰に広い
- **対応**：
  1. クイックリプライ訂正時（`postback`イベント）は`menu_line_contexts`を更新しないよう変更（訂正は文脈を残さない＝話題を閉じる操作として扱う）
  2. 文脈の有効期間を6時間→1時間に短縮
- **教訓**：「直近の文脈から推定する」設計は、時間経過に対してどれだけ`ロジックを"謙虚"にするか`が肝心。有効期間を長く取りすぎると、無関係な発言まで古い文脈に引きずられて誤動作する。特に「ユーザーが明示的に訂正した」というシグナルは、むしろ「この話題はここで完結した」という強いシグナルとして扱い、文脈の起点にしないという判断が今回のポイントだった。

### コメントスタンプを「食べる側／作る側」トグルで切り替え可能に（v1.23.7）

- **背景**：既存の4スタンプ（外で食べてきます／おかずだけ食べたいな／おいしかった／ごちそうさま）はすべて「食べる側（記録・料理を担当しない側）」視点の文言だった。料理を担当する側（オーナー）にもスタンプが欲しいという要望
- **設計判断**：
  1. 8個を1つのリストに混在させない。画面が圧迫される上、自分が使わない文言が常に視界に入るのは双方にとってノイズになる
  2. ラベルは「オーナー／メンバー」（`menu_members.role`という世帯管理上の固定的な役割名）を出さず、**「🍽️食べる側／🍳作る側」という、その時々の立場**で表現。稀にメンバーが作る日・オーナーが食べる側になる日もあるため、役割を人に固定するのではなく「今回のコメントはどちらの視点か」という状況の選択として設計した（「料理をするのは女性（オーナー）」という決めつけをプロダクト側で固定しない配慮も兼ねる）
  3. 初期選択は`role`（owner→作る側、member→食べる側）から自動で決めつつ、`history.html`の「リスト／カレンダー」と同じ見た目のセグメントトグルでいつでも切り替え可能に
- **実装**：
  - `js/menu-log.js`の`MEAL_COMMENT_STAMPS`を`EATER_STAMPS`（🍽️外で食べてきます／🙅おかずだけ食べたいな／😋おいしかった／🙏ごちそうさま）と`COOKER_STAMPS`（🍳これから作るね／⏰少し遅れます／🛒買い出し中／🙏いつもありがとう）に分割。過去コメントの表示用に両方を統合した`MEAL_COMMENT_STAMPS`も維持（投稿時点でどちらのモードだったかに関わらず正しく表示するため）
  - `getMemberRole(memberId)`を新設し、コメントシート/パネルを開くたびに一度だけ取得してキャッシュ
  - home.html・log.htmlの両方でスタンプボタンをハードコードからJS動的レンダリングに変更（トグル切り替え時に`comment-stamps`の中身だけ差し替え）
  - 自分のコメントを編集する際は、そのコメントのスタンプがどちらのセットかを見てトグルも自動追従
- **教訓**：属性ベースのラベリング（役職・立場を人に固定するラベル）は、実態が流動的な家庭内の役割分担とズレると当事者を戸惑わせたり、決めつけとして受け取られたりするリスクがある。「その場面・その回のための一時的な選択」として表現し直すだけで、同じ機能でも受け止められ方が大きく変わる。

### コメントスタンプの微調整・トグルラベルの言い換え（v1.23.8）

- **アイコン変更**：「おかずだけ食べたいな」のアイコンを🙅（拒否・NGのニュアンスが強すぎる）から🍖に変更
- **「🙏いつもありがとう」を食べる側にも追加**：作る側専用だったが、食べる側からも作ってくれたことへの感謝を伝えられるように`EATER_STAMPS`にも同じスタンプを追加（`appreciated`キーは両方の集合に存在する形になり、`MEAL_COMMENT_STAMPS`統合時も表示文言は同一なので問題なし）
- **トグルラベルの言い換え**：「🍽️食べる側／🍳作る側」→「🙏いただく側／👩‍🍳つくってくれる側」に変更。3案（A: いただく側/つくる側、B: 食べる側/つくってくれる側、C: リクエスト側/シェフ側）を提示し、「食べる側」はA案、「作る側」はB案を採用するハイブリッドで確定。「作る側」という中立的だが義務的にも聞こえる表現から、「つくってくれる」という**してもらっていることへの感謝が言葉自体に乗る表現**に変更した
- **付随対応**：`tavera-comment-notify`Edge FunctionのSTAMP_LABEL辞書が食べる側スタンプしか持っていなかったため、作る側スタンプ（cooking/running_late/shopping/appreciated）を追加。これが無いと、作る側スタンプで投稿したコメントのLINE通知で日本語ラベルではなく生のキー名（例：`cooking`）がそのまま表示されてしまう不具合があった（デプロイ前に発見・修正）

### GitHub Pages「Actionsへの切り替え」は行わない方針を明記（v1.23.9）

- 自動生成ワークフロー`pages build and deployment`（`deploy`ステップ）が体感15〜20%程度の頻度でランダムに失敗し、GitHubアプリの失敗通知が届く事象について相談
- 過去にGitHub Actions公式ワークフロー方式へ切り替えた際、「全然更新されない・エラーが出まくる」という悪い経験があったとのことで、**Actionsへの切り替えは今後も行わない**方針で合意。現行の「ブランチからデプロイ（legacy）」のままとする
- 実害（サイト非反映）は無いことを確認済み（失敗しても自動リトライ、または`POST /repos/{owner}/{repo}/pages/builds`での手動リトライで最終的に毎回正しく反映されている）。通知が気になる場合はGitHub側の個人通知設定で調整する方向とし、デプロイ方式自体はこれ以上触らない

### 世帯単位のプレミアム共有「ファミリープレミアム」の実装（v1.24.0）

- **発端**：LP訴求の相談中に「招待された側はフリーでもオーナーがプレミアムなら全機能使えるはず」という認識が語られたが、実際のコードを確認したところ**事実ではなかった**（プレミアム判定は世帯ではなく`menu_members.plan`という個人単位のカラムのみを見ていた）。事実確認から始まり、正しい仕様を先に決めてから実装した
- **設計判断（オーナー基準ではなく「世帯に1人でもいれば」基準を採用）**：
  - 当初案「オーナーの契約が世帯全体に適用される」は、**個人でプレミアム契約中のメンバーがフリープランのオーナー世帯に招待された場合、そのメンバーの契約が無駄になる**という重大なねじれを生むことが議論の中で判明（ユーザー自身の指摘）
  - 代わりに「**世帯に所属するメンバーのうち、有効なプレミアムを持つ人が1人でもいれば世帯全体をプレミアム扱いにする**」というルールに変更。オーナー・メンバーどちらが契約していても、どちらが招待されても、契約が無駄にならない対称的なルールになる
  - この仕組みに「ファミリープレミアム」という名称を与えた
- **重要な追加要件**：「厳密には」という念押しつきで、**AI提案・給食取込・食材取込の利用回数上限そのものを世帯で共有（プール）する**ことが明確に要求された（単に「プレミアム機能を使えるかどうか」のフラグ共有ではなく、月間◯回という消費量自体を合算する）
- **実装**：
  1. **DBマイグレーション**：`menu_ai_usage`に`household_id`を追加し、既存データを世帯単位で合算・再構成。UNIQUE制約を`(user_id, month, feature)`→`(household_id, month, feature)`に変更（`user_id`はNOT NULL制約を解除し、参考情報として残すのみに）
  2. **`household_has_premium(household_id)` RPC新設**（SECURITY DEFINER）：世帯内に有効なプレミアムメンバーが1人でもいるかを判定する共通関数
  3. **`tavera-suggest`・`tavera-kyushoku`・`tavera-fridge-scan`の3つのEdge Functionを全て改修**：プラン判定を`member.plan`直読みから`household_has_premium()`呼び出しに変更。`menu_ai_usage`のクエリ・upsertを`user_id`条件から`household_id`条件（`onConflict: "household_id,month,feature"`）に変更
  4. **`settings.html`のプランカードを3状態に分岐**：
     - 自分が契約者：「👑 ファミリープレミアム契約者」バッジ＋「あなたの契約のおかげで◯◯さんも全機能を使えています」という受益者名の明示（ユーザーの要望：「誰のおかげでプレミアム使えてるんだ、と（笑）」に対応。**その後の指摘で「全機能を使えています」だけだと受益者が"自分専用の上限"を持っているかのように誤読される恐れがあると判明し、両方の文言に「（利用回数は世帯で共有）」を追記して修正済み**。感謝を伝えるための文言が期待値のズレ・誤解を生んでは本末転倒、という教訓）
     - 世帯の誰かの契約で恩恵を受けている側：「🎁 ファミリープレミアム」バッジ＋契約者名を表示。管理ボタンは出さない（契約者本人ではないため）
     - 世帯全体がフリー：従来のアップグレード導線に加え、「世帯の誰か1人が契約すれば家族全員が使えるようになる」という案内文を追加
- **スコープ外・今後の課題**：`admin.html`の売上シミュレーターや管理画面はユーザー個人の契約単位を前提にした表示のままになっている可能性があり、世帯単位化に伴う整合性は今回未確認・未対応（次回admin.html周りを触る際に要点検）
- **教訓**：ユーザーから「〇〇という仕様だよね？」と確認を求められた時、それをそのまま前提として次の作業（今回はLPコピー）に進まず、**まず実装を読んでファクトチェックする**姿勢が重要だった。もし確認せずにLPへ「オーナー契約で家族全員無料」と書いていたら、実態と異なる誇大広告になっていた。また、良かれと思って設計した仕様（オーナー基準）でも、ユーザーとの議論の中で「個人がプレミアム契約者のまま損をするケース」という具体的な反例が出たことで、より公平な設計（世帯内の誰か基準）に至れた。一人で設計を決め切らず、エッジケースを一緒に洗い出すプロセスの価値を再確認した。

### 冷蔵庫食材シートに「削除して買い物リストへ」ボタンを追加（v1.24.1）

- **要望**：冷蔵庫の食材ドロワーに「削除して買い物リストに追加」、または「買い物リストに追加のみ」のボタンが欲しい
- **設計判断**：単独の「買い物リストに追加」ボタン（削除はしない）にすると、「使い切ったから買う」という最頻出のユースケースで2タップ必要になり手間が増える。ボタンを押す動機のほとんどは「使い切ったので削除、かつ買い忘れないように」という**1つの意図**と判断し、あえて分離せず「削除して買い物リストへ」という複合アクションのボタン1つに統合
- **レイアウト**：既存の3ボタン行（保存／期限を削除／食材を削除）にはボタンを追加せず、その下に新しい1行として独立させた。1行に4ボタンを詰め込むと窮屈になるため
- **実装**：`home.html`に`deleteFridgeSheetItemToShoppingList()`を追加。`addShoppingManualItem()`（v1.23.3で買い物リスト手動追加用に新設済みの`menu_shopping_manual`テーブル・関数）をそのまま呼び出してから`deleteFridgeItem()`を実行するだけの薄い実装で、新しいDBスキーマは不要だった

### 買い物リストのチェック時「冷蔵庫に自動追加」問題の解消（v1.24.2）

- **問題**：v1.19.0で追加した「買い物リストのチェックを入れると冷蔵庫に自動追加」機能が、v1.23.3で追加した買い物リストの手動追加機能（ティッシュ・洗剤など献立と無関係なものも登録可能）と組み合わさり、**食材でないものまで冷蔵庫の食材リストに紛れ込む**懸念が生じた
- **検討の過程**：最初は「手動追加分は自動検出と違って食材である保証が無いため、冷蔵庫には一切自動追加しない」という単純な条件分岐で対応したが、「手動追加でも実際には食材（醤油・パン粉など）のこともある」という指摘を受けて再検討
- **最終仕様**：
  - **自動検出分**（献立ログの食材から拾ったもの）：食材である保証があるため、従来通りチェック時に無言で冷蔵庫へ自動追加
  - **手動追加分**：食材か日用品か分からないため、チェック時に`confirm()`で一言確認してから追加。キャンセルすればチェックだけ入り、冷蔵庫には追加されない
  - `.shopping-item`に`data-manual="1"`属性を付与し、`toggleShoppingItem()`内で分岐
- **教訓**：「一律で自動化する」か「毎回確認する」かの二択で悩んだ時、**データの出どころ（自動検出=確実 / 手動入力=不確実）で挙動を分ける**という第三の道があった。今回はさらに、一度出した結論（手動分は完全にスキップ）を、ユーザーからの「手動追加でも食材のことがある」という反例で再度見直し、最終的に「不確実な場合だけ確認を挟む」という、頻度の低いケースにだけコストを払う設計に落ち着いた。

### 冷蔵庫→買い物リストボタンの即時反映・history.htmlへのコメント機能追加（v1.24.3）

- **買い物リストの即時反映**：`deleteFridgeSheetItemToShoppingList()`実行後、トーストは出るのに買い物リストセクションが更新ボタンを押すまで反映されない違和感があったため、`renderShoppingList()`を追加呼び出しして即座に反映するよう修正
- **history.html（献立履歴）にもコメント機能を追加**：home.html・log.htmlに続き3画面目。各行に💬アイコン（件数バッジ付き）を追加し、タップで同仕様のボトムシート（食べる側/作る側トグル・編集/削除含む）が開く
  - **N+1クエリ回避**：履歴一覧は最大100件を一度に表示するため、行ごとに個別クエリを打つとリクエスト数が膨らむ。`js/menu-log.js`に`getAllMealCommentCounts(householdId)`を新設し、世帯全体のコメントを1回のクエリで取得して`date_mealType`キーのマップに変換、各行にマッピングする方式にした
  - コメント投稿・削除後は一覧全体を再取得せず、`refreshHistoryCommentBadge()`で該当行のバッジだけをその場で更新
- **教訓**：同じ機能を3画面目に展開する段階で、「1行あたり1クエリ」という素朴な実装がスケールしないことに気づけた。home.html（今日の3食のみ）・log.html（1件のみ）では問題にならなかったパターンが、history.html（最大100件）で初めて顕在化する典型例。機能を横展開する際は、その画面固有のデータ量・表示件数を踏まえてクエリ設計を見直す必要がある。

### history.htmlのレイアウト崩れ・textContentのHTMLエンティティバグを横展開して修正（v1.24.4）

- **症状①（レイアウト崩れ）**：history.htmlに💬ボタンを追加したことで、1行に詰め込む要素（日付・食事バッジ・料理名・評価・💬・ハート）が増えすぎ、特に5つ星評価が付いた行で料理名の表示幅が極端に狭くなり、1文字ずつ縦に割れて表示される不具合が発生
  - **対応**：`.history-item`を「バッジ＋料理名」の1行目、「本日ラベル・評価・💬・ハート」の2行目に分割する2行レイアウトに再設計。日付バッジは`align-items:flex-start`で上揃えに変更
- **症状②（謎の文字列バグ）**：ハートボタンをタップすると「&#129293;」のような文字列がそのまま表示される不具合が発覚。原因は`toggleLove()`が`btn.textContent = '&#10084;&#65039;'`のように**HTMLエンティティ文字列をtextContentで代入**していたため、デコードされず文字通りの文字列として表示されていた
  - **横展開して発見**：同じ「HTMLエンティティ文字列をtextContentに代入」というアンチパターンが`settings.html`（世帯名編集・招待コード参加の矢印アイコン、2箇所）と`kyushoku.html`（ファイル選択後のファイル名アイコン表示）にも存在することが判明し、あわせて修正
  - `history.html`・`settings.html`の2箇所はハードコードされた静的な文字列のため`innerHTML`に変更して解決。`kyushoku.html`の箇所は`file.name`というユーザー入力（アップロードされたファイル名）と文字列結合していたため、**`innerHTML`にすると理論上XSSリスクがある**と判断し、代わりにHTMLエンティティ表記をやめて実際のUnicode絵文字文字（📄）を直接埋め込む形で`textContent`のまま安全に修正
- **症状③（ボトムナビの浮遊）**：スクロール中にボトムナビが画面中央あたりに一時的に浮いて見える現象。iOS Safari特有の、慣性スクロール中に`position: fixed`要素の追従が遅れる既知の挙動。`css/style.css`の`.bottom-nav`に`translateZ(0)`・`will-change: transform`・`backface-visibility: hidden`を追加し、独立した合成レイヤーとして扱われるようにして軽減（全画面共通CSSのため一括で効く）
- **教訓**：1箇所で見つかったバグパターン（textContentへのHTMLエンティティ代入）は、同じ実装者・同じ時期に書かれた類似コードに横展開している可能性が高い。修正時は該当箇所だけでなく`grep`等でリポジトリ全体を横断検索し、同種のバグを一括で潰すのが効率的。ただし機械的に同じ修正（textContent→innerHTML）を適用するのではなく、代入する文字列にユーザー入力が含まれるかどうかでinnerHTML化の可否を毎回判断する必要がある（今回のkyushoku.htmlのケース）。

### history.htmlのリスト表示を「同じ日付を1枠にまとめる」デザインに変更（v1.24.5）

- **要望**：履歴のリスト表示で、朝食・昼食・夕食が別々の独立カードとして縦に並んでいて同じ日付でも見た目が分断されていた。カレンダー表示のように、同じ日付は1つの枠でくくって見やすくしてほしい
- **実装**：
  - `renderHistory()`のマークアップ生成を「1件＝1カード」から「日付でグルーピング→日付ヘッダー1つ＋その日の食事行を内包する1カード」に変更。取得済みの`data`配列を先頭から走査し、直前の要素と同じ日付なら同じグループに追加するだけの単純なグルーピング（サーバー取得順が既に日付降順のため、この方式で十分）
  - 新設したクラス：`.history-day-group`（外枠。`is-today`時は従来通りテラコッタの縁取り）、`.history-day-header`（日付バッジ・曜日・「本日」ラベルをまとめた見出し行、背景をcreamにして食事行と視覚的に分離）、`.history-day-meals`／`.history-meal-row`（枠内で食事ごとに区切り線（`border-top`）だけで分かれる行。個別の背景・角丸・枠線は持たず、枠自体は親の`.history-day-group`が担う）
  - 💬コメントボタン・❤️ハートボタンは各`.history-meal-row`にそのまま残し、`data-date`/`data-meal`属性も踏襲。`refreshHistoryCommentBadge()`・`scrollToToday()`の参照セレクタを`.history-item`→`.history-meal-row`に更新
  - 「本日」ラベルは従来は該当する食事行ごとに表示していたが、日付単位の見出しに1回だけ表示する形に変更（同じ日に複数食記録があっても重複表示しない）
- **教訓**：既存の「1行＝1レコード」という素朴なリスト設計は、カレンダー表示（`.cal-detail`）側では既に日付単位でグルーピングして表示していたのに、リスト表示だけ取り残されていた。同じデータソースを2つのビューで扱うときは、片方で採用した「見せ方の単位」（今回は日付）をもう片方でも点検し、ズレがあれば揃えるべきだった。

### LINE通知に献立への直リンクを追加（v1.24.6）

- **要望**：LINEに届く献立関連の通知・返信メッセージから、該当する献立（日付・食事区分）へワンタップで飛べるようにしたい
- **実装方針**：Taveraには現状「献立詳細ページ」に相当する独立画面が無いため、新規ページを作らず既存の`home.html`のコメントシート（`openCommentSheet()`）に直接ディープリンクする方式にした
  - `home.html`の`init()`にURLパラメータ`date`・`meal`の読み取りを追加。指定があれば`selectedDate`をその日付にセットしてから通常通り`renderMealGrid()`・日付ラベル更新を行い、最後に`openCommentSheet(date, meal, label)`を自動実行してコメントシートを開いた状態で表示する
  - 日付ストリップ（`renderDateStrip()`）は今日を中心に±3日固定のため、3日より前後の日付がリンクされた場合はストリップ上でチップがアクティブ表示されないが、`selectedDate`自体は正しく反映されるため献立表示・コメントシートの動作に支障はない（見た目上のみの割り切り）
- **リンクを追加した箇所**（`https://tavera.taskra.jp/home.html?date=YYYY-MM-DD&meal=breakfast|lunch|dinner`形式）：
  - `tavera-comment-notify`：アプリでのコメント投稿→他メンバーへのLINE Push通知
  - `tavera-line-webhook`：LINE返信→コメント記録後の、他の連携済みメンバーへの再通知Push
  - `tavera-line-webhook`：LINE返信をコメントとして記録した際の、投稿者本人への確認返信（自動記録の確認メッセージ）
  - `tavera-line-webhook`：クイックリプライで日付・食事区分を訂正した際の確認返信
- **注記**：`tavera-comment-notify`・`tavera-line-webhook`の2つのEdge Functionは、これまでSupabase側にのみデプロイされておりgitリポジトリにソースが存在しなかった（`supabase/functions/`配下に無かった）。今回の修正にあわせて`supabase/functions/tavera-comment-notify/`・`supabase/functions/tavera-line-webhook/`としてリポジトリにも追加し、以後はコード変更の差分がgit履歴に残るようにした。

### log.htmlの日付に曜日を表示、コメント送信の二度打ち対策を3画面に横展開（v1.24.7）

- **曜日表示**：`log.html`の日付入力は`<input type="date">`（ネイティブ）のため、OSのフォーマットで表示され曜日を含められない。隣に`（火）`のような曜日だけの小さなチップ（`#dateWeekday`）を追加し、`init()`時と`dateInput`の`change`イベント時に文字列を直接パースして更新する方式で対応（Dateオブジェクト経由でのタイムゾーンズレを避けるため、既存の`formatDateLabel`系と同じ`Date.UTC`直接パース方式を踏襲）。home.html側で日付ラベルに曜日を含めている実装とは別に、log.html独自に軽量な形で追加した
- **コメント送信ボタンの二度打ち問題**：`postMealComment`/`updateMealComment`の非同期処理中、送信ボタン・スタンプボタンに一切のローディング表示が無く、タップしても見た目が変化しないため「反応していない」と誤解してユーザーが連打し、意図せず二重投稿を誘発する不具合が3画面（home.html・log.html・history.html）すべてに存在していた
  - **対応**：各画面の`sendComment`/`sendLogComment`に処理中フラグ（`commentSending`/`logCommentSending`）を追加し、多重実行そのものをガード。あわせて`setCommentSendingUI(busy)`/`setLogCommentSendingUI(busy)`を新設し、送信中は送信ボタンのテキストを「➤」→「…」に切り替え、送信ボタン・スタンプボタン群を`disabled`にして視覚的にも「処理中」と分かるようにした（CSSに`.comment-send-btn:disabled, .comment-stamp-btn:disabled { opacity: .4; }`を追加）
  - コメント編集（`editingCommentId`あり）・新規投稿の両方の分岐に同じtry/finallyパターンを適用し、失敗時も確実にボタンが再度押せる状態へ戻るようにした
- **教訓**：「機能的には動いているが、処理中であることを示すフィードバックが無い」ために誤操作を誘発するパターンは、コメント機能を3画面に横展開した際に3箇所とも同じ抜け漏れとして持ち込まれていた（元の実装をコピーして展開したため）。1画面で見つかったUXの抜けは、同じロジックをコピーして作った他画面にも同様に存在している可能性が高く、横断的にチェック・修正すべき典型例。

### 引き継ぎ書の記載と実態の齟齬を点検・修正（v1.24.8）

- **発端**：ユーザーから「LINE連携ちゃんと機能してるよ」との指摘。引き継ぎ書には`TAVERA_LINE_CHANNEL_SECRET`・`TAVERA_LINE_CHANNEL_ACCESS_TOKEN`が「要登録」（未設定）と記載されていたが、実態と矛盾していたため、コード・実際のデプロイ状況を調査した
- **調査方法**：Supabase MCPで本番プロジェクト（`sfhtvtcmgueystyuhzvd`）のEdge Function一覧・ソースコード・直近のログを確認し、リポジトリのフロントエンドコードと突き合わせた
- **判明した齟齬**：
  1. **LINE連携のSecrets**：`tavera-line-webhook`は署名検証・メッセージ送受信に上記2つのSecretを必須で参照する実装になっており、ユーザー申告どおり実際に稼働している以上、これらは実際には登録済みだった。引き継ぎ書の「要登録」は古い/誤った記載だったため、「登録済み・稼働確認済み」に修正
  2. **`tavera-url-fetch`関数**：引き継ぎ書には「未実装・必要になったら作成」と記載されていたが、Supabase上には実際にversion 8まで更新されたデプロイ済み関数として存在した。ただしリポジトリ内のどのHTML/JSからも呼び出されておらず、実際のCORSフォールバックは`tavera-kyushoku`が自前でURLを内部fetchする方式で実現されていた（`kyushoku.html`の`pendingUrl`をそのまま`tavera-kyushoku`に渡すだけ）。つまり`tavera-url-fetch`は「未実装」ではなく「実装したが使われなくなり残っている孤立した関数」だった
- **対応**：上記2箇所の記載を実態に合わせて修正。`tavera-fridge-scan`のthinkingトークン対策についても念のためソースを確認したが、こちらはv5で既に対策済み（`thinkingConfig.thinkingBudget: 0`・`maxOutputTokens: 1024`）であることを確認でき、既存の記載（解決策v5のセクション）と齟齬は無かった
- **未確認のまま残った項目**：`TAVERA_STRIPE_YEARLY_PRICE_ID`のSupabase Secret登録有無は、MCPツールにSecret一覧を直接取得する手段が無く未確認（次回Stripe年払い周りを触る際にあわせて確認すること）
### LINEアプリ内ブラウザからのGoogleログイン失敗（disallowed_useragent）への対応（v1.24.9）

- **発端**：ユーザーから、LINEに届く献立コメント通知のリンクをタップしてログインしようとすると「アクセスをブロック：Taveraのリクエストは Google のポリシーに準拠していません（エラー403: disallowed_useragent）」となり進めない、との報告
- **原因**：GoogleはOAuthのセキュリティポリシーとして、LINE・Instagram・Facebook・WeChat等のアプリ内ブラウザ（WebView）からのログインを恒久的にブロックしている。v1.24.6で追加したLINE通知内の`home.html`ディープリンクは、LINEでタップすると既定でLINEのアプリ内ブラウザで開かれてしまうため、未ログイン状態のユーザーが`requireAuth()`経由でログイン画面に飛ばされた際に必ずこのエラーに突き当たっていた
- **最初に実装した対応（後に一部撤回）**：
  1. `tavera-line-webhook`・`tavera-comment-notify`が生成するリンクに、LINE公式が対応しているクエリパラメータ`openExternalBrowser=1`を付与し、タップ時に端末のデフォルトブラウザ（Safari/Chrome）で開かせるようにした
  2. 保険として`js/auth.js`の`signInWithGoogle()`に、User-Agentでアプリ内ブラウザを検知する`isInAppBrowser()`を追加。検知時はOAuth自体を呼ばず「外部ブラウザで開いてください」という案内モーダル（`showExternalBrowserGuide()`）を表示するようにした（モーダルには当初「このページのURLをコピーする」ボタンも付けていた）
- **ユーザーからのフィードバックで判明した問題**：コピーボタンでコピーされるURLが、期待していた「その献立ページのURL」ではなかった（未ログイン時は`requireAuth()`によって既にログイン画面`https://tavera.taskra.jp/`へリダイレクトされた後にモーダルが出るため、`window.location.href`はディープリンクの`date`・`meal`パラメータを失った状態になっている）。この挙動自体はコードの通りで「バグ」ではないが、実用上は紛らわしく使いづらいとの指摘を受けた
- **ユーザーの判断**：LINEのアプリ内ブラウザで開かれた後にどのブラウザ（アプリ内WebViewのままか、外部ブラウザに逃がすか）で開くかは最終的にLINE側の実装・仕様に依存する領域であり、`openExternalBrowser=1`を付与しても確実性が担保できるものではない。そのため「そもそもLINE通知にTaveraへのリンクを貼ること自体をやめる」方針に転換した

### LINE通知からのリンク撤去・外部ブラウザ誘導モーダルの簡素化（v1.25.0）

- **対応方針**：v1.24.9での`openExternalBrowser=1`付与という対症療法をやめ、LINEの各種通知・返信メッセージからTaveraへのリンクそのものを削除した
- **リンクを削除した箇所**（いずれもv1.24.6でリンクを追加した箇所と同一）：
  - `tavera-comment-notify`：アプリでのコメント投稿→他メンバーへのLINE Push通知
  - `tavera-line-webhook`：LINE返信→コメント記録後の、他の連携済みメンバーへの再通知Push
  - `tavera-line-webhook`：LINE返信をコメントとして記録した際の、投稿者本人への確認返信
  - `tavera-line-webhook`：クイックリプライで日付・食事区分を訂正した際の確認返信
  - これに伴い、リンク文字列を組み立てていた`buildMealLink()`関数（`tavera-line-webhook`）は不要になったため削除。各メッセージ内の`\n${mealLink}`部分もあわせて削除し、テキストのみの通知に変更した
  - 献立の確認・記録・コメント返信自体は引き続きLINEから可能（返信すればコメントとして記録される・クイックリプライで日付/食事区分の訂正も可能）で、変わるのは「該当ページへのワンタップ導線が無くなった」点のみ。ユーザーはTaveraアプリを直接開いて内容を確認する運用になる
- **`js/auth.js`側の簡素化**：`showExternalBrowserGuide()`から、コピー対象のURLが状況によって期待と異なり紛らわしかった「このページのURLをコピーする」ボタンを削除。案内文（外部ブラウザで開き直すよう促す文言）と閉じるボタンのみのシンプルな構成に変更した。`isInAppBrowser()`によるUser-Agent検知とOAuth呼び出し前のガード自体は維持しており、LINE通知経由でなくとも（アプリ共有・ブックマーク等で）アプリ内ブラウザからログインボタンが押された場合の保険として引き続き機能する
- **教訓**：外部プラットフォーム（LINE）のアプリ内ブラウザ挙動はこちら側の実装で完全には制御できない領域であり、`openExternalBrowser=1`のような公式パラメータで緩和はできても保証はできない。制御できない外部要因に依存した対症療法を重ねるより、そもそもその経路（LINEからの直リンク）自体を無くして問題の発生条件を消す方が、結果的にシンプルで壊れにくい設計になった。

### マーケティング戦略セクションにフェーズ別実行プランを追記（v1.25.1）

- **内容**：セクション16（マーケティング戦略）の末尾に「追記（2026-07-09セッション）」として、有料1000人達成の前提数式（累計登録2〜3万人×転換率3〜5%）、Phase 1〜3のフェーズ別実行プラン（計測基盤→資産型流入→定着・LTV）、機能追加よりマーケ優先の方針判断、広告費NG等のリスク方針を追加。コード変更なし・ドキュメントのみの更新
- **注記**：セクション16は2026-06-30時点の別セッションで既に策定されていたため、重複セクションを作らず追記形式で統合した。既存の「戦略の3本柱」と矛盾しない構成にしてある。次のアクションはPhase 1のファネル計測導入と、admin.htmlでの現在の登録者数・有料者数の実数確認→中間KPIの追記





















### 転換率改善①：上限到達時の課金導線強化＋LPアレルギー訴求（v1.25.2）

- **背景**：セクション16「今すぐできる改修」②③の実装。マーケ戦略の柱3（課金転換率向上）の第一歩
- **変更内容**：
  1. **index.html（改修③）**：ヒーローバッジを「給食とかぶらない献立 × アレルギー自動チェック」に変更し、hero-subでも「アレルゲンはAIが自動チェック」を強調表示（SEO・CVR両狙い）
  2. **suggest.html showPaywall()（改修②）**：無料プランの上限到達文言を「来月も献立の相談を続けるなら〜月480円（年払いなら月317円相当）で月300回」に強化。プレミアムプラン到達時はアップグレードボタンを非表示に修正（従来はプレミアムにも表示されていた）
  3. **tavera-kyushoku / tavera-fridge-scan（改修②）**：429エラー文言を強化。無料プランには年払い価格訴求込みの文言、プレミアムには「来月また利用できます」を返すようisPremiumで分岐
  4. **kyushoku.html**：上限到達エラー時、消えるトーストだけでなく解析ボタン直下に常設のアップグレードCTA（settings.html#planへのリンク付き通知枠 `#kyUpgradeNotice`）を表示するよう追加
- **⚠️ 重要な発見（並行開発ドリフト）**：リポジトリ内の`tavera-kyushoku`/`tavera-fridge-scan`のソースが本番デプロイ版より古かった（本番には世帯プレミアム判定`household_has_premium` RPCがあるがリポジトリ版には無かった）。リポジトリ版をそのままデプロイすると本番機能が巻き戻るため、**本番ソース（kyushoku v30 / fridge-scan v12）を取得してリポジトリに同期した上で、文言変更のみ適用してデプロイした**（kyushoku v31 / fridge-scan v13）。今後Edge Functionを触る際は、必ずSupabase MCPで本番ソースを取得してリポジトリと差分確認してからデプロイすること
- **セキュリティ**：認証・決済ロジック・DBスキーマへの変更なし（表示文言とフロントUIのみ）。verify_jwtは両関数ともtrueのまま維持。RLS変更なし。触っていない箇所：tavera-suggest（フロント側showPaywallのみ変更、Edge Function本体は無変更）、tavera-checkout・tavera-webhook（決済系は一切触っていない）
- **次にやるべきこと**：Phase 1のファネル計測（GA4等）導入、admin.htmlで実数確認→中間KPI設定、上限到達の実ユーザー発生時に文言のCVR効果を観察

### GA4ファネル計測の導入（Phase 1）（v1.25.3）

- **背景**：マーケ戦略Phase 1「登録→AI初回利用→上限到達→課金」のファネル計測。GA4プロパティ（Tavera / 543470745）とGTM（GTM-ML7NKTDR）は設定済みだったが、タグ設置はindex.html・settings.htmlのみだった
- **変更内容**：
  1. **GTMスニペットを全アプリページに追加**：home / suggest / kyushoku / log / history の5ページ（head + body直後のnoscript）。これでログイン後ページのpage_viewも計測される
  2. **ファネルイベントをdataLayerに送信**：
     - `ai_suggest_success`（suggest.html：AI提案成功時、plan付き）
     - `kyushoku_success`（kyushoku.html：給食解析成功時、plan付き）
     - `limit_reached`（suggest.html showPaywall / kyushoku.html 上限エラー時、feature・plan付き）
     - `begin_checkout`（settings.html startCheckout冒頭、billing_cycle付き）
     - `purchase_premium`（既存実装済み：settings.html plan=success時）
- **⚠️ 残タスク（GTMコンソール側・人間の作業）**：カスタムイベントをGA4に転送するには、GTMで①トリガー「カスタムイベント」正規表現 `ai_suggest_success|kyushoku_success|limit_reached|begin_checkout` ②GA4イベントタグ（イベント名 `{{Event}}`、パラメータ feature/plan/billing_cycle をdataLayer変数から）を1セット作成して公開する。purchase_premiumのタグが既にあればそれを参考に。GTM設定が済むまでカスタムイベントはGA4に届かない（page_viewはGA4設定タグがあれば届く）
- **セキュリティ**：認証・決済・DB変更なし。計測はGTM経由のクライアントサイドのみ

### suggest.htmlのPCレイアウト崩れ修正（v1.25.4）

- **症状**：PCビュー（≥769px）でAI提案画面のナビが左サイドバーにならず、コンテンツ下部に縦積みで表示されていた
- **原因**：suggest.htmlのインラインCSS「app-containerをflex縦並び＋100dvh」（iOSアドレスバー対策）がメディアクエリ外に書かれており、style.cssのPC用グリッド（`grid-template-columns: 220px 1fr`）を上書きしていた。v1.25.3のGTM追加とは無関係で、dvh対応時からの潜在バグ
- **修正**：該当ルールを `@media (max-width: 768px)` で囲みスマホ専用化。PCはstyle.cssのグリッドが適用される。他ページに同様の非スコープapp-container上書きが無いことを確認済み
