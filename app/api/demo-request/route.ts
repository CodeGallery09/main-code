import {
  validateDemoRequest,
  validateFounderCall,
  type DemoSubmitResponse,
  type FounderSubmitResponse,
} from "@/lib/demoRequest";

// Server-side delivery boundary. Requests are forwarded to a webhook (CRM, Zapier, Slack, etc.)
// configured via server-only env vars — never exposed to the browser:
//   DEMO_REQUEST_WEBHOOK_URL     required to enable delivery
//   DEMO_REQUEST_WEBHOOK_SECRET  optional, sent as `Authorization: Bearer <secret>`
// Two request shapes share this endpoint: the demo form (default) and the founder-call booker
// (`kind: "founder_call"`). The webhook payload's `type` tells them apart.
type Reply = DemoSubmitResponse | FounderSubmitResponse;
const reply = (body: Reply, status: number) => Response.json(body, { status });

/** Forwards a validated payload. Returns a failure response, or null when delivered. */
async function deliver(type: string, data: object): Promise<Response | null> {
  const webhook = process.env.DEMO_REQUEST_WEBHOOK_URL;
  if (!webhook) {
    return reply(
      { ok: false, code: "not_configured", message: "Delivery is not connected yet, so your request was not sent." },
      503,
    );
  }
  try {
    const secret = process.env.DEMO_REQUEST_WEBHOOK_SECRET;
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(secret ? { Authorization: `Bearer ${secret}` } : {}) },
      body: JSON.stringify({ type, submittedAt: new Date().toISOString(), ...data }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
  } catch (err) {
    console.error(`[${type}] delivery failed:`, err);
    return reply({ ok: false, code: "delivery_failed", message: "We couldn't deliver your request. Please try again." }, 502);
  }
  return null;
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return reply({ ok: false, code: "bad_request", message: "Request body must be JSON." }, 400);
  }

  if (payload && typeof payload === "object" && (payload as { kind?: unknown }).kind === "founder_call") {
    const result = validateFounderCall(payload);
    if (!result.ok) return reply({ ok: false, code: "invalid", errors: result.errors }, 422);
    return (await deliver("founder_call_request", result.data)) ?? reply({ ok: true }, 200);
  }

  const result = validateDemoRequest(payload);
  if (!result.ok) return reply({ ok: false, code: "invalid", errors: result.errors }, 422);
  return (await deliver("demo_request", result.data)) ?? reply({ ok: true }, 200);
}
