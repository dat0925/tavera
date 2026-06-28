const GEMINI_API_KEY = Deno.env.get("TAVERA_GEMINI_API_KEY")!;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { image, mediaType, year, month } = await req.json();
    const mm = String(month).padStart(2, "0");

    const prompt = `この画像は${year}年${month}月の給食献立表です。各日付のメニューを抽出してください。

必ずこの形式のJSONのみで返してください（マークダウン不要・説明不要）:
[
  {"date":"${year}-${mm}-01","dishes":["料理1","料理2","料理3"]},
  {"date":"${year}-${mm}-02","dishes":["料理1","料理2"]}
]

ルール:
- dateはYYYY-MM-DD形式
- dishesは料理名の配列（主食・主菜・副菜・汁物など）
- 土日・祝日・給食なしの日は含めない
- 料理名は簡潔に（補足説明は省略）
- JSONのみ返すこと`;

    const res = await fetch(
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
          generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
        }),
      }
    );

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    const match = text.match(/\[[\s\S]*\]/);
    const menu = match ? JSON.parse(match[0]) : [];

    return new Response(JSON.stringify({ menu }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
