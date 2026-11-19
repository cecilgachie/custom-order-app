import { createClient } from "npm:@supabase/supabase-js@2";

/* ------------------------------------------------------------------ */
/* Helpers (inlined so this function is one self-contained file)       */
/* ------------------------------------------------------------------ */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// no-store: the response contains a password, so it must never be cached anywhere
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

// Business problems return HTTP 200 with { ok: false, error } so the app can show the text
const refuse = (error: string) => json({ ok: false, error });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const ROLES = ["Staff_Admin", "System_Admin"];

// No look-alike characters (0/O, 1/l/I) so it can be read out or typed from a message
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** 16 random characters from a secure source, shown as XXXX-XXXX-XXXX-XXXX (about 93 bits). */
function generateTempPassword(): string {
  const limit = 256 - (256 % ALPHABET.length); // rejection sampling: no modulo bias
  const out: string[] = [];
  while (out.length < 16) {
    const buf = new Uint8Array(32);
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < limit && out.length < 16) out.push(ALPHABET[b % ALPHABET.length]);
    }
  }
  return out.join("").replace(/(.{4})(?=.)/g, "$1-");
}

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    /* 1. Who is calling? Verified on the server: hiding a button in the app is not security. */
    const userClient = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false },
    });
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Please sign in again." }, 401);

    const admin = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    // Only a System Admin may create staff, and not while still on a temporary password
    const { data: me } = await admin.from("profiles").select("system_role").eq("id", user.id).maybeSingle();
    if (me?.system_role !== "System_Admin") {
      return json({ error: "Only a System Admin can create staff accounts." }, 403);
    }
    if (user.app_metadata?.must_change_password) {
      return refuse("Please choose your own password first.");
    }

    /* 2. Validate input */
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid request." }, 400);
    }
    const email = String(body?.email ?? "").trim().toLowerCase();
    const username = String(body?.username ?? "").trim().toLowerCase();
    const role = String(body?.role ?? "");

    if (!EMAIL_RE.test(email) || email.length > 254) return refuse("Enter a valid email address.");
    if (!USERNAME_RE.test(username)) return refuse("Username needs 3 to 20 letters, numbers or underscores.");
    if (!ROLES.includes(role)) return refuse("Choose a role for this account.");

    const { data: taken } = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
    if (taken) return refuse("That username is already taken.");

    /* 3. Create the sign-in. The flag goes in app_metadata, which only THIS server can write.
          (user_metadata can be edited by the user, so a staff member could clear a flag kept there.) */
    const tempPassword = generateTempPassword();
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { username, created_by_admin: true },
      app_metadata: { must_change_password: true },
    });

    if (createError || !created?.user) {
      const text = (createError?.message ?? "").toLowerCase();
      if (createError?.code === "email_exists" || text.includes("already") || text.includes("registered")) {
        return refuse("An account with that email already exists.");
      }
      console.error("createUser failed:", createError?.code, createError?.message);
      return json({ error: "Could not create the account.", detail: createError?.message ?? "unknown error" }, 500);
    }

    /* 4. Give the profile its role (the service role is allowed to; customers are not) */
    const { error: profileError } = await admin
      .from("profiles")
      .upsert({ id: created.user.id, system_role: role, username }, { onConflict: "id" });

    if (profileError) {
      // Never leave a half-made account behind
      await admin.auth.admin.deleteUser(created.user.id);
      console.error("profile setup failed:", profileError.code, profileError.message);
      return json({ error: "Could not finish setting up the account. Nothing was created.", detail: profileError.message }, 500);
    }

    /* 5. Audit trail (best effort). Never log the password. */
    await admin
      .from("admin_audit_log")
      .insert({ actor_id: user.id, action: "create_staff", target_id: created.user.id, detail: { email, role } });

    return json({ ok: true, user_id: created.user.id, temp_password: tempPassword });
  } catch (error) {
    console.error("admin-create-staff failed:", error instanceof Error ? error.message : error);
    return json({ error: "Something went wrong.", detail: error instanceof Error ? error.message : String(error) }, 500);
  }
});
