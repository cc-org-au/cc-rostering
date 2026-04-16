/** Scopes for API keys — checked on every /api/v1 request */
export const API_SCOPES = [
  { id: "read:projects", label: "Read projects", group: "Projects" },
  { id: "write:projects", label: "Create/update projects", group: "Projects" },
  { id: "read:employees", label: "Read employees", group: "Employees" },
  { id: "write:employees", label: "Create/update employees", group: "Employees" },
  { id: "read:assignments", label: "Read roster assignments", group: "Roster" },
  { id: "write:assignments", label: "Create/update/delete assignments", group: "Roster" },
  { id: "read:settings", label: "Read app settings", group: "Settings" },
  { id: "write:settings", label: "Update app settings", group: "Settings" },
  { id: "read:reports", label: "Read aggregated report data", group: "Reports" },
];

export const ALL_SCOPE_IDS = API_SCOPES.map((s) => s.id);

export function hasScope(scopes, required) {
  if (!Array.isArray(scopes) || !required) return false;
  return scopes.includes(required);
}

export function requireScopes(scopes, needed) {
  const missing = needed.filter((n) => !hasScope(scopes, n));
  return { ok: missing.length === 0, missing };
}
