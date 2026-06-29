import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS });

  try {
    const STRIPE_SECRET_KEY     = Deno.env.get("TAVERA_STRIPE_SECRET_KEY") || Deno.env.get("STRIPE_SECRET_KEY_TEST")!;
    const STRIPE_PRICE_MONTHLY  = Deno.env.get("TAVERA_STRIPE_PRICE_ID")!;
    const STRIPE_PRICE_YEARLY   = Deno.env.get("TAVERA_STRIPE_YEARLY_PRICE_ID")!;
    const SUPABASE_URL          = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_KEY          = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // JWT認証
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: CORS });
    }

    const body = await req.json();
    const { successUrl, cancelUrl, billingCycle } = body;

    // billingCycle: "monthly"(デフォルト) or "yearly"
    const STRIPE_PRICE_ID = billingCycle === "yearly" ? STRIPE_PRICE_YEARLY : STRIPE_PRICE_MONTHLY;

    // 既存のStripe顧客IDを取得
    const { data: member } = await supabase
      .from("menu_members")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    let customerId = member?.stripe_customer_id;

    // 顧客が存在しない場合は作成
    if (!customerId) {
      const cusRes = await fetch("https://api.stripe.com/v1/customers", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          email: user.email || "",
          "metadata[supabase_user_id]": user.id,
        }),
      });
      const customer = await cusRes.json();
      customerId = customer.id;

      if (customerId) {
        await supabase
          .from("menu_members")
          .update({ stripe_customer_id: customerId })
          .eq("id", user.id);
      }
    }

    // Checkout Session作成
    const sessionRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        customer: customerId,
        mode: "subscription",
        "line_items[0][price]": STRIPE_PRICE_ID,
        "line_items[0][quantity]": "1",
        success_url: successUrl,
        cancel_url: cancelUrl,
        "subscription_data[metadata][supabase_user_id]": user.id,
      }),
    });

    const session = await sessionRes.json();
    if (!session.url) {
      return new Response(JSON.stringify({ error: "no_url", detail: session }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
