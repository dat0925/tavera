# Tavera 設計書・引き継ぎ書

**バージョン**: 1.5.1
**最終更新**: 2026-06-27
**ステータス**: 一般公開済み・本番Stripe決済稼働中・解約フロー実装済み・特定商取引法ページ追加済み

---

## 0. 開発背景・プロダクト方針

### 開発の動機

多くの家庭における献立管理は、冷蔵庫の食材・予算・家族の好み・アレルギーなど複数の制約を頭の中で同時に考慮しながら毎日行う、負荷の高いタスクである。従来はホワイトボードや紙への書き出しで運用されることが多く、**ログが残らない・振り返りができない・過去の好評メニューを再現しにくい**という課題があった。

また、食物アレルギーを持つ家族がいる場合、学校給食の献立表を毎月確認し、代替食や持参品の手配を学校側と調整するという業務も発生する。これらはすべてアナログ作業であり、デジタル化・効率化の余地が大きい。

既存の献立管理アプリはオンボーディングが長く設定項目が多いため、継続利用のハードルが高い。**「使い続けられる、シンプルな体験」** を重視し、本プロダクトを開発した。

### プロダクトのコアバリュー

| # | バリュー | 説明 |
|---|---------|------|
| 1 | **ログの蓄積** | 日々の献立を記録し、家族に好評だったメニューを振り返れるようにする |
| 2 | **AI提案** | 冷蔵庫の食材・直近の履歴・高評価メニューをもとにAIが献立を提案する |
| 3 | **給食連携** | 給食献立表（写真・PDF）をAI解析して取り込み、アレルギー管理と連動させる |

アレルギー管理・家族共有・予算連携などの拡張機能はコアバリューを損なわない範囲で段階的に追加する。

### ターゲットユーザー

日常的に家族の食事管理を担う主婦・主夫層。特に、食物アレルギーを持つ家族がいる世帯や、献立の「考える手間」を削減したいと感じているユーザーを主なターゲットとする。

### ビジネスモデル

- **フェーズ1**: 無料公開・ユーザー獲得
- **フェーズ2**: AI機能を有料化（Stripeサブスク）
- **フェーズ3**: iOSネイティブアプリ展開（Webアプリで使い勝手を検証後）

### 関連プロダクトとの位置づけ

同一開発者による「ra」シリーズの一つ。タスク管理（Taskra）・家計管理（Flowra）と連携させることで、献立・予算・タスクを横断した生活管理プラットフォームへの発展を想定している。将来的にはFlowraの食費データと連携し、予算を考慮した献立提案を実現する。

### 技術選定の理由

| 選定内容 | 理由 |
|---------|------|
| Vanilla JS（ビルドレス） | スマートフォン・タブレットのみの開発環境でも編集・デバッグが完結できるため |
| GitHub Pages | 無料・カスタムドメイン対応・デプロイがgit pushのみで完結 |
| Supabase（既存PJと共有） | フリープランのプロジェクト上限（2件）を考慮し、テーブルプレフィックスで衝突回避 |
| Google認証 | 家族間でのアカウント共有・招待フローを最小コストで実現 |

### 開発スタイル

- Claude（AI）とのチャットセッションで設計・実装・デバッグを完結させる
- GitHub Personal Access Tokenを利用し、AIが直接リポジトリにpushする
- Supabase SQLの実行・Secretの設定はスマートフォンから実施可能
- セッション間の文脈を維持するため、本DESIGN.mdを引き継ぎ書として随時更新する

---

## 1. プロダクト概要

### ブランド
- **アプリ名**: Tavera（タベラ）
- **語源**: 「食べる」から派生。taberu.co.jpが既存企業のため綴り変更。
- **シリーズ**: Taskra（タスク管理）・Flowra（家計管理）と同じ「ra」シリーズ
- **公開URL**: https://tavera.taskra.jp
- **GitHubリポジトリ**: https://github.com/dat0925/tavera
- **ロゴ**: テラコッタ×アンバー×オリーブグリーン。GPT生成。

### コンセプト
「冷蔵庫の前で悩む時間をゼロにする」献立管理Webアプリ。
献立のログ蓄積・過去メニューの振り返り・AIによる提案を三本柱とする。

