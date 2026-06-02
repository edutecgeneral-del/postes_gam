import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ROLES = ["admin", "capturador", "director", "scout", "servicios_urbanos", "participacion_ciudadana", "raal"];
const ALL_STAGES = ["marca", "dado", "parado", "camaras", "internet", "conexion_poste", "centro"];
const RAAL_STAGES = ["dado", "parado"];

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
    return json({ error: "Solo admins pueden crear usuarios" }, 403);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Body inválido" }, 400); }

  const { email, password, role, display_name, allowed_stages } = body;

  if (!email || !password || !role) {
    return json({ error: "email, password y role son requeridos" }, 400);
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return json({ error: `role debe ser uno de: ${ALLOWED_ROLES.join(", ")}` }, 400);
  }
  if (password.length < 6) {
    return json({ error: "password debe tener al menos 6 caracteres" }, 400);
  }

  const { data: newUserData, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !newUserData?.user) {
    return json({ error: createErr?.message || "No se pudo crear el usuario" }, 400);
  }

  // RAAL gets only E2+E3 stages
  let stages = Array.isArray(allowed_stages) ? allowed_stages : ALL_STAGES;
  if (role === "raal") {
    stages = RAAL_STAGES;
  }

  const profileRow: Record<string, unknown> = {
    user_id: newUserData.user.id,
    role,
    display_name: display_name || email.split("@")[0],
    allowed_stages: stages,
  };

  const { error: insertErr } = await admin.from("user_profiles").insert(profileRow);
  if (insertErr) {
    await admin.auth.admin.deleteUser(newUserData.user.id);
    return json({ error: `No se pudo crear el perfil: ${insertErr.message}` }, 500);
  }

  return json({
    user_id: newUserData.user.id,
    email: newUserData.user.email,
    role,
    display_name: profileRow.display_name,
    allowed_stages: profileRow.allowed_stages,
  }, 201);
});
