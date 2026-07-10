import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const FEATURE = "suggest";
const FREE_LIMIT      = 10;
const PREMIUM_LIMIT   = 300;
const PREMIUM_DAY_LIMIT = 30;

const SYSTEM_PROMPT = `あなたは家庭料理の献立提案アシスタントです。
ユーザーの家族構成・冷蔵庫の食材・最近の献立・高評価メニューを考慮して、
美味しくて作りやすい献立を提案してください。

【アレルギーへの対応（最優先で厳守）】
コンテキストに「⚠️絶対に守るべきアレルギー制限」が含まれている場合、
そこに記載された食材・成分を含む料理は理由を問わず絶対に提案しないこと。
食材として直接使われていなくても、調味料・加工品に成分として含まれることが
多いもの（例：醤油やルーに含まれる小麦、つなぎに使われる卵、だしに使われる
乳成分など）にも注意し、含まれる可能性がある場合は避けるか、その料理を
提案する際は必ず注意点として明記すること。

【返答フォーマット】
料理を提案する場合は必ず以下の形式を守ってください：

① 料理名
食材：食材1、食材2、食材3
説明：一言コメント

複数提案する場合は①②③と番号を振ってください。
雑談・質問への返答は自由形式でOKです。`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
    const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_KEY      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: CORS });
    }

    const { data: member } = await supabase
      .from("menu_members")
      .select("household_id, plan, plan_expires_at, usage_limit_overrides, referral_bonus")
      .eq("id", user.id)
      .single();

    const householdId = member?.household_id;
    // 世帯内に1人でも有効なプレミアムメンバーがいれば、世帯全体がプレミアム扱い（ファミリープレミアム）
    const { data: isPremium } = await supabase.rpc("household_has_premium", { target_household_id: householdId });

    const now = new Date();
    const month = now.toISOString().slice(0, 7);
    const today = now.toISOString().slice(0, 10);

    // 利用回数は个人ではなく世帯単位で共有・集計
    const { data: usage } = await supabase
      .from("menu_ai_usage")
      .select("count, day_count, last_day")
      .eq("household_id", householdId)
      .eq("month", month)
      .eq("feature", FEATURE)
      .maybeSingle();

    const monthCount = usage?.count || 0;
    const dayCount   = usage?.last_day === today ? (usage?.day_count || 0) : 0;

    const overrideLimit = member?.usage_limit_overrides?.[FEATURE];
    const hasOverride = typeof overrideLimit === "number";
    // 紹介プログラムのボーナス回数（月間上限に加算。1日上限は据え置き）
    const referralBonus = Number(member?.referral_bonus?.[FEATURE] || 0);
    const monthLimit = (hasOverride ? overrideLimit : (isPremium ? PREMIUM_LIMIT     : FREE_LIMIT)) + referralBonus;
    const dayLimit   = hasOverride ? overrideLimit : (isPremium ? PREMIUM_DAY_LIMIT : 3);

    if (monthCount >= monthLimit || dayCount >= dayLimit) {
      return new Response(JSON.stringify({
        error: "limit_exceeded",
        count: monthCount,
        limit: monthLimit,
        plan: isPremium ? "premium" : "free",
      }), { status: 429, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    await supabase.from("menu_ai_usage").upsert({
      household_id: householdId,
      user_id: user.id,
      month,
      feature: FEATURE,
      count: monthCount + 1,
      day_count: dayCount + 1,
      last_day: today,
      updated_at: now.toISOString(),
    }, { onConflict: "household_id,month,feature" });

    const { messages, likedDishes, recentDishes, fridgeItems, familyMembers } = await req.json();

    let contextNote = "";
    if (recentDishes?.length > 0) {
      const names = [...new Set(recentDishes.map((l: any) => l.dish_name))].slice(0, 7);
      contextNote += `\n【今週の献立】${names.join("・")}`;
    }
    if (likedDishes?.length > 0) {
      const names = likedDishes.map((l: any) => l.dish_name).slice(0, 5);
      contextNote += `\n【また食べたいメニュー】${names.join("・")}`;
    }
    if (fridgeItems?.length > 0) {
      contextNote += `\n【冷蔵庫の食材】${fridgeItems.join("・")}`;
    }
    if (familyMembers?.length > 0) {
      const memberProfiles = familyMembers.map((m: any) => {
        const attrs: string[] = [];
        if (m.age_group) attrs.push(m.age_group);
        if (m.gender && m.gender !== "指定しない") attrs.push(m.gender);
        if (m.goals?.length > 0) attrs.push(...m.goals);
        return attrs.length > 0 ? `${m.nickname}（${attrs.join("・")}）` : m.nickname;
      });
      contextNote += `\n【家族構成】${memberProfiles.join(" / ")}`;

      const membersWithAllergies = familyMembers.filter((m: any) => m.allergies?.length > 0);
      if (membersWithAllergies.length > 0) {
        const allergyLines = membersWithAllergies
          .map((m: any) => `${m.nickname}：${m.allergies.join("・")}`)
          .join(" / ");
        contextNote += `\n\n【⚠️絶対に守るべきアレルギー制限】${allergyLines}`;
      }
    }

    const systemWithContext = SYSTEM_PROMPT + (contextNote ? "\n\n" + contextNote : "");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemWithContext,
        messages,
      }),
    });

    const data = await response.json();
    const reply = data.content?.[0]?.text || "提案を生成できませんでした。";

    const { data: latestUsage } = await supabase
      .from("menu_ai_usage")
      .select("count")
      .eq("household_id", householdId)
      .eq("month", month)
      .eq("feature", FEATURE)
      .maybeSingle();
    const remaining = monthLimit - (latestUsage?.count || 0);

    return new Response(JSON.stringify({ reply, remaining, limit: monthLimit, plan: isPremium ? "premium" : "free" }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
