import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, stripe-signature",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const body = await req.text();
    const event = JSON.parse(body);

    const userId = event.data?.object?.metadata?.supabase_user_id
      || event.data?.object?.subscription_data?.metadata?.supabase_user_id;

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
