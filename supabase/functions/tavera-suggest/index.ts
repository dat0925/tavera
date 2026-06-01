import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const FREE_LIMIT = 10; // 無料プランの月間上限

const SYSTEM_PROMPT = `あなたは家庭料理の献立提案アシスタントです。
ユーザーの家族構成・冷蔵庫の食材・最近の献立・高評価メニューを考慮して、
美味しくて作りやすい献立を提案してください。

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

    // JWT認証
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: CORS });
    }

    // プラン確認
    const { data: member } = await supabase
      .from("menu_members")
      .select("plan, plan_expires_at")
      .eq("id", user.id)
      .single();

    const plan = member?.plan || "free";
    const isPremium = plan === "premium" &&
      (!member?.plan_expires_at || new Date(member.plan_expires_at) > new Date());

    // 無料プランは月10回制限
    if (!isPremium) {
      const month = new Date().toISOString().slice(0, 7); // YYYY-MM
      const { data: usage } = await supabase
        .from("menu_ai_usage")
        .select("count")
        .eq("user_id", user.id)
        .eq("month", month)
        .single();

      const currentCount = usage?.count || 0;
      if (currentCount >= FREE_LIMIT) {
        return new Response(JSON.stringify({
          error: "limit_exceeded",
          count: currentCount,
          limit: FREE_LIMIT,
        }), { status: 429, headers: { ...CORS, "Content-Type": "application/json" } });
      }

      // カウントアップ
      await supabase.from("menu_ai_usage").upsert({
        user_id: user.id,
        month,
        count: currentCount + 1,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,month" });
    }

    const { messages, likedDishes, recentDishes, fridgeItems } = await req.json();

    // コンテキストをsystemに追加
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

    // 無料プランの残り回数を返す
    let remaining = null;
    if (!isPremium) {
      const month = new Date().toISOString().slice(0, 7);
      const { data: usage } = await supabase
        .from("menu_ai_usage")
        .select("count")
        .eq("user_id", user.id)
        .eq("month", month)
        .single();
      remaining = FREE_LIMIT - (usage?.count || 0);
    }

    return new Response(JSON.stringify({ reply, remaining, plan }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
