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
  createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const darajaBaseUrl = () =>
  Deno.env.get("MPESA_ENV") === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

// Daraja access tokens last about an hour; reuse them between warm invocations
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getDarajaToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;

  const credentials = btoa(`${requireEnv("MPESA_CONSUMER_KEY")}:${requireEnv("MPESA_CONSUMER_SECRET")}`);
  const res = await fetch(`${darajaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  });
  if (!res.ok) throw new Error(`Daraja auth failed (${res.status})`);

  const body = await res.json();
  cachedToken = {
    value: body.access_token,
    expiresAt: Date.now() + (Number(body.expires_in) || 3500) * 1000,
  };
  return cachedToken.value;
}

/** YYYYMMDDHHmmss in East Africa Time (UTC+3), the format Daraja expects. */
function eatTimestamp(date = new Date()): string {
  const eat = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${eat.getUTCFullYear()}${p(eat.getUTCMonth() + 1)}${p(eat.getUTCDate())}` +
    `${p(eat.getUTCHours())}${p(eat.getUTCMinutes())}${p(eat.getUTCSeconds())}`
  );
}

const PHONE_RE = /^254(7|1)\d{8}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ORDERS = 20;
const DUPLICATE_WINDOW_MS = 3 * 60 * 1000;

// Business problems are returned with HTTP 200 and { ok: false, error }, so the
// app can show the message directly. Real faults return 4xx/5xx.
const refuse = (error: string) => json({ ok: false, error });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    /* 1. Who is calling? (verify the JWT, never trust a user id in the body) */
    const userClient = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false },
    });
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Please sign in again." }, 401);

    /* 2. Validate input */
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid request body." }, 400);
    }

    const phone = String(body?.phone ?? "");
    if (!PHONE_RE.test(phone)) return refuse("Enter a valid Safaricom number, e.g. 0712 345 678.");

    const orderIds: string[] = Array.from(
      new Set<string>(Array.isArray(body?.order_ids) ? body.order_ids.map(String) : [])
    );
    if (orderIds.length === 0 || orderIds.length > MAX_ORDERS || !orderIds.every((id) => UUID_RE.test(id))) {
      return refuse("Your cart is empty or invalid. Pull to refresh and try again.");
    }

    // Checkout = first payment (full, or 50% deposit). Balance = remainder of a paid deposit.
    const purpose: "Checkout" | "Balance" = body?.purpose === "Balance" ? "Balance" : "Checkout";

    /* 3. Price the cart on the server from the database, not from the app */
    const db = adminClient();
    let ordersQuery = db
      .from("cake_orders")
      .select("id, total_price, amount_paid, payment_type")
      .in("id", orderIds)
      .eq("user_id", user.id);
    ordersQuery =
      purpose === "Balance"
        ? ordersQuery.eq("payment_status", "Deposit Paid").neq("order_status", "Cancelled")
        : ordersQuery.eq("payment_status", "Unpaid").eq("order_status", "Pending Review");
    const { data: orders, error: ordersError } = await ordersQuery;
    if (ordersError) throw ordersError;

    if (!orders || orders.length !== orderIds.length) {
      return refuse("Your cart changed. Pull to refresh and review it before paying.");
    }

    const amount = orders.reduce((sum: number, o: any) => {
      const price = Math.round(Number(o.total_price) || 0);
      if (purpose === "Balance") return sum + Math.max(0, price - (Number(o.amount_paid) || 0));
      return sum + (o.payment_type === "Deposit" ? Math.ceil(price / 2) : price);
    }, 0);
    if (amount < 1) return refuse("Nothing to pay for these items.");

    // The app shows the customer a total. If it disagrees with ours, stop.
    if (body?.amount !== undefined && Number(body.amount) !== amount) {
      return refuse("Your cart total changed. Pull to refresh to see the new amount.");
    }

    /* 4. Block double prompts for the same items */
    const since = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
    const { data: recent } = await db
      .from("payments")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "Pending")
      .overlaps("order_ids", orderIds)
      .gte("created_at", since)
      .limit(1);
    if (recent && recent.length > 0) {
      return refuse("A payment prompt was already sent. Check your phone, or try again in a few minutes.");
    }

    /* 5. Record the attempt BEFORE calling Daraja (audit trail even if it fails) */
    const { data: payment, error: insertError } = await db
      .from("payments")
      .insert({ user_id: user.id, order_ids: orderIds, phone, amount, status: "Pending", purpose })
      .select("id")
      .single();
    if (insertError || !payment) throw insertError ?? new Error("Could not record payment");

    /* 6. STK push */
    const shortcode = requireEnv("MPESA_SHORTCODE");
    const timestamp = eatTimestamp();
    const password = btoa(`${shortcode}${requireEnv("MPESA_PASSKEY")}${timestamp}`);
    const callbackUrl =
      `${requireEnv("MPESA_CALLBACK_URL")}?token=${encodeURIComponent(requireEnv("MPESA_CALLBACK_SECRET"))}`;

    const token = await getDarajaToken();
    const res = await fetch(`${darajaBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        // CustomerPayBillOnline for a Paybill, CustomerBuyGoodsOnline for a Till
        TransactionType: Deno.env.get("MPESA_TRANSACTION_TYPE") ?? "CustomerPayBillOnline",
        Amount: amount,
        PartyA: phone,
        // For a Till, PartyB is the Till number (set MPESA_PARTY_B); for a Paybill it is the shortcode
        PartyB: Deno.env.get("MPESA_PARTY_B") ?? shortcode,
        PhoneNumber: phone,
        CallBackURL: callbackUrl,
        AccountReference: "VaticanCake",
        TransactionDesc: purpose === "Balance" ? "Cake balance" : "Cake order",
      }),
    });
    const result = await res.json().catch(() => ({}));

    if (!res.ok || result?.ResponseCode !== "0") {
      await db
        .from("payments")
        .update({
          status: "Failed",
          result_desc: String(result?.errorMessage ?? result?.ResponseDescription ?? `Daraja error ${res.status}`),
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.id);
      console.error("STK push rejected", res.status, result?.errorCode, result?.errorMessage ?? result?.ResponseDescription);
      return refuse("M-Pesa could not start the request. Please try again in a moment.");
    }

    await db
      .from("payments")
      .update({
        merchant_request_id: result.MerchantRequestID,
        checkout_request_id: result.CheckoutRequestID,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id);

    return json({
      ok: true,
      payment_id: payment.id,
      checkout_request_id: result.CheckoutRequestID,
      purpose,
      message: result.CustomerMessage ?? "Check your phone and enter your M-Pesa PIN.",
    });
  } catch (error) {
    console.error("mpesa-stk-push failed:", error instanceof Error ? error.message : error);
    return json({ error: "Something went wrong starting the payment. Please try again." }, 500);
  }
});
