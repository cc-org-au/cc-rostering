"use client";

/**
 * Month-at-a-glance view of assignments (same data as Roster).
 * Replaces the legacy shift-board tab that relied on empty `shifts` tables.
 */
export default function AssignmentScheduleOverview({
  projects,
  employees,
  rYear,
  rMonth,
  calDays,
  getA,
  dlabel,
  isWknd,
  projNameOf,
  projColor,
  MONTHS,
  onGoToRoster,
}) {
  const byDay = calDays.map((d) => {
    const dl = dlabel(rYear, rMonth, d);
    const wknd = isWknd(rYear, rMonth, d);
    const rows = employees
      .map((e) => {
        const pid = getA(rYear, rMonth, d, e.id);
        if (!pid) return null;
        return { e, pid };
      })
      .filter(Boolean);
    return { d, dl, wknd, rows };
  });

  return (
    <div>
      <div
        style={{
          padding: "14px 16px",
          marginBottom: 16,
          borderRadius: 12,
          border: "1.5px solid var(--border)",
          background: "var(--bg-muted)",
          fontSize: 13,
          color: "var(--text-secondary)",
          lineHeight: 1.5,
        }}
      >
        <strong style={{ color: "var(--text-primary)" }}>Schedule overview</strong> — read-only list of who is on which job each
        day this month. To add or change shifts, use the{" "}
        <button
          type="button"
          onClick={onGoToRoster}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "var(--accent)",
            fontWeight: 600,
            cursor: "pointer",
            textDecoration: "underline",
            font: "inherit",
          }}
        >
          Roster
        </button>{" "}
        tab (calendar or by employee). The older drag-and-drop board required separate &quot;shift&quot; records in the database;
        this app&apos;s primary schedule is the roster assignments you see here.
      </div>

      <h3 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 12px", color: "var(--text-primary)" }}>
        {MONTHS[rMonth]} {rYear}
      </h3>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {byDay.map(({ d, dl, wknd, rows }) => (
          <div
            key={d}
            style={{
              border: "1.5px solid var(--border)",
              borderRadius: 10,
              padding: "10px 12px",
              background: wknd ? "var(--bg-muted)" : "var(--bg-card)",
              opacity: wknd ? 0.92 : 1,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>
              {dl} {d} {wknd ? "· weekend" : ""}
            </div>
            {rows.length === 0 ? (
              <span style={{ fontSize: 13, color: "var(--text-faint)" }}>No assignments</span>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {rows.map(({ e, pid }) => (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: projColor(pid),
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{e.name}</span>
                    <span style={{ color: "var(--text-muted)" }}>→ {projNameOf(pid)}</span>
                    <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{e.role}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
