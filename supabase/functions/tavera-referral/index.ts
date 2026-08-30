import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 特典: 双方にプレミアム1ヶ月（2026-08-30 に AI+10回 から変更）
const REWARD_DAYS = 31;             // 1紹介あたりのプレミアム付与日数（双方）
const REFERRER_CAP = 5;             // 紹介者が特典を受け取れる人数の上限（=最大5ヶ月分）
const REDEEM_WINDOW_DAYS = 30;      // 被紹介者はアカウント作成からこの日数以内のみ入力可

// 紛らわしい文字（0/O/1/I/L）を除いた8文字コード
function generateCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  const rand = crypto.getRandomValues(new Uint8Array(8));
  for (let i = 0; i < 8; i++) code += chars[rand[i] % chars.length];
  return code;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// プレミアム1ヶ月を付与する。
// - Stripe課金が生きている人には触らない（Stripe側が正。二重管理を避ける）
// - 既にプレミアム（手動/紹介分）なら期限に31日を積み増す
// 戻り値: 付与できたか
async function grantPremium(supabase: any, memberId: string): Promise<boolean> {
  const { data: m } = await supabase
    .from("menu_members")
    .select("id, plan, plan_expires_at, stripe_subscription_id")
    .eq("id", memberId)
    .single();
  if (!m) return false;
  if (m.stripe_subscription_id) return false; // Stripe課金中はスキップ

  const now = Date.now();
  const base = m.plan === "premium" && m.plan_expires_at
    ? Math.max(now, new Date(m.plan_expires_at).getTime())
    : now;
  const expires = new Date(base + REWARD_DAYS * 86400000).toISOString();

  const { error } = await supabase
    .from("menu_members")
    .update({ plan: "premium", plan_expires_at: expires, cancel_at_period_end: false })
    .eq("id", memberId);
  return !error;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return json({ error: "ログインが必要です" }, 401);

    const { data: me } = await supabase
      .from("menu_members")
      .select("id, household_id, referral_code, plan, plan_expires_at, stripe_subscription_id, created_at")
      .eq("id", user.id)
      .single();
    if (!me) return json({ error: "メンバー情報が見つかりません" }, 404);

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // ===== 自分の紹介コード・実績を取得（無ければコード発行） =====
    if (action === "get") {
      let code = me.referral_code;
      if (!code) {
        for (let i = 0; i < 5; i++) {
          code = generateCode();
          const { error } = await supabase
            .from("menu_members")
            .update({ referral_code: code })
            .eq("id", user.id);
          if (!error) break;          // unique違反なら再生成
          code = null;
        }
        if (!code) return json({ error: "コード発行に失敗しました。再試行してください" }, 500);
      }
      const { count } = await supabase
        .from("menu_referrals")
        .select("id", { count: "exact", head: true })
        .eq("referrer_id", user.id);
      const { data: redeemed } = await supabase
        .from("menu_referrals")
        .select("id")
        .eq("referee_id", user.id)
        .maybeSingle();
      return json({
        code,
        referralCount: count || 0,
        rewardDays: REWARD_DAYS,
        referrerCap: REFERRER_CAP,
        alreadyRedeemed: !!redeemed,
      });
    }

    // ===== 紹介コードを入力して双方にプレミアム1ヶ月 =====
    if (action === "redeem") {
      const inputCode = String(body.code || "").trim().toUpperCase();
      if (!inputCode) return json({ error: "コードを入力してください" }, 400);

      // 登録から一定日数以内の新規ユーザーのみ（既存ユーザー同士の相互ファーミング防止）
      const ageDays = (Date.now() - new Date(me.created_at).getTime()) / 86400000;
      if (ageDays > REDEEM_WINDOW_DAYS) {
        return json({ error: `紹介コードは登録から${REDEEM_WINDOW_DAYS}日以内のアカウントのみ入力できます` }, 400);
      }

      const { data: already } = await supabase
        .from("menu_referrals")
        .select("id")
        .eq("referee_id", user.id)
        .maybeSingle();
      if (already) return json({ error: "紹介コードは1回しか使えません" }, 400);

      const { data: referrer } = await supabase
        .from("menu_members")
        .select("id, household_id")
        .eq("referral_code", inputCode)
        .maybeSingle();
      if (!referrer) return json({ error: "コードが見つかりません" }, 404);
      if (referrer.id === user.id) return json({ error: "自分のコードは使えません" }, 400);
      if (referrer.household_id && referrer.household_id === me.household_id) {
        return json({ error: "同じ世帯のメンバーのコードは使えません（世帯内はプレミアムを共有しています）" }, 400);
      }

      // 記録（referee_id UNIQUE制約が二重取得の最終防衛線）
      const { error: insErr } = await supabase
        .from("menu_referrals")
        .insert({ referrer_id: referrer.id, referee_id: user.id });
      if (insErr) return json({ error: "紹介コードは1回しか使えません" }, 400);

      // 被紹介者: プレミアム1ヶ月
      const granted = await grantPremium(supabase, user.id);

      // 紹介者: プレミアム1ヶ月（今回の分を含めて上限人数まで）
      const { count: refCount } = await supabase
        .from("menu_referrals")
        .select("id", { count: "exact", head: true })
        .eq("referrer_id", referrer.id);
      if ((refCount || 0) <= REFERRER_CAP) {
        await grantPremium(supabase, referrer.id);
      }

      return json({
        ok: true,
        message: granted
          ? `🎉 プレミアムが${REWARD_DAYS}日間無料になりました！`
          : "紹介を登録しました（現在有料プラン契約中のため、期間の付与はありません）",
      });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});
