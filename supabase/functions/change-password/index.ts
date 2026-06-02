import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  // Verify caller is admin
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Falta header Authorization" }, 401);
  const token = authHeader.replace("Bearer ", "");

  const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !callerData?.user) return json({ error: "Token inválido" }, 401);

  const { data: callerProfile } = await admin
    .from("user_profiles")
    .select("role")
    .eq("user_id", callerData.user.id)
    .maybeSingle();

  if (!callerProfile || callerProfile.role !== "admin") {
    return json({ error: "Solo admins pueden cambiar contraseñas" }, 403);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Body inválido" }, 400); }

  const { user_id, new_password } = body;

  if (!user_id || !new_password) {
    return json({ error: "user_id y new_password son requeridos" }, 400);
  }
  if (new_password.length < 6) {
    return json({ error: "La contraseña debe tener al menos 6 caracteres" }, 400);
  }

  const { error: updateErr } = await admin.auth.admin.updateUserById(user_id, {
    password: new_password,
  });

  if (updateErr) {
    return json({ error: updateErr.message }, 400);
  }

  return json({ success: true, user_id });
});
