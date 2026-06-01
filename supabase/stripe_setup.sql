-- =============================================
-- Tavera Stripe サブスク対応 DBマイグレーション
-- Supabase SQL Editorで実行する
-- =============================================

-- 1. menu_membersにプラン情報を追加
ALTER TABLE menu_members
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz;

-- 2. AI利用回数トラッキングテーブル
CREATE TABLE IF NOT EXISTS menu_ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month text NOT NULL,  -- 'YYYY-MM' 形式
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, month)
);

-- RLS有効化
ALTER TABLE menu_ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_usage_self" ON menu_ai_usage
  FOR ALL USING (user_id = auth.uid());

-- 3. インデックス
CREATE INDEX IF NOT EXISTS idx_menu_ai_usage_user_month
  ON menu_ai_usage(user_id, month);
