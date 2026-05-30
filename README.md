# Tavera 🍳

**献立管理Webアプリ** — 毎日の「今日何食べる？」をかんたんに。

🌐 **公開URL**: https://dat0925.github.io/tavera/

---

## プロダクト概要

Taveraは、毎日の献立を記録・振り返り・AIで提案する家族向け献立管理アプリです。  
「Taskra（タスク管理）」「Flowra（家計管理）」と同じシリーズのプロダクトです。

## 機能（Phase 1）

- ✅ Google認証（Supabase Auth）
- ✅ 献立ログ（朝・昼・夜を日付単位で記録）
- ✅ 週間カレンダービュー
- ✅ 過去ログ検索
- ✅ 家族評価（★1〜5）
- ✅ また食べたいランキング
- ✅ AI献立提案チャット（Claude API）
- ✅ 家族共有（household_idベース）

## 技術スタック

| 領域 | 技術 |
|------|------|
| フロントエンド | Vanilla JS + HTML/CSS（ビルドレス） |
| ホスティング | GitHub Pages |
| 認証・DB | Supabase（PostgreSQL + Auth） |
| AI | Anthropic Claude API |
| 決済（予定） | Stripe |

## セットアップ

### 1. Supabaseのテーブル作成

`DESIGN.md` のDB設計に従い、Supabase管理コンソールのSQLエディタで以下を実行：

```sql
-- DESIGN.md の「4. データベース設計」を参照
```

### 2. 環境変数の設定

`js/supabase.js` の以下を書き換える：

```js
const SUPABASE_URL = 'https://xxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJ...';
```

### 3. Supabase Auth設定

- Google OAuthプロバイダーを有効化
- Redirect URLに `https://dat0925.github.io/tavera/home.html` を追加

### 4. GitHub Pages設定

- Settings → Pages → Source: `main` ブランチ / `/ (root)`

## DB テーブルプレフィックス

全テーブル名は `menu_` プレフィックスで統一（他PJとの名前衝突回避）。

## ロードマップ

- [ ] アレルギー管理（家族メンバーごと）
- [ ] 給食献立インポート・照合
- [ ] Flowra（家計アプリ）との予算連携
- [ ] LINE連携
- [ ] Stripeサブスク（AI機能の有料化）
- [ ] iOSアプリ（PWA対応後）

## 引き継ぎ

Claude複数アカウント間の引き継ぎは `DESIGN.md` + 本 `README.md` を参照。
