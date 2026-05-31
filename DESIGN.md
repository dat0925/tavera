# Tavera 設計書・引き継ぎ書

**バージョン**: 0.3.1
**最終更新**: 2026-05-31
**ステータス**: MVP稼働中・Phase 2開発中

---

## 1. プロダクト概要

### ブランド
- **アプリ名**: Tavera（タベラ）
- **語源**: 「食べる」から自然に派生。taberu.co.jpが既存企業のため綴りをTaveraに変更。
- **シリーズ**: Taskra（タスク管理）・Flowra（家計管理）と同じ「ra」シリーズ
- **公開URL**: https://tavera.taskra.jp
- **GitHubリポジトリ**: https://github.com/dat0925/tavera
- **ロゴ**: テラコッタ×アンバー×オリーブグリーン。鍋・フォーク・葉のモチーフ。GPT生成。

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
| created_by | uuid | オーナーuser_id |
| created_at | timestamptz | |

### menu_members（メンバー）
| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid PK | auth.users.idと一致 |
| household_id | uuid FK | |
| name | text | |
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

### menu_ai_history（AI提案履歴）
| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid PK | |
| household_id | uuid FK | |
| prompt_summary | text | |
| response | text | |
| used | boolean | 採用したか |
| created_at | timestamptz | |

### RLSポリシー（設定済み）
- households: created_by = auth.uid()
- members: id = auth.uid()
- logs: household_idがmenu_membersのhousehold_idに含まれる
- ai_history: 同上

---

## 5. 画面構成

| ファイル | 画面 | 主な機能 |
|----------|------|---------|
| index.html | ログイン | Google OAuth |
| home.html | ホーム | 7日間日付ストリップ・朝昼夜グリッド・また食べたいランキング |
| log.html | 献立記録 | 朝昼夜タブ・料理名・食材タグ・評価・削除。記録後はホームへ自動遷移。URLパラメータでdish/date/meal受取可 |
| history.html | 履歴 | 全件一覧・キーワード検索・タップで詳細モーダル |
| suggest.html | AI提案 | チャット形式・クイック選択肢・料理名引き継ぎボタン |
| settings.html | 設定 | プロフィール・世帯名・招待コード・ログアウト |

---

## 6. 履歴詳細モーダルの仕様

- 履歴アイテムをタップ → 下からシート表示
- 表示内容: 料理名・日付・食事タイプ・食材・メモ・評価
- **「編集する」**: log.html?date=元の日付&meal=元の食事タイプ に遷移
- **「今日も作る」**: log.html?date=今日&meal=dinner&dish=料理名 に遷移（料理名引き継ぎ）
- オーバーレイタップで閉じる

---

## 7. AI提案の仕組み

1. suggest.htmlがメッセージ履歴＋高評価メニューをEdge Functionに送信
2. tavera-suggestがClaude APIを呼び出し
3. 返答から料理名を正規表現で抽出（①②③や1. などのパターン）
4. 料理名ごとに「この料理を記録する」ボタンを生成（最大3つ）
5. タップ → log.html?dish=料理名&date=今日&meal=dinner に遷移
6. log.htmlがURLパラメータから料理名を受け取り入力欄にセット

---

## 8. また食べたいの仕組み

- rating = 5 を「また食べたい」として扱う
- 履歴画面の🤍ボタンをタップ → rating を5に更新 → ❤️に変化
- ❤️をタップ → rating を3に戻す
- ホームのランキングは rating >= 4 のメニューを表示
- rating = 5 のメニューは「❤️ また食べたい」と表示

---

## 9. ファイル構成

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
│   ├── logo.png        # ヘッダー用（64x64）
│   ├── icon-32.png     # favicon
│   ├── icon-180.png    # Apple Touch Icon
│   ├── icon-192.png    # PWAアイコン
│   └── icon-512.png    # PWAアイコン（大）
├── css/
│   └── style.css
└── js/
    ├── supabase.js
    ├── auth.js
    ├── menu-log.js
    └── suggest.js      # 現在未使用（Edge Function直呼び）
```

---

## 10. デザインシステム

| 変数 | 値 | 用途 |
|------|-----|------|
| --terra | #C8522A | メインカラー・CTA |
| --amber | #E8932A | アクセント・星評価 |
| --cream | #FDF6EC | 背景 |
| --olive | #6B7A3A | サブアクセント |
| --brown | #4A2E1A | テキスト |
| --muted | #9B8878 | サブテキスト |
| --border | #EAD9C8 | ボーダー |

フォント: 見出し Kaisei Decol / 本文 Zen Kaku Gothic New（Google Fonts）

---

## 11. 開発ロードマップ

### Phase 1（完了）MVP
- Google認証・献立ログCRUD（朝昼夜・食材タグ・評価）
- ホーム（7日間ストリップ・朝昼夜グリッド・また食べたいランキング）
- 履歴・キーワード検索
- AI献立提案チャット（Edge Function経由）
- PWA対応・カスタムドメイン（tavera.taskra.jp）

### Phase 2（対応中）使い勝手の向上
- 記録後ホーム自動遷移 ✅
- また食べたいボタン（履歴の🤍） ✅
- 履歴詳細モーダル（編集・今日も作る） ✅
- キャッシュ無効化（全HTML） ✅
- **バグ修正: 履歴アイテムのonclickがmodalを開かずlocation.hrefで直遷移していた問題を修正（2026-05-31）** ✅
  - `allLogs`配列でデータを保持し`openModal(allLogs[i])`で呼び出すよう変更
  - ハートボタン（🤍/❤️）も各アイテムに描画されていなかった問題も合わせて修正
- 冷蔵庫食材メモ（常備食材登録・AI提案に自動反映）
- 月間カレンダービュー
- AI提案UI改善（食材・予算・季節を構造的に入力するフォーム）
- 家族招待フロー（招待コードで世帯参加）

### Phase 3 アレルギー・給食対応
- 家族メンバー管理（名前・アレルギー設定）
- 給食献立インポート（PDF・画像テキスト変換）
- アレルギー照合・NGアラート
- 代替メニュー提案

### Phase 4 連携・マネタイズ
- Flowra連携（食費予算の参照）
- LINE連携（外出先から献立登録・AI相談）
- Stripeサブスク（AI機能の有料プラン化）
- iOSアプリ（PWA→ネイティブ）

---

## 12. 開発運用

- **開発スタイル**: Claudeとのチャットで開発・デバッグ。PATを渡してpushまで完結。
- **引き継ぎ**: 本DESIGN.md＋README.mdを新しいClaudeセッションに共有する。
- **Supabase SQL**: 管理コンソールのSQLエディタで手動実行（スマホ・iPad可）。
- **Edge Function**: Supabaseコンソールから編集・デプロイ（iPad可）。
- **キャッシュ問題**: 全HTMLにno-cacheメタタグ追加済み。それでも残る場合はSafari設定からWebデータ削除。

---

*このドキュメントはアプリ成長に合わせて随時更新する。*
