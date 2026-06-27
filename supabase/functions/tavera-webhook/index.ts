import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  try {
    const SUPABASE_URL   = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const body = await req.text();
    const event = JSON.parse(body);
    console.log("event.type:", event.type);

    const sub = event.data?.object;
    const uid = sub?.metadata?.supabase_user_id;

    if (uid && (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated")) {
      const isActive = sub.status === "active" || sub.status === "trialing";
      const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
      const plan_expires_at = isActive && periodEnd
        ? new Date(periodEnd * 1000).toISOString() : null;

      const res = await fetch(`${SUPABASE_URL}/rest/v1/menu_members?id=eq.${uid}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          plan: isActive ? "premium" : "free",
          stripe_subscription_id: sub.id,
          plan_expires_at,
        }),
      });
      console.log("PATCH status:", res.status);

    } else if (uid && event.type === "customer.subscription.deleted") {
      await fetch(`${SUPABASE_URL}/rest/v1/menu_members?id=eq.${uid}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({ plan: "free", stripe_subscription_id: null, plan_expires_at: null }),
      });

    } else if (event.type === "invoice.payment_failed") {
      const failUid = event.data?.object?.subscription_details?.metadata?.supabase_user_id;
      if (failUid) {
        await fetch(`${SUPABASE_URL}/rest/v1/menu_members?id=eq.${failUid}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${SUPABASE_KEY}`,
            "Prefer": "return=minimal",
          },
          body: JSON.stringify({ plan: "free" }),
        });
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("EXCEPTION:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});
