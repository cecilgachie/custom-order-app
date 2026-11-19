import { createClient } from "npm:@supabase/supabase-js@2";

/* ------------------------------------------------------------------ */
/* Helpers (inlined so this function is one self-contained file)       */
/* ------------------------------------------------------------------ */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const requireEnv = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret: ${name}`);
  return value;
};

const refuse = (error: string) => json({ ok: false, error });

const MIN_LENGTH = 10;
const MAX_LENGTH = 72; // the sign-in system only reads the first 72 characters

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    /* 1. Who is calling? */
    const userClient = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false },
    });
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user || !user.email) return json({ error: "Please sign in again." }, 401);

    // Only accounts that are still on a temporary password can use this
    if (!user.app_metadata?.must_change_password) return refuse("Your password has already been changed.");

    /* 2. Validate the new password */
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid request." }, 400);
    }
    const newPassword = String(body?.new_password ?? "");

    if (newPassword.length < MIN_LENGTH) return refuse(`Use at least ${MIN_LENGTH} characters.`);
    if (newPassword.length > MAX_LENGTH) return refuse(`Use at most ${MAX_LENGTH} characters.`);
    if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) return refuse("Use both letters and numbers.");

    // It must differ from the temporary password: if signing in with it already works, it is the same
    const probe = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: sameError } = await probe.auth.signInWithPassword({ email: user.email, password: newPassword });
    if (!sameError) return refuse("Choose a different password from the temporary one.");

    /* 3. Set the password AND clear the flag in one step, so the flag can never be cleared without a new password */
    const admin = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      password: newPassword,
      app_metadata: { must_change_password: false },
    });
    if (updateError) {
      console.error("updateUserById failed:", updateError.code, updateError.message);
      return json({ error: "Could not save your new password. Please try again." }, 500);
    }

    await admin
      .from("admin_audit_log")
      .insert({ actor_id: user.id, action: "staff_password_changed", target_id: user.id, detail: {} });

    return json({ ok: true });
  } catch (error) {
    console.error("change-temporary-password failed:", error instanceof Error ? error.message : error);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
