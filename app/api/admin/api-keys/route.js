import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/server/verifyAdmin";
import { getServiceSupabase } from "@/lib/server/supabaseService";
import { generateApiKey, hashApiKey, keyPrefix } from "@/lib/server/apiKeyCrypto";
import { ALL_SCOPE_IDS } from "@/lib/apiScopes";

export async function GET(request) {
  const admin = await verifyAdminRequest(request);
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

  const svc = getServiceSupabase();
  if (!svc) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  const { data, error } = await svc
    .from("api_keys")
    .select("id, name, key_prefix, scopes, created_at, last_used_at, revoked_at, created_by")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ keys: data || [] });
}

export async function POST(request) {
  const admin = await verifyAdminRequest(request);
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const scopes = Array.isArray(body.scopes) ? body.scopes.filter((s) => typeof s === "string") : [];
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (scopes.length === 0) return NextResponse.json({ error: "Select at least one scope" }, { status: 400 });

  const invalid = scopes.filter((s) => !ALL_SCOPE_IDS.includes(s));
  if (invalid.length) return NextResponse.json({ error: `Invalid scopes: ${invalid.join(", ")}` }, { status: 400 });

  const svc = getServiceSupabase();
  if (!svc) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  const plainKey = generateApiKey();
  let keyHash;
  try {
    keyHash = hashApiKey(plainKey);
  } catch (e) {
    return NextResponse.json({ error: e.message || "Key generation failed" }, { status: 500 });
  }

  const prefix = keyPrefix(plainKey);

  const { data: row, error } = await svc
    .from("api_keys")
    .insert({
      name,
      key_prefix: prefix,
      key_hash: keyHash,
      scopes,
      created_by: admin.user.id,
    })
    .select("id, name, key_prefix, scopes, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Plain key returned only in this response
  return NextResponse.json({
    ...row,
    key: plainKey,
    warning: "Copy this key now. It will not be shown again.",
  });
}