---

## 2. 技術スタック

| 領域 | 技術 | 備考 |
|------|------|------|
| フロントエンド | Vanilla JS + HTML/CSS | ビルドレス。GitHub Pages対応。 |
| ホスティング | GitHub Pages + カスタムドメイン | tavera.taskra.jp |
| 認証・DB | Supabase（Taskraと同一PJ） | テーブルプレフィックス menu_ で衝突回避 |
| AI | Anthropic Claude API | Supabase Edge Function経由（APIキー非公開） |
| PWA | manifest.json + apple-touch-icon | ホーム画面追加対応済み |
| お問い合わせ | Formspree | エンドポイント: xpqbkdea（Taskraと共有） |
| 決済（予定） | Stripe | AI機能有料化時 |

---

## 3. Supabase設定

- **プロジェクト名**: Taskra（既存と共有）
- **URL**: https://sfhtvtcmgueystyuhzvd.supabase.co
- **Anon Key**: js/supabase.js に記載
- **Site URL**: https://app.taskra.jp（Taskraと共有のため変更不可）
- **Redirect URLs追加済み**: https://tavera.taskra.jp/home.html
- **Google OAuth**: 有効

### Edge Functions
| 関数名 | 用途 | JWT検証 | モデル |
|--------|------|---------|--------|
| tavera-suggest | AI献立提案（Claude API呼び出し） | オフ | - |
| tavera-kyushoku | 給食献立表の画像/PDF解析 | オフ | claude-haiku-4-5 |

- Secret名: ANTHROPIC_API_KEY（TaskraのSecretを共有）

---

## 4. データベース設計

全テーブルにプレフィックス menu_ を付与。RLS設定済み。

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
| name | text | Google表示名（設定画面ロード時に自動更新） |
| role | text | owner / member |
| allergies | text[] | 未使用（family_membersで管理） |
| plan | text | free / premium |
| stripe_customer_id | text | Stripe顧客ID |
| stripe_subscription_id | text | StripeサブスクID |
| plan_expires_at | timestamptz | プレミアム有効期限 |
| cancel_at_period_end | boolean | 解約予約フラグ（true=期限まで有効・更新しない） |

### menu_logs（献立ログ）
| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid PK | |
| household_id | uuid FK | |
| date | date | 献立日 |
| meal_type | text | breakfast / lunch / dinner |
| dish_name | text | 料理名（給食インポート時は「料理1・料理2・料理3」形式） |
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
| expires_on | date | 消費期限（任意）★UI追加済み |
| created_by | uuid | |
| created_at | timestamptz | |

### menu_ai_history（AI提案履歴）
| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid PK | |
| household_id | uuid FK | |
| prompt_summary | text | |
| response | text | |
| used | boolean | 採用したか |
| created_at | timestamptz | |

### menu_family_members（家族メンバー）★v1.1.0追加
| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid PK | |
| household_id | uuid FK | |
| nickname | text | 表示名（例：ママ・太郎） |
| allergies | text[] | アレルギー食材リスト |
| created_by | uuid | |
| created_at | timestamptz | |

### RLSポリシー

**menu_family_members**
| ポリシー名 | 操作 | 条件 |
|---|---|---|
| fam_select | SELECT | household_id = get_my_household_id() |
| fam_insert | INSERT | household_id = get_my_household_id() |
| fam_update | UPDATE | household_id = get_my_household_id() |
| fam_delete | DELETE | household_id = get_my_household_id() |

（他テーブルのRLSは従来通り）

---

## 5. 画面構成

