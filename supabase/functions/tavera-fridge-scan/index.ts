import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const FEATURE = "fridge";
const FREE_LIMIT = 30;
const PREMIUM_LIMIT = 100;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const GEMINI_API_KEY = Deno.env.get("TAVERA_GEMINI_API_KEY")!;

    // ===== 認証・プラン別利用回数チェック =====
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "ログインが必要です" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { data: member } = await supabase
      .from("menu_members")
      .select("plan, plan_expires_at")
      .eq("id", user.id)
      .single();
    const plan = member?.plan || "free";
    const isPremium = plan === "premium" &&
      (!member?.plan_expires_at || new Date(member.plan_expires_at) > new Date());
    const limit = isPremium ? PREMIUM_LIMIT : FREE_LIMIT;

    const now = new Date();
    const month = now.toISOString().slice(0, 7);
    const { data: usageRow } = await supabase
      .from("menu_ai_usage")
      .select("count")
      .eq("user_id", user.id)
      .eq("month", month)
      .eq("feature", FEATURE)
      .maybeSingle();
    const used = usageRow?.count || 0;

    if (used >= limit) {
      return new Response(JSON.stringify({
        error: `今月の食材取り込み回数の上限（${limit}回）に達しました。${isPremium ? "" : "プレミアムプランなら月" + PREMIUM_LIMIT + "回まで利用できます。"}`,
        count: used, limit, plan: isPremium ? "premium" : "free",
      }), { status: 429, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const { image, mediaType } = await req.json();
    if (!image || !mediaType) {
      return new Response(JSON.stringify({ error: "image and mediaType are required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const prompt = `この冷蔵庫・食材の写真に写っている食材・食品をすべて日本語で列挙してください。

以下のルールに従ってください：
- 食材名のみをJSON配列で返す（例：["卵", "牛乳", "にんじん", "豚肉"]）
- 調味料（醤油・砂糖・塩など）は除外する
- ブランド名・商品名ではなく一般的な食材名で返す
- はっきり見えないものは含めない
- JSON配列のみ返し、説明文は不要`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mediaType, data: image } },
            ],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
        }),
      }
    );

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "[]";

    const match = text.match(/\[[\s\S]*?\]/);
    let items: string[] = [];
    if (match) {
      try { items = JSON.parse(match[0]); } catch { items = []; }
    }

    if (!items.length) {
      // 食材を認識できなかった場合は利用回数を消費しない
      return new Response(JSON.stringify({ items }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ===== 成功時のみ利用回数をカウントアップ =====
    await supabase.from("menu_ai_usage").upsert({
      user_id: user.id, month, feature: FEATURE,
      count: used + 1, updated_at: now.toISOString(),
    }, { onConflict: "user_id,month,feature" });

    return new Response(JSON.stringify({ items, remaining: limit - (used + 1), plan: isPremium ? "premium" : "free" }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
