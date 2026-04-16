import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/server/verifyAdmin";
import { getServiceSupabase } from "@/lib/server/supabaseService";

export async function POST(request, context) {
  const admin = await verifyAdminRequest(request);
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

  const params = await context.params;
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const svc = getServiceSupabase();
  if (!svc) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  const { data, error } = await svc
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Key not found or already revoked" }, { status: 404 });

  return NextResponse.json({ ok: true, id: data.id });
}