| ファイル | 画面 | 主な機能 |
|----------|------|---------|
| index.html | LP | 機能紹介・AIモック・CTA・Googleログイン・ログイン済みなら自動でhome.htmlへ |
| home.html | ホーム | 7日間日付ストリップ・朝昼夜グリッド・🧊冷蔵庫食材メモ（期限入力対応）・また食べたいランキング・給食インポートへのリンク |
| log.html | 献立記録/編集 | URLパラメータで動作が変わる・食材入力・アレルギーリアルタイム警告 |
| history.html | 履歴 | リスト表示・月間カレンダー表示（切替）・キーワード検索・詳細モーダル |
| suggest.html | AI提案 | チャット形式・冷蔵庫食材バナー・食材プレビュー・アレルギー警告 |
| kyushoku.html | 給食インポート | 献立表写真/PDF→AI解析→チェックボックスで選択→lunch記録として一括登録 |
| settings.html | 設定 | プロフィール・家族メンバー管理・世帯管理・招待・プランカード（解約済み⏳表示・終了日警告）・Stripeカスタマーポータルへのリンク |
| terms.html | 利用規約 | ⚠️ 解約・返金ポリシーの追記が必要（タスク登録済み） |
| privacy.html | プライバシーポリシー | |
| contact.html | お問い合わせ | Formspree経由 |
| tokushoho.html | 特定商取引法に基づく表記 | ✅ v1.5.0追加済み |

### ページ遷移フロー
```
未ログイン → index.html（LP）→ Googleログインボタン → Google認証 → home.html
ログイン済み → index.html → 自動でhome.htmlにリダイレクト
home.html等でrequireAuth()失敗 → index.html（LP）にリダイレクト
```

### log.htmlのURLパラメータ仕様
| パターン | モード | 説明 |
|---|---|---|
| `/log.html` | 新規記録 | 今日の夕食がデフォルト |
| `?date=X&meal=Y` | 新規記録 | 日付・食事タイプ指定 |
| `?date=X&meal=Y&dish=Z` | 新規記録（料理名プリセット） | AI提案・今日も作る経由 |
| `?date=X&meal=Y&dish=Z&ingredients=A,B,C` | 新規記録（料理名＋食材プリセット） | AI提案経由 |
| `?date=X&meal=Y&dish=Z&ingredients=A,B,C&memo=M` | 新規記録（全プリセット） | AI提案経由 |
| `?date=X&meal=Y&edit=1` | **編集モード** | 履歴「編集する」経由 |

---

## 6. 履歴詳細モーダルの仕様

- 履歴アイテムをタップ → 下からシート表示
- 表示内容: 料理名・日付・食事タイプ・食材・メモ・**また食べたい度**（旧「評価」）
- **「編集する」**: `log.html?date=X&meal=Y&edit=1` に遷移
- **「今日も作る」**: `log.html?date=今日&meal=dinner&dish=料理名` に遷移
- オーバーレイタップで閉じる

---

## 7. AI提案の仕組み（v0.9.0）

### フロー
1. suggest.htmlが起動時に今週のログ・高評価メニュー・冷蔵庫食材・家族メンバー（アレルギー）を並行取得
2. 冷蔵庫食材がある場合：緑色バナーで食材表示 + 「🧊 冷蔵庫の食材を使いたい」チップを最優先表示
3. メッセージ送信 → `{ messages, likedDishes, recentDishes, fridgeItems }` をEdge Functionに送信
4. tavera-suggestがsystemPromptで返答フォーマットを指定してClaude APIを呼び出し
5. 返答を `parseDishBlocks()` で解析し、料理名・食材・説明文を抽出
6. 記録ボタン下に食材プレビューを表示 + **アレルギー警告を表示**
7. ボタンタップで `log.html` に遷移

---

## 8. 冷蔵庫食材メモの仕様（v1.1.0更新）

- **思想**: 常備調味料は登録不要。賞味期限が近いもの・使い切りたいものだけ登録する運用
- **登録場所**: ホーム画面（🧊 冷蔵庫の食材セクション）
- **操作**: 食材名入力 → Enterで追加（期限なし） / チップ内の📅ボタンをタップ → インライン期限ピッカーを展開 → 保存 / ✕ボタンで削除。期限設定済みの場合は日付＋✏️アイコンを表示
- **期限表示**:
  - 期限あり（余裕）: チップに `(06/15)` の形式で薄く表示
  - 3日以内: `(あと2日)` でオレンジ色警告
  - 期限切れ: `(期限切れ)` 表示
- **上限**: 30個。残り5個以下でガイドメッセージ。
- **家族共有**: household_id単位で管理
- **AI連携**: suggest.htmlがfridgeItemsを取得してEdge Functionに送信

---

## 9. また食べたい度の仕組み（v0.9.3・v1.0.3更新）

