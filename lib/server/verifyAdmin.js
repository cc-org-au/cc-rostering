import { getAnonSupabase } from "./supabaseService";

export async function verifyAdminRequest(request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, status: 401, error: "Missing Authorization Bearer token" };

  const supabase = getAnonSupabase();
  if (!supabase) return { ok: false, status: 500, error: "Server misconfigured" };

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser(token);
  if (userErr || !user) return { ok: false, status: 401, error: "Invalid session" };

  const { data: profile, error: profErr } = await supabase
    .from("app_users")
    .select("id, role, email, full_name")
    .eq("id", user.id)
    .single();

  if (profErr || !profile) return { ok: false, status: 403, error: "Profile not found" };
  if (profile.role !== "admin") return { ok: false, status: 403, error: "Admin only" };

  return { ok: true, user, profile };
}
