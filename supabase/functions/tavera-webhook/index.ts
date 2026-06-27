import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, stripe-signature",
};

// Stripe Webhook署名検証（stripe-signatureヘッダーを使用）
async function verifyStripeSignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    // stripe-signatureは "t=タイムスタンプ,v1=ハッシュ" の形式
    const parts: Record<string, string> = {};
    for (const part of signature.split(",")) {
      const [k, v] = part.split("=");
      parts[k] = v;
    }
    const timestamp = parts["t"];
    const v1 = parts["v1"];
    if (!timestamp || !v1) return false;

    // 5分以上古いWebhookは拒否（リプレイ攻撃対策）
    const tolerance = 300; // 5分
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp)) > tolerance) return false;

    // 署名計算: HMAC-SHA256(timestamp + "." + body, secret)
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signedData = encoder.encode(`${timestamp}.${body}`);
    const signatureBuffer = await crypto.subtle.sign("HMAC", key, signedData);
    const computed = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return computed === v1;
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const WEBHOOK_SECRET  = Deno.env.get("TAVERA_STRIPE_WEBHOOK_SECRET")!;

    const body = await req.text();

    // Stripe署名検証
    const signature = req.headers.get("stripe-signature") || "";
    const valid = await verifyStripeSignature(body, signature, WEBHOOK_SECRET);
    if (!valid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const event = JSON.parse(body);
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    switch (event.type) {
      // サブスク開始・更新
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const uid = sub.metadata?.supabase_user_id;
        if (!uid) break;
        const isActive = sub.status === "active" || sub.status === "trialing";
        await supabase
          .from("menu_members")
          .update({
            plan: isActive ? "premium" : "free",
            stripe_subscription_id: sub.id,
            plan_expires_at: isActive
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null,
          })
          .eq("id", uid);
        break;
      }

      // サブスク削除・失効
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const uid = sub.metadata?.supabase_user_id;
        if (!uid) break;
        await supabase
          .from("menu_members")
          .update({ plan: "free", stripe_subscription_id: null, plan_expires_at: null })
          .eq("id", uid);
        break;
      }

      // 支払い失敗
      case "invoice.payment_failed": {
        const inv = event.data.object;
        const uid = inv.subscription_details?.metadata?.supabase_user_id;
        if (!uid) break;
        await supabase
          .from("menu_members")
          .update({ plan: "free" })
          .eq("id", uid);
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