- rating = 5 を「また食べたい」として扱う
- 履歴画面の🤍ボタンをタップ → rating を5に更新 → ❤️に変化
- ❤️をタップ → rating を3に戻す
- ホームのランキングは rating >= 4 のメニューを表示
- log.htmlの評価欄ラベル：「また食べたい度」（星2rem）
- history.htmlの詳細モーダルのラベル：「また食べたい度」（旧「評価」から統一済み）

---

## 10. 月間カレンダービュー（v1.1.0追加）

- 履歴画面（history.html）右上のトグルで「リスト」「カレンダー」を切り替え
- 月グリッド（7列×6行、日曜始まり）で朝昼夜の献立を色分けチップ表示
  - 朝食: 黄系、昼食: 水色系、夕食: 青紫系
- 前月・翌月ナビゲーション（‹ / › ボタン）
- 日付タップ → 下部に当日の献立詳細パネルを展開（再タップで閉じる）
- 詳細パネルの料理名タップ → 既存の詳細モーダルを表示
- カレンダー表示中は検索欄を非表示
- Supabaseから月単位でデータ取得（月ごとにキャッシュ）

---

## 11. 家族メンバー管理（v1.1.0追加）

- 設定画面（settings.html）の「家族メンバー」セクションで管理
- **登録対象**: Taveraアカウントを持たない家族（子供など）も登録可能
- **管理内容**: ニックネーム + アレルギー食材リスト（タグ形式）
- **CRUD**: 追加・編集・削除すべて対応
- DBテーブル: `menu_family_members`（household_id単位でRLS管理）
- JS関数: `getFamilyMembers(householdId)` / `checkAllergies(ingredients, familyMembers)`

---

## 12. アレルギー照合・NGアラート（v1.1.0追加）

### 照合ロジック
- `checkAllergies(ingredients, familyMembers)` がsimple部分一致で照合
  - ingredient.includes(allergen) または allergen.includes(ingredient)
- 戻り値: `[{ memberName, allergen }, ...]`

### 発火タイミング
| 場所 | タイミング | 表示 |
|------|-----------|------|
| log.html | 食材タグ追加/削除のたびにリアルタイム | 食材タグ直下に警告バナー |
| suggest.html | AI提案の解析結果表示時 | 各料理ボタン直下にテキスト |

### 表示例
```
⚠️ 太郎：卵 が含まれています
⚠️ 花子：小麦・乳 が含まれています
```

---

## 13. 給食献立インポート（v1.1.0追加）

### 概要
給食の献立表（写真・PDF）をAIに読み取らせてlunch記録として一括登録する機能。

### フロー
1. `kyushoku.html` を開く（ホーム右上の「📋 給食」ボタンからアクセス）
2. 対象年月を選択
3. 献立表の写真またはPDFを選択
4. 「AIで解析する」→ Edge Function `tavera-kyushoku` がClaude Haikuに送信
5. 日付・料理名のリストが表示される（既存登録済みにはバッジ）
6. チェックボックスで選択 → 「インポート」でmenu_logsに一括登録
7. 料理名はその日のすべての料理を「・」区切りで1件のlunch記録として保存

### Edge Function: tavera-kyushoku
- モデル: claude-haiku-4-5
- 入力: `{ image: base64, mediaType, year, month }`
- 出力: `{ menu: [{ date: "YYYY-MM-DD", dishes: ["料理1", "料理2"] }] }`
- JWT検証: オフ（他のtaveraと同様）
- 既存登録との重複: `upsert`で上書き（onConflict: household_id,date,meal_type）

---

## 14. 家族共有の仕組み

### 招待フロー
1. オーナーが設定画面「📤 家族を招待する」→ 8桁コードをコピー
2. 招待される側が設定画面「📥 招待コードで参加する」→ コード入力
3. RPC `find_household_by_code` でUUID前方一致検索
4. `menu_members`の`household_id`と`role`をUPDATE（role = 'member'に）
5. ページリロードで世帯が切り替わる

### 権限設計
| 操作 | オーナー | メンバー |
|---|---|---|
| 世帯名の変更 | ✅ | ✗ |
| 家族を招待 | ✅ | ✅ |
| 世帯を離れる | ✗ | ✅ |
| 家族メンバー管理 | ✅ | ✅ |

