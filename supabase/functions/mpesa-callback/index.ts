import { createClient } from "npm:@supabase/supabase-js@2";

/* ------------------------------------------------------------------ */
/* Helpers (inlined so this function is one self-contained file)       */
/* ------------------------------------------------------------------ */
const requireEnv = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret: ${name}`);
  return value;
};

/** Service-role client. Bypasses RLS, so use only inside Edge Functions. */
const adminClient = () =>
  createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false },
    },
  );

/** Constant-time string comparison for shared secrets. */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

// Safaricom expects this exact acknowledgement
const ack = () => Response.json({ ResultCode: 0, ResultDesc: "Accepted" });

/**
 * Public endpoint called by Safaricom (deploy with --no-verify-jwt).
 * Daraja does not sign callbacks, so the URL carries a long random secret
 * (?token=...) that only Safaricom and this function know.
 */
Deno.serve(async (req) => {
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });

  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!timingSafeEqual(token, requireEnv("MPESA_CALLBACK_SECRET"))) {
    return new Response("Forbidden", { status: 403 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return ack(); // malformed, nothing we can act on
  }

  const callback = payload?.Body?.stkCallback;
  if (!callback?.CheckoutRequestID) return ack();

  const items: { Name: string; Value?: string | number }[] =
    callback.CallbackMetadata?.Item ?? [];
  const meta = (name: string) => items.find((i) => i.Name === name)?.Value;

  const { data, error } = await adminClient().rpc("settle_mpesa_payment", {
    p_checkout_request_id: String(callback.CheckoutRequestID),
    p_result_code: Number(callback.ResultCode),
    p_result_desc: String(callback.ResultDesc ?? ""),
    p_receipt:
      meta("MpesaReceiptNumber") != null
        ? String(meta("MpesaReceiptNumber"))
        : null,
    p_paid_amount: meta("Amount") != null ? Number(meta("Amount")) : null,
    p_raw: payload,
  });

  if (error) {
    // 500 so Safaricom may retry; settlement is idempotent so a retry is safe
    console.error("settle_mpesa_payment failed:", error.message);
    return new Response("Server error", { status: 500 });
  }

  console.log("callback processed:", callback.CheckoutRequestID, "->", data);
  return ack();
});
