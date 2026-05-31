# Tavera 設計書・引き継ぎ書

**バージョン**: 0.8.0
**最終更新**: 2026-05-31
**ステータス**: MVP稼働中・Phase 2完了・本番運用準備中

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
| 関数名 | 用途 | JWT検証 |
|--------|------|---------|
| tavera-suggest | AI献立提案（Claude API呼び出し） | オフ |

- Secret名: ANTHROPIC_API_KEY（TaskraのSecretを共有）

---

## 4. データベース設計

全テーブルにプレフィックス menu_ を付与。RLS設定済み。

### menu_households（世帯）
| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid PK | |
| name | text | 世帯名 |
| created_by | uuid | 作成者のuser_id（権限判定には使わない。role=ownerで判断） |
| created_at | timestamptz | |

### menu_members（メンバー）
| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid PK | auth.users.idと一致 |
| household_id | uuid FK | |
| name | text | Google表示名（設定画面ロード時に自動更新） |
| role | text | owner / member |
| allergies | text[] | Phase 3で使用 |

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

### menu_fridge_items（冷蔵庫食材）★ v0.7.0追加
| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid PK | |
| household_id | uuid FK | |
| name | text | 食材名（最大20文字） |
| expires_on | date | 消費期限（任意） |
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

### RLSポリシー

**menu_households**
| ポリシー名 | 操作 | 条件 |
|---|---|---|
| households_select | SELECT | auth.uid() IS NOT NULL |
| households_insert | INSERT | created_by = auth.uid() |
| households_update | UPDATE | role = 'owner' |
| households_delete | DELETE | created_by = auth.uid() |

**menu_members**
| ポリシー名 | 操作 | 条件 |
|---|---|---|
| （自動生成） | SELECT | id = auth.uid() |
| members_household_select | SELECT | household_id = get_my_household_id() |
| members_self_update | UPDATE | id = auth.uid() |

**menu_fridge_items**
| ポリシー名 | 操作 | 条件 |
|---|---|---|
| fridge_select | SELECT | household_id = get_my_household_id() |
| fridge_insert | INSERT | household_id = get_my_household_id() |
| fridge_delete | DELETE | household_id = get_my_household_id() |

**SECURITY DEFINER関数**
```sql
CREATE OR REPLACE FUNCTION get_my_household_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER AS $$
  SELECT household_id FROM menu_members WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION find_household_by_code(code TEXT)
RETURNS TABLE(id UUID, name TEXT) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT id, name FROM menu_households WHERE id::text ILIKE code || '%' LIMIT 2;
$$;
```

---

## 5. 画面構成

| ファイル | 画面 | 主な機能 |
|----------|------|---------|
| index.html | ログイン | Google OAuth |
| home.html | ホーム | 7日間日付ストリップ・朝昼夜グリッド・🧊冷蔵庫食材メモ・また食べたいランキング |
| log.html | 献立記録/編集 | URLパラメータで動作が変わる（下記参照） |
| history.html | 履歴 | 全件一覧・キーワード検索・タップで詳細モーダル |
| suggest.html | AI提案 | チャット形式・冷蔵庫食材バナー・動的クイックチップ・食材プレビュー付き記録ボタン |
| settings.html | 設定 | プロフィール・世帯管理・招待・ログアウト |

### log.htmlのURLパラメータ仕様
| パターン | モード | 説明 |
|---|---|---|
| `/log.html` | 新規記録 | 今日の夕食がデフォルト |
| `?date=X&meal=Y` | 新規記録 | 日付・食事タイプ指定 |
| `?date=X&meal=Y&dish=Z` | 新規記録（料理名プリセット） | AI提案・今日も作る経由 |
| `?date=X&meal=Y&dish=Z&ingredients=A,B,C` | 新規記録（料理名＋食材プリセット） | AI提案経由（v0.8.0追加） |
| `?date=X&meal=Y&edit=1` | **編集モード** | 履歴「編集する」経由 |

---

## 6. 履歴詳細モーダルの仕様

- 履歴アイテムをタップ → 下からシート表示
- 表示内容: 料理名・日付・食事タイプ・食材・メモ・評価
- **「編集する」**: `log.html?date=X&meal=Y&edit=1` に遷移
- **「今日も作る」**: `log.html?date=今日&meal=dinner&dish=料理名` に遷移
- オーバーレイタップで閉じる

---

## 7. AI提案の仕組み（v0.8.0更新）

### フロー
1. suggest.htmlが起動時に今週のログ・高評価メニュー・冷蔵庫食材を並行取得
2. 冷蔵庫食材がある場合：緑色バナーで食材表示 + 「🧊 冷蔵庫の食材を使いたい」チップを最優先表示
3. メッセージ送信 → `{ messages, likedDishes, recentDishes, fridgeItems }` をEdge Functionに送信
4. tavera-suggestがsystemPromptで返答フォーマットを指定してClaude APIを呼び出し
5. 返答を `parseDishBlocks()` で解析し、料理名と食材を抽出
6. 「記録する」ボタン下に食材プレビューを表示（🥕 食材1・食材2・...）
7. ボタンタップで `log.html?dish=X&ingredients=A,B,C` に遷移し食材欄に自動入力