---

## 15. ファイル構成

```
/
├── index.html       # LP（ランディングページ）兼ログイン処理
├── home.html        # ホーム（冷蔵庫期限UI・給食リンク追加済み）
├── log.html         # 献立記録/編集（アレルギー警告追加済み）
├── history.html     # 履歴（月間カレンダービュー追加済み）
├── suggest.html     # AI提案（アレルギー警告追加済み）
├── kyushoku.html    # 給食献立インポート ★v1.1.0追加
├── settings.html    # 設定（家族メンバー管理追加済み）
├── terms.html
├── privacy.html
├── contact.html
├── manifest.json
├── DESIGN.md
├── README.md
├── assets/
│   ├── logo.png
│   ├── icon-32.png
│   ├── icon-180.png
│   ├── icon-192.png
│   └── icon-512.png
├── css/
│   └── style.css    # 星サイズ2rem・冷蔵庫期限スタイル追加済み
├── js/
│   ├── supabase.js
│   ├── auth.js
│   ├── menu-log.js  # getFamilyMembers・checkAllergies追加済み
│   └── suggest.js   # 未使用
└── supabase/
    └── functions/
        └── tavera-kyushoku/
            └── index.ts  # ★v1.1.0追加（要デプロイ）
```

---

## 16. Stripeサブスク設計（v1.3.0）

### プラン構成
| プラン | 月額 | AI提案 |
|---|---|---|
| Free | 無料 | 月10回・1日3回まで |
| Premium | ¥480 | 月500回・1日50回（体感ほぼ無制限・攻撃対策） |

### 原価試算（claude-haiku-4-5ベース）
- 1回あたり約0.5円（入力1,100 + 出力600トークン）
- ヘビー利用（月90回）でも約50円 → 利益率約90%
- プレミアム上限フル利用（月500回）でも約250円 → 利益率約48%（現実的な利用では90%前後）

### デプロイ状況（2026-06-27時点）

| 項目 | 状況 |
|---|---|
| DBマイグレーション（stripe_setup.sql） | ✅ 実行済み |
| Stripe商品・Price ID作成（サンドボックス） | ✅ 完了（`price_1TdMZzB5e5DORDCyeMEYw7un`） |
| Stripe商品・Price ID作成（**本番**） | ✅ 完了（`price_1TmtslBNAV5e5rhcf4Wxvphw`） |
| Supabase Secrets登録（テスト用） | ✅ 完了（TAVERA_STRIPE_PRICE_ID・TAVERA_STRIPE_WEBHOOK_SECRET・STRIPE_SECRET_KEY_TEST） |
| Edge Function tavera-checkout | ✅ デプロイ済み（TAVERA_STRIPE_SECRET_KEY使用・console.log削除） |
| Edge Function tavera-webhook | ✅ デプロイ済み（Stripe署名検証追加・verify_jwt=off） |
| Edge Function tavera-suggest | ✅ デプロイ済み（既存上書き） |
| Stripe決済画面への遷移 | ✅ 動作確認済み（テストカードで決済成功） |
| Webhook → DB反映 | ✅ 動作確認済み（2026-06-27） |
| **本番キー切替** | ✅ 完了（TAVERA_STRIPE_SECRET_KEY登録済み） |

### ⚠️ セキュリティ修正（2026-06-27）
- `tavera-webhook`にStripe署名検証（HMAC-SHA256）を追加。以前は署名なしで任意のリクエストを受け付ける状態だった。
- `tavera-checkout`のデバッグ用`console.log`をすべて削除。

### 残作業（本番切替）

### 残作業（動作確認）

**本番テスト決済で確認：**
1. https://tavera.taskra.jp/settings.html を開く
2. 「プレミアムにアップグレード」ボタンをタップ → Stripe本番決済画面が開くことを確認
3. 本番カードで決済（¥480）→ settings.htmlでプランが「✨ プレミアム」に変わることを確認
4. suggest.htmlで残り回数バーが「プレミアム」表示になることを確認

