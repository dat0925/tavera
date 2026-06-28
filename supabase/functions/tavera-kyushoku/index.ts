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

    const prompt = `この画像は${year}年${month}月の給食献立表です。各日付のメニューと材料を抽出してください。

必ずこの形式のJSONのみで返してください（マークダウン不要・説明不要）:
[
  {"date":"${year}-${mm}-01","dishes":["料理1","料理2","料理3"],"ingredients":["食材A","食材B","食材C"]},
  {"date":"${year}-${mm}-02","dishes":["料理1","料理2"],"ingredients":["食材A","食材B"]}
]

ルール:
- dateはYYYY-MM-DD形式
- dishesは料理名の配列（主食・主菜・副菜・汁物など）
- ingredientsは使用食材・アレルゲン等の補足情報を文字列の配列で（記載がなければ空配列 []）
- 土日・祝日・給食なしの日は含めない
- 料理名・食材名は簡潔に（長い説明は省略）
- 文字列内にダブルクォートや改行を含めない
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
          generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
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
