const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const GEMINI_API_KEY = Deno.env.get("TAVERA_GEMINI_API_KEY")!;

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

    return new Response(JSON.stringify({ items }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
