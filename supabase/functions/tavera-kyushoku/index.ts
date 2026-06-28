const GEMINI_API_KEY = Deno.env.get("TAVERA_GEMINI_API_KEY")!;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

async function fetchUrlAsBase64(url: string): Promise<{ base64: string; mediaType: string }> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "application/pdf,image/*,text/html;q=0.8,*/*;q=0.5",
      "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`URL fetch failed: ${res.status} ${res.statusText}`);

  const contentType = res.headers.get("content-type") || "";
  const urlLower = url.toLowerCase();

  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  const isPdfMagic = bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  const isPngMagic = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isJpgMagic = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;

  let mediaType = "application/octet-stream";
  if (isPdfMagic) mediaType = "application/pdf";
  else if (isPngMagic) mediaType = "image/png";
  else if (isJpgMagic) mediaType = "image/jpeg";
  else if (contentType.includes("pdf")) mediaType = "application/pdf";
  else if (contentType.includes("png")) mediaType = "image/png";
  else if (contentType.includes("jpeg") || contentType.includes("jpg")) mediaType = "image/jpeg";
  else if (urlLower.includes(".pdf")) mediaType = "application/pdf";

  const looksLikeHtml =
    contentType.includes("html") ||
    (bytes.length > 15 && new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 15)).trim().toLowerCase().startsWith("<!doctype"));
  if (looksLikeHtml && !isPdfMagic && !isPngMagic && !isJpgMagic) {
    const preview = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 200));
    throw new Error(
      `URLからPDF/画像を取得できませんでした（サーバーがHTMLを返却・アクセス制限の可能性があります）: ${preview.slice(0, 120)}`
    );
  }

  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return { base64: btoa(binary), mediaType };
}

async function callGeminiWithRetry(payload: any): Promise<{ res: Response; data: any }> {
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
    console.log(`[kyushoku] Gemini 429 (rate limit) attempt ${attempt + 1}/${maxAttempts}`);
    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  return { res: lastRes!, data: lastData };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const { year, month } = body;
    let image: string = body.image;
    let mediaType: string = body.mediaType;

    if (!image && body.url) {
      console.log("[kyushoku] URL mode:", body.url);
      const fetched = await fetchUrlAsBase64(body.url);
      image = fetched.base64;
      mediaType = fetched.mediaType;
      console.log("[kyushoku] fetched mediaType:", mediaType, "size:", image.length);
    }

    if (!image || !mediaType) {
      return new Response(JSON.stringify({ error: "image/url and mediaType are required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const mm = String(month).padStart(2, "0");
    const prompt = `この画像は${year}年${month}月の給食献立表です。各日付のメニューと材料を抽出してください。

ルール:
- dateは${year}-${mm}-DD形式（DDは2桁の日付）
- dishesは料理名の配列（主食・主菜・副菜・汁物など）
- ingredientsは使用食材・アレルゲン等の補足情報の配列（記載がなければ空配列）
- 土日・祝日・給食なしの日は含めない
- 料理名・食材名は簡潔に`;

    const { res: geminiRes, data: geminiData } = await callGeminiWithRetry({
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mediaType, data: image } }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 16384,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              date: { type: "STRING" },
              dishes: { type: "ARRAY", items: { type: "STRING" } },
              ingredients: { type: "ARRAY", items: { type: "STRING" } },
            },
            required: ["date", "dishes", "ingredients"],
          },
        },
      },
    });
    console.log("[kyushoku] gemini status", geminiRes.status, "finishReason", geminiData.candidates?.[0]?.finishReason);

    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!text) {
      const errDetail = geminiData.error || geminiData.promptFeedback || "no candidates";
      const errStr = JSON.stringify(errDetail);
      const isRateLimit =
        geminiRes.status === 429 ||
        errStr.includes("RESOURCE_EXHAUSTED") ||
        errStr.includes("rate-limit") ||
        errStr.toLowerCase().includes("quota");
      const userMessage = isRateLimit
        ? "AI解析の利用が集中しているため処理できませんでした。1〜2分待ってから再試行してください。"
        : "AIが献立を読み取れませんでした。画像/PDFの内容を確認して再試行してください。";
      console.error("[kyushoku] no text:", errStr);
      return new Response(JSON.stringify({ error: userMessage, detail: errDetail }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    let menu: any;
    try {
      menu = JSON.parse(text);
    } catch (parseErr: any) {
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          menu = JSON.parse(match[0]);
        } catch {
        }
      }
      if (!menu) {
        const finishReason = geminiData.candidates?.[0]?.finishReason || "unknown";
        console.error("[kyushoku] JSON parse failed:", parseErr.message, "finishReason:", finishReason, text.slice(0, 300));
        return new Response(
          JSON.stringify({
            error: `解析結果の読み取りに失敗しました（${finishReason === "MAX_TOKENS" ? "出力が長すぎて途中で切れました" : "もう一度お試しください"}）。`,
            detail: parseErr.message,
            finishReason,
            raw: text.slice(0, 300),
          }),
          { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }
    }
    console.log("[kyushoku] parsed menu items:", menu.length);

    return new Response(JSON.stringify({ menu }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[kyushoku] error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
