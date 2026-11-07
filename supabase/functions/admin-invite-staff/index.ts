import { createClient } from "npm:@supabase/supabase-js@2";

const requireEnv = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret: ${name}`);
  return value;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const normalizeRole = (value?: string | null) =>
  (value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

const isSystemAdminRole = (value?: string | null) =>
  normalizeRole(value) === "system_admin";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed." }, 405);
  }

  try {
    const url = requireEnv("SUPABASE_URL");
    const anonKey = requireEnv("SUPABASE_ANON_KEY");
    const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const userClient = createClient(url, anonKey, {
      global: {
        headers: { Authorization: req.headers.get("Authorization") ?? "" },
      },
      auth: { persistSession: false },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return json({ ok: false, error: "Please sign in again." }, 401);
    }

    const { data: callerProfile, error: profileError } = await userClient
      .from("profiles")
      .select("system_role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return json({ ok: false, error: profileError.message }, 400);
    }

    if (!isSystemAdminRole(callerProfile?.system_role)) {
      return json(
        { ok: false, error: "Only System_Admin can send invites." },
        403,
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: "Invalid request body." }, 400);
    }

    const email = String(body?.email || "")
      .trim()
      .toLowerCase();
    const role = String(body?.role || "");

    if (!email || !email.includes("@")) {
      return json({ ok: false, error: "Enter a valid email." }, 400);
    }

    if (!["System_Admin", "Staff_Admin"].includes(role)) {
      return json({ ok: false, error: "Invalid role selection." }, 400);
    }

    const adminClient = createClient(url, serviceRole, {
      auth: { persistSession: false },
    });

    const { data: inviteData, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { system_role: role },
      });

    if (inviteError) {
      return json({ ok: false, error: inviteError.message }, 400);
    }

    if (inviteData?.user?.id) {
      const { error: profileUpsertError } = await adminClient
        .from("profiles")
        .upsert(
          { id: inviteData.user.id, system_role: role },
          { onConflict: "id" },
        );

      if (profileUpsertError) {
        return json({ ok: false, error: profileUpsertError.message }, 400);
      }
    }

    return json({
      ok: true,
      message: `Invite sent to ${email}.`,
      user_id: inviteData?.user?.id ?? null,
    });
  } catch (e) {
    console.error("admin-invite-staff failed", e);
    return json(
      { ok: false, error: "Could not complete the invitation." },
      500,
    );
  }
});
