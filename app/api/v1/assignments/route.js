import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/server/authenticateApiKey";
import { requireScopes } from "@/lib/apiScopes";

export async function GET(request) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { missing } = requireScopes(auth.scopes, ["read:assignments"]);
  if (missing?.length)
    return NextResponse.json({ error: "Insufficient scope", required: "read:assignments" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year");
  const month = searchParams.get("month");

  let q = auth.svc.from("assignments").select("*");
  if (year !== null && year !== "") q = q.eq("year", parseInt(year, 10));
  if (month !== null && month !== "") q = q.eq("month", parseInt(month, 10));

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assignments: data || [] });
}

export async function POST(request) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { missing } = requireScopes(auth.scopes, ["write:assignments"]);
  if (missing?.length)
    return NextResponse.json({ error: "Insufficient scope", required: "write:assignments" }, { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const year = +body.year;
  const month = +body.month;
  const day = +body.day;
  const employee_id = body.employee_id;
  const project_id = body.project_id;
  if ([year, month, day].some((n) => Number.isNaN(n)) || !employee_id || !project_id) {
    return NextResponse.json({ error: "year, month, day, employee_id, project_id required" }, { status: 400 });
  }

  const { data, error } = await auth.svc
    .from("assignments")
    .upsert({ year, month, day, employee_id, project_id })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assignment: data });
}

export async function DELETE(request) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { missing } = requireScopes(auth.scopes, ["write:assignments"]);
  if (missing?.length)
    return NextResponse.json({ error: "Insufficient scope", required: "write:assignments" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const year = +searchParams.get("year");
  const month = +searchParams.get("month");
  const day = +searchParams.get("day");
  const employee_id = searchParams.get("employee_id");
  if ([year, month, day].some((n) => Number.isNaN(n)) || !employee_id) {
    return NextResponse.json({ error: "Query year, month, day, employee_id required" }, { status: 400 });
  }

  const { error } = await auth.svc
    .from("assignments")
    .delete()
    .match({ year, month, day, employee_id });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
