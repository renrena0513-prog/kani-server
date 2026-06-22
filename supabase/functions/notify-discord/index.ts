import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const webhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL");
  if (!webhookUrl) {
    return new Response("Webhook URL not configured", { status: 500 });
  }

  const body = await req.json();

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return new Response(null, { status: res.ok ? 200 : 500 });
});
