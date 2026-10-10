import { validateDemoRequest, type DemoSubmitResponse } from "@/lib/demoRequest";

// Server-side delivery boundary. Requests are forwarded to a webhook (CRM, Zapier, Slack, etc.)
// configured via server-only env vars — never exposed to the browser:
//   DEMO_REQUEST_WEBHOOK_URL     required to enable delivery
//   DEMO_REQUEST_WEBHOOK_SECRET  optional, sent as `Authorization: Bearer <secret>`
const reply = (body: DemoSubmitResponse, status: number) => Response.json(body, { status });

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return reply({ ok: false, code: "bad_request", message: "Request body must be JSON." }, 400);
  }

  const result = validateDemoRequest(payload);
  if (!result.ok) return reply({ ok: false, code: "invalid", errors: result.errors }, 422);

  const webhook = process.env.DEMO_REQUEST_WEBHOOK_URL;
  if (!webhook) {
    return reply(
      { ok: false, code: "not_configured", message: "Demo request delivery is not connected yet, so your request was not sent." },
      503,
    );
  }

  try {
    const secret = process.env.DEMO_REQUEST_WEBHOOK_SECRET;
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(secret ? { Authorization: `Bearer ${secret}` } : {}) },
      body: JSON.stringify({ type: "demo_request", submittedAt: new Date().toISOString(), ...result.data }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
  } catch (err) {
    console.error("[demo-request] delivery failed:", err);
    return reply({ ok: false, code: "delivery_failed", message: "We couldn't deliver your request. Please try again." }, 502);
  }

  return reply({ ok: true }, 200);
}
