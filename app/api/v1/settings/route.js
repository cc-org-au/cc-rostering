import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/server/authenticateApiKey";
import { requireScopes } from "@/lib/apiScopes";

export async function GET(request) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { missing } = requireScopes(auth.scopes, ["read:settings"]);
  if (missing?.length)
    return NextResponse.json({ error: "Insufficient scope", required: "read:settings" }, { status: 403 });

  const { data, error } = await auth.svc.from("settings").select("key, value, updated_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data || [] });
}

export async function PATCH(request) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { missing } = requireScopes(auth.scopes, ["write:settings"]);
  if (missing?.length)
    return NextResponse.json({ error: "Insufficient scope", required: "write:settings" }, { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const key = body.key;
  const value = body.value;
  if (!key || value === undefined) return NextResponse.json({ error: "key and value required" }, { status: 400 });

  const { data, error } = await auth.svc
    .from("settings")
    .upsert({ key, value, updated_at: new Date().toISOString() })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ setting: data });
}