**Supabase Secretsの構成（登録済み）：**
| Secret名 | 内容 |
|---|---|
| `ANTHROPIC_API_KEY` | 既存（Taskraと共有） |
| `TAVERA_STRIPE_SECRET_KEY` | Stripe本番Secret Key（新規・Tavera専用） |
| `TAVERA_STRIPE_PRICE_ID` | `price_1TmtslBNAV5e5rhcf4Wxvphw`（本番） |
| `TAVERA_STRIPE_WEBHOOK_SECRET` | `whsec_8x4LMUX008s0rlDd99oidTQBjn6EzDCZ`（本番） |
| `SUPABASE_SERVICE_ROLE_KEY` | 既存 |

### トラブルシューティング履歴（参考）
- CORSエラー: Supabase GatewayはOPTIONSを404で返す問題 → Supabase CLIでデプロイすることで解消
- CORS_HEADERSに`x-client-info, apikey`が必要
- `menu_ai_usage`未存在時の406エラー → `.single()`を`.maybeSingle()`に変更
- Stripe顧客作成のmetadata形式: `metadata[supabase_user_id]`（フラット形式）
- STRIPE_SECRET_KEYはTaskraの本番キーが登録済みのため、`STRIPE_SECRET_KEY_TEST`を別途登録

### 必要なStripe設定（手動作業）
1. Stripeダッシュボードで商品「Tavera Premium」を作成（¥480/月）
2. Price IDをSupabase SecretにSTRIPE_PREMIUM_PRICE_IDとして登録
3. Stripe Secret KeyをSTRIPE_SECRET_KEYとして登録
4. Webhookエンドポイントを登録: `https://sfhtvtcmgueystyuhzvd.supabase.co/functions/v1/tavera-webhook`
5. 購読するWebhookイベント: customer.subscription.created/updated/deleted, invoice.payment_failed
6. Webhook SigningSecretをSTRIPE_WEBHOOK_SECRETとして登録

### 必要なSupabase Secrets
| Secret名 | 内容 |
|---|---|
| ANTHROPIC_API_KEY | 既存（Taskraと共有） |
| STRIPE_SECRET_KEY | Stripeダッシュボードから取得 |
| TAVERA_STRIPE_PRICE_ID | Stripeで作成した価格のID（price_xxx）※Taskraと別名 |
| TAVERA_STRIPE_WEBHOOK_SECRET | Stripe Webhookの署名シークレット（whsec_xxx）※Taskraと別名 |
| SUPABASE_SERVICE_ROLE_KEY | SupabaseプロジェクトのService Role Key |

### Edge Functions（4本）
| 関数名 | 用途 | JWT検証 |
|---|---|---|
| tavera-suggest | AI提案・プラン判定・利用回数制限 | オン |
| tavera-checkout | Stripe Checkout Session生成 | オン |
| tavera-webhook | Stripeイベント受信・DB更新（署名検証なし・fetch直呼び） | オフ |
| tavera-kyushoku | 給食献立表解析 | オフ |
| tavera-portal | Stripeカスタマーポータルセッション生成 | オン |

### Webhook実装上の注意（2026-06-27）
- `createClient`（esm.sh）を使うと500エラーになる。**fetch直呼び（REST API）で実装すること**
- Stripe新API（2026-04-22.dahlia）では `current_period_end` がトップレベルになく `items.data[0]` 配下にある。両方フォールバックで取得すること
- `cancel_at_period_end=true` のとき解約予約状態。DBの `cancel_at_period_end` カラムに保存してUIで表示

### DBスキーマ追加（stripe_setup.sql参照）
- menu_members: plan, stripe_customer_id, stripe_subscription_id, plan_expires_at
- menu_ai_usage: user_id, month(YYYY-MM), count

---

## 18. デザインシステム

| 変数 | 値 | 用途 |
|------|-----|------|
| --terra | #C8522A | メインカラー・CTA |
| --amber | #E8932A | アクセント・また食べたい度の星 |
| --cream | #FDF6EC | 背景 |
| --olive | #6B7A3A | サブアクセント・冷蔵庫UI・インポートボタン |
| --brown | #4A2E1A | テキスト |
| --muted | #9B8878 | サブテキスト |
| --border | #EAD9C8 | ボーダー |

