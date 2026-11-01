import { supabase } from "./supabase";

export const MPESA_FUNCTION = "mpesa-stk-push";

/** Accepts 07XX, 01XX, +2547XX, 2547XX and returns 2547XXXXXXXX, or null. */
export const normalizeKenyanPhone = (raw: string): string | null => {
  const digits = raw.replace(/[^\d]/g, "");
  let msisdn = digits;
  if (digits.startsWith("0")) msisdn = `254${digits.slice(1)}`;
  else if (digits.startsWith("7") || digits.startsWith("1"))
    msisdn = `254${digits}`;
  return /^254(7|1)\d{8}$/.test(msisdn) ? msisdn : null;
};

/** "254712345678" -> "25471****678" for receipts */
export const maskPhone = (msisdn?: string | null) =>
  msisdn && msisdn.length >= 9
    ? `${msisdn.slice(0, 5)}****${msisdn.slice(-3)}`
    : "";

/**
 * Asks the Edge Function to send an STK push. The server recomputes the
 * amount from the database; `amount` is only a consistency check.
 * Throws an Error with a customer-friendly message on any failure.
 */
export async function requestStkPush(args: {
  phone: string;
  orderIds: (string | number)[];
  amount: number;
  purpose?: "Checkout" | "Balance";
}): Promise<{ paymentId: string }> {
  const { data, error } = await supabase.functions.invoke(MPESA_FUNCTION, {
    body: {
      phone: args.phone,
      amount: args.amount,
      order_ids: args.orderIds,
      purpose: args.purpose ?? "Checkout",
    },
  });

  if (error) {
    // For non-2xx replies the useful message is in the response body
    let message = error.message || "Could not start the M-Pesa request.";
    try {
      const body = await (error as any).context?.json?.();
      if (body?.error) message = body.error;
      else if (body?.message) message = body.message;
    } catch {
      /* keep generic message */
    }
    throw new Error(message);
  }
  if (data?.ok === false || data?.error)
    throw new Error(data.error || "Could not start the payment.");
  return { paymentId: String(data.payment_id) };
}

export type PaymentOutcome = {
  status: "Success" | "Failed" | "Cancelled" | "Mismatch";
  result_desc?: string | null;
};

/**
 * Polls the payments table until the callback has settled the payment.
 * Resolves with null on timeout, or if `token.cancelled` is set (unmount).
 */
export function waitForPayment(
  paymentId: string,
  opts?: {
    timeoutMs?: number;
    intervalMs?: number;
    token?: { cancelled: boolean };
  },
): Promise<PaymentOutcome | null> {
  const timeoutMs = opts?.timeoutMs ?? 90_000;
  const intervalMs = opts?.intervalMs ?? 3000;

  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timer = setInterval(async () => {
      if (opts?.token?.cancelled) {
        clearInterval(timer);
        return resolve(null);
      }
      try {
        const { data } = await supabase
          .from("payments")
          .select("status, result_desc")
          .eq("id", paymentId)
          .maybeSingle();
        if (data && data.status !== "Pending") {
          clearInterval(timer);
          return resolve(data as PaymentOutcome);
        }
      } catch {
        /* keep polling until the timeout */
      }
      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        resolve(null);
      }
    }, intervalMs);
  });
}
