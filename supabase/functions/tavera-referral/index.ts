import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FEATURE = "suggest";          // ボーナス対象機能
const BONUS_PER_REFERRAL = 10;      // 1紹介あたりのAI提案上乗せ回数（双方）
const REFERRER_BONUS_CAP = 50;      // 紹介者の累計ボーナス上限（5人分）
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
      .select("id, household_id, referral_code, referral_bonus, created_at")
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
        bonus: Number(me.referral_bonus?.[FEATURE] || 0),
        bonusPerReferral: BONUS_PER_REFERRAL,
        referrerCap: REFERRER_BONUS_CAP,
        alreadyRedeemed: !!redeemed,
      });
    }

    // ===== 紹介コードを入力してボーナス受け取り =====
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
        .select("id, household_id, referral_bonus")
        .eq("referral_code", inputCode)
        .maybeSingle();
      if (!referrer) return json({ error: "コードが見つかりません" }, 404);
      if (referrer.id === user.id) return json({ error: "自分のコードは使えません" }, 400);
      if (referrer.household_id && referrer.household_id === me.household_id) {
        return json({ error: "同じ世帯のメンバーのコードは使えません（世帯内はAI回数を共有しています）" }, 400);
      }

      // 記録（referee_id UNIQUE制約が二重取得の最終防衛線）
      const { error: insErr } = await supabase
        .from("menu_referrals")
        .insert({ referrer_id: referrer.id, referee_id: user.id });
      if (insErr) return json({ error: "紹介コードは1回しか使えません" }, 400);

      // 被紹介者：+10（1回きり）
      const myBonus = Number(me.referral_bonus?.[FEATURE] || 0) + BONUS_PER_REFERRAL;
      await supabase.from("menu_members")
        .update({ referral_bonus: { ...(me.referral_bonus || {}), [FEATURE]: myBonus } })
        .eq("id", user.id);

      // 紹介者：+10（累計上限あり）
      const refBonus = Math.min(
        Number(referrer.referral_bonus?.[FEATURE] || 0) + BONUS_PER_REFERRAL,
        REFERRER_BONUS_CAP,
      );
      await supabase.from("menu_members")
        .update({ referral_bonus: { ...(referrer.referral_bonus || {}), [FEATURE]: refBonus } })
        .eq("id", referrer.id);

      return json({ ok: true, myBonus, message: `🎉 AI提案が毎月+${BONUS_PER_REFERRAL}回になりました！` });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});