フォント: 見出し Kaisei Decol / 本文 Zen Kaku Gothic New（Google Fonts）

---

## 18. 開発ロードマップ

### Phase 1（完了）MVP
- Google認証・献立ログCRUD・ホーム・履歴・AI提案・PWA・カスタムドメイン

### Phase 2（完了）使い勝手の向上
- 記録後ホーム自動遷移 ✅
- また食べたいボタン（履歴の🤍） ✅
- 履歴詳細モーダル（編集・今日も作る） ✅
- log.htmlの編集モード対応（edit=1パラメータ） ✅
- AI提案のパーソナライズ（今週の履歴から動的クイックチップ） ✅
- 家族招待フロー（招待コード発行・参加・離脱・世帯名変更） ✅
- 冷蔵庫食材メモ（常備食材登録・AI提案に自動反映） ✅ v0.7.0
- AI提案から食材を自動抽出してlog.htmlにプリセット表示 ✅ v0.8.0
- 食材プレビュー表示のバグ修正（parseDishBlocks未接続） ✅ v0.8.1
- AI説明文をメモ欄に「【AI提案より】」形式でプリセット ✅ v0.9.0
- 食材入力の全角/半角スペース分割バグ修正・ラベルUX改善 ✅ v0.9.1
- 冷蔵庫食材の+ボタン廃止（Enterのみ）・上限30個・プレースホルダー変更 ✅ v0.9.2
- 食材ツールチップ追加・星評価を大型化（2rem）・「また食べたい度」に改称 ✅ v0.9.3
- 月間カレンダービュー（history.html） ✅ v1.1.0
- 冷蔵庫食材の期限入力UI（日付ピッカー・期限表示） ✅ v1.1.0
- 冷蔵庫食材の期限入力をインラインChip方式に刷新（主フローを汚染しないプログレッシブ・ディスクロージャー設計） ✅ v1.2.0
- 冷蔵庫食材チップのアフォーダンス改善・保存バグ修正（📅アイコンで期限設定を明示、onclick属性競合をaddEventListenerバインドで解消） ✅ v1.2.1
- 冷蔵庫食材の期限編集UIをボトムシート方式に刷新（チップタップ→画面下からシート展開・保存/期限削除/食材削除を1UIに集約） ✅ v1.3.3
- 履歴画面リスト/カレンダー切替トグルを常に右端固定（margin-left:autoで検索欄の表示状態に依存しない配置に修正） ✅ v1.2.2
- カレンダービューの7列オーバーフロー修正（cal-cellにmin-width:0追加）・末尾空行を除去（必要行数のみ表示） ✅ v1.2.3
- リスト/カレンダー切替時のツールバー縦揺れを修正（検索欄をdisplay:noneからvisibility:hiddenに変更し高さを保持） ✅ v1.2.4

### v1.0.0 一般公開対応（完了）
- LP・利用規約・プライバシーポリシー・お問い合わせ・ログイン処理 ✅ v1.0.0〜v1.0.1

### Phase 3（完了）アレルギー・給食対応
- 家族メンバー管理（ニックネーム・アレルギー設定） ✅ v1.1.0
- アレルギー照合・NGアラート（記録画面・AI提案画面） ✅ v1.1.0
- 給食献立インポート（写真/PDF→AI解析→一括登録） ✅ v1.1.0

### Phase 4 マネタイズ・改善（優先順位見直し済み）

> **方針変更（2026-06-01）**
> Flowra連携・LINE連携は「作れるが使われない」リスクが高いと判断し優先度を下げた。
> Flowra連携はFlowra自体の普及が前提であり時期尚早。LINE連携は毎日使うアプリには体験上不向き。
> 代わりに定着率向上・AI改善・早期マネタイズを優先する。

