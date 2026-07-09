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

async function callGeminiWithRetry(GEMINI_API_KEY: string, payload: any): Promise<{ res: Response; data: any }> {
  const maxAttempts = 3;
  let lastRes: Response | null = null;
  let lastData: any = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const data = await res.json();
    lastRes = res;
    lastData = data;
    if (res.status !== 429) return { res, data };
    console.log(`[fridge-scan] Gemini 429 (rate limit) attempt ${attempt + 1}/${maxAttempts}`);
    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  return { res: lastRes!, data: lastData };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const GEMINI_API_KEY = Deno.env.get("TAVERA_GEMINI_API_KEY")!;

    // ===== 認証・世帯単位プラン別利用回数チェック =====
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
      .select("household_id, plan, plan_expires_at, usage_limit_overrides")
      .eq("id", user.id)
      .single();
    const householdId = member?.household_id;
    // 世帯内に1人でも有効なプレミアムメンバーがいれば、世帯全体がプレミアム扱い（ファミリープレミアム）
    const { data: isPremium } = await supabase.rpc("household_has_premium", { target_household_id: householdId });
    const overrideLimit = member?.usage_limit_overrides?.[FEATURE];
    const limit = typeof overrideLimit === "number" ? overrideLimit : (isPremium ? PREMIUM_LIMIT : FREE_LIMIT);

    const now = new Date();
    const month = now.toISOString().slice(0, 7);
    // 利用回数は个人ではなく世帯単位で共有・集計
    const { data: usageRow } = await supabase
      .from("menu_ai_usage")
      .select("count")
      .eq("household_id", householdId)
      .eq("month", month)
      .eq("feature", FEATURE)
      .maybeSingle();
    const used = usageRow?.count || 0;

    if (used >= limit) {
      return new Response(JSON.stringify({
        error: isPremium
          ? `今月の食材取り込み回数の上限（${limit}回）に達しました。来月また利用できます。`
          : `今月の食材取り込みを使い切りました（${limit}回）。プレミアムプランなら月${PREMIUM_LIMIT}回まで（月480円・年払いなら月317円相当）。`,
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

    const { res: response, data: result } = await callGeminiWithRetry(GEMINI_API_KEY, {
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mediaType, data: image } },
        ],
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    console.log("[fridge-scan] gemini status", response.status, "finishReason", result.candidates?.[0]?.finishReason);

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!text) {
      const errDetail = result.error || result.promptFeedback || "no candidates";
      const errStr = JSON.stringify(errDetail);
      const isRateLimit =
        response.status === 429 ||
        errStr.includes("RESOURCE_EXHAUSTED") ||
        errStr.includes("rate-limit") ||
        errStr.toLowerCase().includes("quota");
      console.error("[fridge-scan] no text:", errStr);
      return new Response(JSON.stringify({
        error: isRateLimit
          ? "AI解析の利用が集中しているため処理できませんでした。1～2分待ってから再試行してください。"
          : "AIが画像を解析できませんでした。もう一度お試しください。",
        detail: errDetail,
        finishReason: result.candidates?.[0]?.finishReason || "unknown",
      }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const match = text.match(/\[[\s\S]*\]/);
    let items: string[] = [];
    if (match) {
      try { items = JSON.parse(match[0]); } catch { items = []; }
    }

    if (!items.length) {
      // 食材を認識できなかった場合は利用回数を消費しない
      const finishReason = result.candidates?.[0]?.finishReason || "unknown";
      console.error("[fridge-scan] empty items. finishReason:", finishReason, "text:", text.slice(0, 300));
      return new Response(JSON.stringify({ items, finishReason, rawPreview: text.slice(0, 300) }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ===== 成功時のみ利用回数をカウントアップ（世帯単位） =====
    await supabase.from("menu_ai_usage").upsert({
      household_id: householdId, user_id: user.id, month, feature: FEATURE,
      count: used + 1, updated_at: now.toISOString(),
    }, { onConflict: "household_id,month,feature" });

    return new Response(JSON.stringify({ items, remaining: limit - (used + 1), plan: isPremium ? "premium" : "free" }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
