import { getServiceSupabase } from "./supabaseService";
import { hashApiKey } from "./apiKeyCrypto";

/**
 * Resolve API key from Authorization: Bearer ccr_… or X-Api-Key header.
 * Returns { ok, scopes, keyId } or { ok: false, status, error }.
 */
export async function authenticateApiKey(request) {
  const auth = request.headers.get("authorization") || "";
  const xKey = request.headers.get("x-api-key") || "";

  let raw = "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    raw = auth.slice(7).trim();
  } else if (xKey) {
    raw = xKey.trim();
  }

  if (!raw || !raw.startsWith("ccr_")) {
    return { ok: false, status: 401, error: "Missing or invalid API key (expected ccr_…)" };
  }

  let keyHash;
  try {
    keyHash = hashApiKey(raw);
  } catch (e) {
    return { ok: false, status: 500, error: e.message || "Key hashing failed" };
  }

  const svc = getServiceSupabase();
  if (!svc) return { ok: false, status: 500, error: "Server misconfigured (service role)" };

  const { data: row, error } = await svc
    .from("api_keys")
    .select("id, scopes, revoked_at")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: error.message };
  if (!row || row.revoked_at) return { ok: false, status: 401, error: "Invalid or revoked API key" };

  const keyId = row.id;
  const scopes = Array.isArray(row.scopes) ? row.scopes : [];

  // Fire-and-forget last_used (non-blocking)
  void svc.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyId);

  return { ok: true, scopes, keyId, svc };
}