#### 優先度：高
- [x] **Stripeサブスク** ✅ v1.3.0 — AI機能を有料化。free / premiumの2プラン構成
- [x] **Stripe署名検証・デバッグログ削除** ✅ v1.4.0 — tavera-webhookにHMAC-SHA256署名検証追加、tavera-checkoutのconsole.log削除
- [x] **Stripe本番切替** ✅ v1.4.0 — 本番キー登録・Webhook動作確認済み。`current_period_end`はStripe新APIでは`items.data[0]`配下にあることに注意（フォールバック実装済み）
- [x] **カスタマーポータル・解約フロー** ✅ v1.4.1
- [x] **特定商取引法ページ作成・利用規約に解約返金ポリシー追記** ✅ v1.5.0 — tokushoho.html新規作成、terms.html第11条追加、全フッターにリンク追加 — `tavera-portal` Edge Function追加。「サブスクリプションを管理」からStripeポータルへ遷移。解約済み状態（cancel_at_period_end）をDBに保存・UIで⏳表示・終了日警告・「解約を取り消す」ボタン対応

#### 優先度：中
- [ ] **AI提案の精度向上** — 使うほど良くなる体験で定着率を上げる
  - 季節・曜日・天気などのコンテキスト追加
  - 「また食べたい」ログの重み付け強化
- [ ] **記録ハードルの低減** — 3日以内の離脱を防ぐ
  - ホーム画面からワンタップ記録
  - 「昨日と同じ」ボタンなど繰り返し入力の簡略化

#### 優先度：低（将来検討）
- [ ] Flowra連携（Flowra普及後に再検討）
- [ ] LINE連携（ユーザーニーズ確認後に検討）
- [ ] iOSネイティブアプリ（Webで十分な定着確認後）

---

## 19. 本番運用前にやること（済）

```sql
-- テスト中に大量作成された不要な「わが家」世帯を削除
DELETE FROM menu_households
WHERE id NOT IN (SELECT household_id FROM menu_members);
```

---

## 20. 開発運用・注意事項

- **開発スタイル**: Claudeとのチャットで開発。GitHubのPATを渡してpushまで完結。
- **引き継ぎ**: 本DESIGN.mdを新しいClaudeセッションに共有する。
- **Supabase SQL**: 管理コンソールのSQLエディタで手動実行（スマホ・iPad可）。
- **Edge Function**: Supabaseコンソールから編集・デプロイ（iPad可）。
- **別アカウントでのテスト**: シークレット/プライベートウィンドウを使う（prompt:select_accountはPKCEフローと干渉するため不可）。
- **キャッシュ問題**: 全HTMLにno-cacheメタタグ追加済み。残る場合はSafari設定からWebデータ削除。
- **JS生成の注意**: シェルのヒアドキュメントで日本語・正規表現・クォートが壊れる事故が多発。**必ずPythonスクリプトでファイル生成 → node --checkで構文確認 → pushの順で行う。**
- **suggest.htmlの構文エラー歴**: デバッグ用dbg()関数内の改行混入・正規表現のUnicodeエスケープ漏れ・parseDishBlocks未接続など複数のバグがあった。修正済み。
- **GitHub Pagesのビルド失敗**: 短時間に大量pushすると競合でビルド失敗メールが来ることがある。最終ビルドがsuccessであれば問題なし。GitHub Actions画面で確認する。
- **tavera-kyushoku Edge Function**: supabase/functions/tavera-kyushoku/index.ts にコードあり。新しい環境では必ずSupabaseコンソールからデプロイすること。
- **Webhook実装の注意（重要）**: `createClient`（esm.sh / jsr）をEdge Function内でimportすると500エラーになる事例あり。**fetch直呼び（Supabase REST API）で実装すること**。
- **Stripe新API（2026-04-22.dahlia）の注意**: `current_period_end` がサブスクリプションのトップレベルに存在しないことがある。`sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end` のようにフォールバックで取得すること。

---

## 21. 次回セッションの優先タスク（2026-06-27時点）

### 🔴 最優先（法的必須）
1. ✅ **特定商取引法に基づく表記ページ作成** (`tokushoho.html`) — v1.5.0完了
2. ✅ **利用規約に解約・返金ポリシーを追記** (`terms.html`) — v1.5.0完了（第11条として追加）

### 🟡 次点
3. ✅ **LPにGTM設置** — GTM-MB8QQ2GC を index.html に追加（v1.5.1完了）
4. **GA4コンバージョン設定** — プレミアム登録完了イベントを設定
5. **AI提案品質改善** — suggest.htmlのプロンプトに季節・曜日を追加

---

*このドキュメントはアプリ成長に合わせて随時更新する。*


