import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/server/authenticateApiKey";
import { requireScopes } from "@/lib/apiScopes";

export async function GET(request) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { missing } = requireScopes(auth.scopes, ["read:employees"]);
  if (missing?.length)
    return NextResponse.json({ error: "Insufficient scope", required: "read:employees" }, { status: 403 });

  const { data, error } = await auth.svc.from("employees").select("*").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ employees: data || [] });
}

export async function POST(request) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { missing } = requireScopes(auth.scopes, ["write:employees"]);
  if (missing?.length)
    return NextResponse.json({ error: "Insufficient scope", required: "write:employees" }, { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const row = mapEmpBody(body);
  if (!row.id || !row.name) return NextResponse.json({ error: "id and name are required" }, { status: 400 });

  const { data, error } = await auth.svc.from("employees").upsert(row).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ employee: data });
}

function mapEmpBody(b) {
  return {
    id: String(b.id || ""),
    name: String(b.name || ""),
    role: b.role ?? "Labourer",
    type: b.type ?? "Full-time",
    rate: b.rate ?? "",
    phone: b.phone ?? "",
    email: b.email ?? "",
    notes: b.notes ?? "",
    availability: b.availability ?? { Mon: true, Tue: true, Wed: true, Thu: true, Fri: true, Sat: false, Sun: false },
    max_hours_per_month: b.max_hours_per_month ?? b.maxHoursPerMonth ?? 160,
    strengths: b.strengths ?? [],
  };
}
