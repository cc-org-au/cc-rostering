import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/server/authenticateApiKey";
import { requireScopes } from "@/lib/apiScopes";

export async function GET(request) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { missing } = requireScopes(auth.scopes, ["read:projects"]);
  if (missing?.length)
    return NextResponse.json({ error: "Insufficient scope", required: "read:projects" }, { status: 403 });

  const { data, error } = await auth.svc.from("projects").select("*").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ projects: data || [] });
}

export async function POST(request) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { missing } = requireScopes(auth.scopes, ["write:projects"]);
  if (missing?.length)
    return NextResponse.json({ error: "Insufficient scope", required: "write:projects" }, { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const row = mapProjectBody(body);
  if (!row.id || !row.name) return NextResponse.json({ error: "id and name are required" }, { status: 400 });

  const { data, error } = await auth.svc.from("projects").upsert(row).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project: data });
}

function mapProjectBody(b) {
  return {
    id: String(b.id || ""),
    name: String(b.name || ""),
    client: b.client ?? "",
    color: b.color ?? "#4f46e5",
    notes: b.notes ?? "",
    budget: b.budget ?? "",
    charge_out_rate: b.charge_out_rate ?? b.chargeOutRate ?? "",
    total_input: b.total_input ?? b.totalInput ?? "",
    total_unit: b.total_unit ?? b.totalUnit ?? "days",
    staff_mode: b.staff_mode ?? b.staffMode ?? "flexible",
    fixed_staff: b.fixed_staff ?? b.fixedStaff ?? "",
    start_month: b.start_month ?? b.startMonth ?? "",
    start_year: b.start_year ?? b.startYear ?? "",
    end_month: b.end_month ?? b.endMonth ?? "",
    end_year: b.end_year ?? b.endYear ?? "",
    monthly_hours: b.monthly_hours ?? b.monthlyHours ?? {},
    strengths_required: b.strengths_required ?? b.strengthsRequired ?? [],
    is_completed: b.is_completed ?? b.isCompleted ?? false,
    work_days: b.work_days ?? b.workDays ?? undefined,
    overtime_note: b.overtime_note ?? b.overtimeNote ?? "",
  };
}
