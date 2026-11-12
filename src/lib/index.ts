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
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const requireEnv = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret: ${name}`);
  return value;
};

// Business problems return HTTP 200 with { ok: false, error } so the app can show the text
const refuse = (error: string) => json({ ok: false, error });

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    /* 1. Who is asking? The user can only ever delete THEIR OWN account. */
    const userClient = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false },
    });
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Please sign in again." }, 401);

    /* 2. The app must send an explicit confirmation */
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      /* handled below */
    }
    if (body?.confirm !== "DELETE") return refuse("Please type DELETE to confirm.");

    /* 3. Erase personal data (the database function re-checks that deletion is allowed) */
    const admin = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    const { error: eraseError } = await admin.rpc("erase_user_data", { p_user_id: user.id });
    if (eraseError) {
      // P0001 = a message we wrote ourselves with `raise exception`, safe to show
      if (eraseError.code === "P0001") return refuse(eraseError.message);
      console.error("erase_user_data failed:", eraseError.code, eraseError.message);
      return json({ error: "We could not delete your data. Please try again." }, 500);
    }

    /* 3b. Remove the profile picture files (best effort: a failure here must not block deletion) */
    try {
      const { data: files } = await admin.storage.from("avatars").list(user.id);
      if (files && files.length > 0) {
        await admin.storage.from("avatars").remove(files.map((f) => `${user.id}/${f.name}`));
      }
    } catch (e) {
      console.error("avatar cleanup failed:", e instanceof Error ? e.message : e);
    }

    /* 4. Remove the sign-in itself (this also ends every session and unlinks Google) */
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      // Data is already erased and the step is repeatable, so the customer can simply retry
      console.error("deleteUser failed:", deleteError.message);
      return json({ error: "We could not finish deleting your account. Please try again." }, 500);
    }

    return json({ ok: true });
  } catch (error) {
    console.error("delete-account failed:", error instanceof Error ? error.message : error);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});