### Edge Function（tavera-suggest）のsystemPrompt構造
```
基本指示（返答フォーマットを厳密に指定）
  ↓
① 料理名
食材：食材1・食材2・食材3
（説明）
  ↓
【冷蔵庫にある食材】※あれば
【今週すでに食べたもの】※あれば
【家族に好評だったメニュー】※あれば
```

### parseDishBlocks() の動作
- `①②③` または `1.` で始まる行 → 料理名として抽出
- `食材：` で始まる行 → `・` 区切りで食材リストに変換
- `・` `-` で始まる短い行 → 箇条書き食材として補完抽出

### Edge Functionへ送るリクエスト構造
```json
{
  "messages": [...],
  "likedDishes": [...],
  "recentDishes": [...],
  "fridgeItems": ["鶏もも肉", "ニンジン", "玉ねぎ"]
}
```

### 動的クイックチップのロジック（優先順）
1. 冷蔵庫食材あり → 「🧊 冷蔵庫の食材を使いたい」（最優先）
2. 今週の記録あり → 「今週と違うものがいい」
3. 高評価メニューあり → 「好評メニューに近いものがいい」
4. 常時 → 「簡単に作れるものがいい」「お任せで！」

---

## 8. 冷蔵庫食材メモの仕様（v0.7.0追加）

- **登録場所**: ホーム画面（🧊 冷蔵庫の食材セクション）
- **操作**: テキスト入力→＋ボタン or Enterで追加 / ✕ボタンで削除
- **家族共有**: household_id単位で管理
- **期限管理**: expires_onカラムあり（UIは名前のみ。将来的に期限入力UI追加予定）
- **期限警告**: 3日以内の食材はオレンジ色（`expiring-soon`クラス）で表示
- **AI連携**: suggest.htmlがfridgeItemsを取得してEdge Functionに送信

---

## 9. また食べたいの仕組み

- rating = 5 を「また食べたい」として扱う
- 履歴画面の🤍ボタンをタップ → rating を5に更新 → ❤️に変化
- ❤️をタップ → rating を3に戻す
- ホームのランキングは rating >= 4 のメニューを表示

---

## 10. 家族共有の仕組み

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

---

## 11. ファイル構成

```
/
├── index.html
├── home.html
├── log.html
├── history.html
├── suggest.html
├── settings.html
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
│   └── style.css
└── js/
    ├── supabase.js     # Supabase初期化・getSession/getUser/requireAuth
    ├── auth.js         # Google OAuth・signOut・showToast
    ├── menu-log.js     # 献立CRUD・世帯管理・招待参加・冷蔵庫CRUD
    └── suggest.js      # 未使用（Edge Function直呼びのため）
```

---

## 12. デザインシステム

| 変数 | 値 | 用途 |
|------|-----|------|
| --terra | #C8522A | メインカラー・CTA |
| --amber | #E8932A | アクセント・星評価 |
| --cream | #FDF6EC | 背景 |
| --olive | #6B7A3A | サブアクセント・冷蔵庫UI |
| --brown | #4A2E1A | テキスト |
| --muted | #9B8878 | サブテキスト |
| --border | #EAD9C8 | ボーダー |

フォント: 見出し Kaisei Decol / 本文 Zen Kaku Gothic New（Google Fonts）

---

## 13. 開発ロードマップ

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

### Phase 2 残タスク
- 月間カレンダービュー
- 冷蔵庫食材の期限入力UI（DBは対応済み）

### Phase 3 アレルギー・給食対応
- 家族メンバー管理（名前・アレルギー設定）
- 給食献立インポート（PDF・画像テキスト変換）
- アレルギー照合・NGアラート

### Phase 4 連携・マネタイズ
- Flowra連携・LINE連携・Stripeサブスク・iOSアプリ

---

## 14. 本番運用前にやること

```sql
-- テスト中に大量作成された不要な「わが家」世帯を削除
DELETE FROM menu_households
WHERE id NOT IN (SELECT household_id FROM menu_members);
```

---

## 15. 開発運用

- **開発スタイル**: Claudeとのチャットで開発。GitHubのPATを渡してpushまで完結。
- **引き継ぎ**: 本DESIGN.mdを新しいClaudeセッションに共有する。
- **Supabase SQL**: 管理コンソールのSQLエディタで手動実行（スマホ・iPad可）。
- **Edge Function**: Supabaseコンソールから編集・デプロイ（iPad可）。
- **別アカウントでのテスト**: シークレット/プライベートウィンドウを使う。
- **キャッシュ問題**: 全HTMLにno-cacheメタタグ追加済み。残る場合はSafari設定からWebデータ削除。
- **JS構文チェック**: Pythonでファイル生成→node --checkで確認してからpushする運用に変更（ヒアドキュメント展開による構文破壊を回避）。

---

*このドキュメントはアプリ成長に合わせて随時更新する。*
