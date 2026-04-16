import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/server/authenticateApiKey";
import { requireScopes } from "@/lib/apiScopes";

/** Aggregated counts for integrations (read:reports) */
export async function GET(request) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { missing } = requireScopes(auth.scopes, ["read:reports"]);
  if (missing?.length)
    return NextResponse.json({ error: "Insufficient scope", required: "read:reports" }, { status: 403 });

  const svc = auth.svc;
  const [{ count: projectCount }, { count: employeeCount }] = await Promise.all([
    svc.from("projects").select("*", { count: "exact", head: true }),
    svc.from("employees").select("*", { count: "exact", head: true }),
  ]);

  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year");
  const month = searchParams.get("month");
  let assignmentCount = null;
  if (year !== null && month !== null) {
    const { count } = await svc
      .from("assignments")
      .select("*", { count: "exact", head: true })
      .eq("year", parseInt(year, 10))
      .eq("month", parseInt(month, 10));
    assignmentCount = count;
  }

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    counts: {
      projects: projectCount ?? 0,
      employees: employeeCount ?? 0,
      assignments_in_month:
        year !== null && month !== null ? assignmentCount : undefined,
    },
  });
}
