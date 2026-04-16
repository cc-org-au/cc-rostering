"use client";

import { useState, useMemo } from "react";
import {
  HPD, MONTHS, fmt$, fmtH, daysInMo, isWknd, dlabel,
  ProgBar, cardSt, BtnPri, SecTitle, Tag, Alert,
  selSt,
} from "./shared";

// ── Local utils ───────────────────────────────────────────────────────────────

const NOW = new Date();
const YEARS = Array.from({ length: 6 }, (_, i) => NOW.getFullYear() - 1 + i);

function wdInMonth(y, m) {
  let c = 0;
  for (let d = 1; d <= daysInMo(y, m); d++) if (!isWknd(y, m, d)) c++;
  return c;
}

function monthAllocH(p, y, m) {
  const key = `${y}-${m}`;
  const v = p.monthlyHours && p.monthlyHours[key];
  return v !== undefined ? v : wdInMonth(y, m) * HPD;
}

// Budget slice for this month: budget * (workdays_this_month / total_workdays_over_project)
function monthBudgetSlice(p, y, m) {
  if (!p.budget || p.startMonth === undefined || p.startMonth === "" || !p.startYear) return null;
  const sm = +p.startMonth, sy = +p.startYear;
  const em = +p.endMonth,   ey = +p.endYear;
  let totalWd = 0;
  let cy = sy, cm = sm;
  while (cy < ey || (cy === ey && cm <= em)) {
    totalWd += wdInMonth(cy, cm);
    if (++cm > 11) { cm = 0; cy++; }
  }
  if (totalWd === 0) return null;
  return Math.round(parseFloat(p.budget) * wdInMonth(y, m) / totalWd);
}

// Group an array of day-numbers into Mon-Sun ISO weeks present in the month
// Returns [{weekLabel: string (date of Monday), days: [d, ...]}, ...]
function groupIntoWeeks(y, m, calDays) {
  const weeks = [];
  let currentWeek = null;
  for (const d of calDays) {
    const label = dlabel(y, m, d); // Mon-Sun label
    if (label === "Mon" || currentWeek === null) {
      currentWeek = { weekLabel: `${String(d).padStart(2, "0")} ${MONTHS[m].slice(0, 3)} ${y}`, days: [] };
      weeks.push(currentWeek);
    }
    currentWeek.days.push(d);
  }
  return weeks;
}

function downloadCSV(filename, rows) {
  const csv = rows
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = filename;
  a.click();
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReportsTab({
  projects,
  employees,
  assigns,
  timesheets = [],
  rYear,
  rMonth,
  setRMo,
  setRYear,
  showToast,
  calDays,
  getA,
}) {
  const [overtimeOpen, setOvertimeOpen] = useState(false);

  // ── Derived: timesheet lookups ─────────────────────────────────────────────
  // Filter timesheets to this month/year
  const monthTimesheets = useMemo(() => {
    return timesheets.filter(ts => {
      if (!ts.date) return false;
      const d = new Date(ts.date);
      return d.getFullYear() === rYear && d.getMonth() === rMonth;
    });
  }, [timesheets, rYear, rMonth]);

  // Map: employee_id -> total approved/submitted hours this month
  const actualHoursByEmp = useMemo(() => {
    const map = {};
    for (const ts of monthTimesheets) {
      if (ts.status === "approved" || ts.status === "submitted") {
        map[ts.employee_id] = (map[ts.employee_id] || 0) + (ts.hours_worked || 0);
      }
    }
    return map;
  }, [monthTimesheets]);

  // ── KPI summary ────────────────────────────────────────────────────────────
  const totalRosteredH = useMemo(() =>
    employees.reduce((sum, e) =>
      sum + calDays.filter(d => getA(rYear, rMonth, d, e.id)).length * HPD
    , 0)
  , [employees, calDays, getA, rYear, rMonth]);

  const totalActualH = useMemo(() =>
    employees.reduce((sum, e) => sum + (actualHoursByEmp[e.id] || 0), 0)
  , [employees, actualHoursByEmp]);

  const totalVariance = totalActualH - totalRosteredH;

  const totalCapacity = useMemo(() =>
    employees.reduce((sum, e) => sum + (e.maxHoursPerMonth || 0), 0)
  , [employees]);

  const utilisation = totalCapacity > 0
    ? Math.round((totalActualH / totalCapacity) * 100)
    : 0;

  // ── Overtime alerts ────────────────────────────────────────────────────────
  const overtimeAlerts = useMemo(() => {
    const weeks = groupIntoWeeks(rYear, rMonth, calDays);
    const alerts = [];
    for (const e of employees) {
      for (const { weekLabel, days } of weeks) {
        const weekH = days.filter(d => getA(rYear, rMonth, d, e.id)).length * HPD;
        if (weekH > 38) {
          alerts.push({ name: e.name, hours: weekH, weekLabel });
        }
      }
    }
    return alerts;
  }, [employees, calDays, getA, rYear, rMonth]);

  // ── Per-employee table rows ────────────────────────────────────────────────
  const empRows = useMemo(() =>
    employees.map(e => {
      const rosteredDays = calDays.filter(d => getA(rYear, rMonth, d, e.id)).length;
      const rosteredH    = rosteredDays * HPD;
      const actualH      = actualHoursByEmp[e.id] || 0;
      const variance     = actualH - rosteredH;
      const cap          = e.maxHoursPerMonth || 0;
      const util         = cap > 0 ? Math.round((actualH / cap) * 100) : 0;
      return { emp: e, rosteredDays, rosteredH, actualH, variance, util };
    })
  , [employees, calDays, getA, rYear, rMonth, actualHoursByEmp]);

  const totals = useMemo(() => ({
    rosteredDays: empRows.reduce((s, r) => s + r.rosteredDays, 0),
    rosteredH:    empRows.reduce((s, r) => s + r.rosteredH,    0),
    actualH:      empRows.reduce((s, r) => s + r.actualH,      0),
    variance:     empRows.reduce((s, r) => s + r.variance,     0),
  }), [empRows]);

  const totalUtil = totalCapacity > 0
    ? Math.round((totals.actualH / totalCapacity) * 100)
    : 0;

  // ── Project financial summary ──────────────────────────────────────────────
  const projFinancials = useMemo(() =>
    projects.map(p => {
      // Rostered man-hours
      const manH = employees.reduce((sum, e) => {
        const days = calDays.filter(d => getA(rYear, rMonth, d, e.id) === p.id).length;
        return sum + days * HPD;
      }, 0);
      // Labour cost: each assigned employee's rate × HPD × days
      const labourCost = employees.reduce((sum, e) => {
        const days = calDays.filter(d => getA(rYear, rMonth, d, e.id) === p.id).length;
        return sum + days * HPD * (parseFloat(e.rate) || 0);
      }, 0);
      const cor      = parseFloat(p.chargeOutRate) || 0;
      const revenue  = cor > 0 ? manH * cor : null;
      const margin   = revenue !== null ? revenue - labourCost : null;
      const budget   = monthBudgetSlice(p, rYear, rMonth);
      const allocH   = monthAllocH(p, rYear, rMonth);
      const pct      = allocH > 0 ? Math.round((manH / allocH) * 100) : 0;
      return { p, manH, labourCost, revenue, margin, budget, allocH, pct };
    })
  , [projects, employees, calDays, getA, rYear, rMonth]);

  // ── Payroll CSV export ─────────────────────────────────────────────────────
  function handleExportCSV() {
    const header = [
      "Employee", "Role", "Date", "Project",
      "Rostered Hours", "Actual Hours",
      "Hourly Rate", "Rostered Cost", "Actual Cost", "Status",
    ];
    const dataRows = [];

    for (const e of employees) {
      const empRate = parseFloat(e.rate) || 0;

      // Collect all days where there is an assignment this month
      const assignedDays = calDays
        .map(d => {
          const pid = getA(rYear, rMonth, d, e.id);
          return pid ? { d, pid } : null;
        })
        .filter(Boolean);

      // Collect all timesheet entries for this employee this month
      const empTimesheets = monthTimesheets.filter(
        ts => ts.employee_id === e.id
      );

      // Build a set of keys: "d-pid" from both sources
      const rowKeys = new Map(); // key -> {d, pid, tsEntry|null}

      for (const { d, pid } of assignedDays) {
        const key = `${d}-${pid}`;
        rowKeys.set(key, { d, pid, tsEntry: null });
      }

      for (const ts of empTimesheets) {
        const dateObj = new Date(ts.date);
        const d = dateObj.getDate();
        const pid = ts.project_id;
        const key = `${d}-${pid}`;
        if (!rowKeys.has(key)) {
          rowKeys.set(key, { d, pid, tsEntry: ts });
        } else {
          rowKeys.get(key).tsEntry = ts;
        }
      }

      for (const [, { d, pid, tsEntry }] of [...rowKeys.entries()].sort((a, b) => a[1].d - b[1].d)) {
        const proj = projects.find(pr => pr.id === pid);
        const projName = proj ? proj.name : pid || "";
        const dateStr  = `${rYear}-${String(rMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const hasAssign = Boolean(getA(rYear, rMonth, d, e.id) === pid);
        const rosteredH = hasAssign ? HPD : 0;
        const actualH   = tsEntry ? (tsEntry.hours_worked || 0) : 0;
        const rosteredCost = empRate * rosteredH;
        const actualCost   = empRate * actualH;
        const status = tsEntry ? (tsEntry.status || "") : (hasAssign ? "rostered" : "");

        dataRows.push([
          e.name,
          e.role || "",
          dateStr,
          projName,
          rosteredH,
          actualH,
          empRate,
          Math.round(rosteredCost * 100) / 100,
          Math.round(actualCost * 100) / 100,
          status,
        ]);
      }
    }

    if (dataRows.length === 0) {
      showToast("No data to export for this month.");
      return;
    }

    downloadCSV(
      `payroll_${rYear}_${String(rMonth + 1).padStart(2, "0")}.csv`,
      [header, ...dataRows]
    );
  }

  // ── Helpers for variance cell colour ──────────────────────────────────────
  function varianceCellStyle(variance) {
    if (variance < -4) return { color: "#dc2626", fontWeight: 600 };
    if (variance >= -4) return { color: "#059669", fontWeight: 600 };
    return {};
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "system-ui,-apple-system,sans-serif" }}>

      {/* ── 1. Header controls ── */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <select
          value={rMonth}
          onChange={e => setRMo(+e.target.value)}
          style={selSt({ width: "auto" })}
        >
          {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select
          value={rYear}
          onChange={e => setRYear(+e.target.value)}
          style={selSt({ width: "auto" })}
        >
          {YEARS.map(y => <option key={y}>{y}</option>)}
        </select>
        <div style={{ marginLeft: "auto" }}>
          <BtnPri onClick={handleExportCSV}>Export payroll CSV</BtnPri>
        </div>
      </div>

      {/* ── 2. KPI summary bar ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 10,
          marginBottom: 24,
        }}
      >
        {/* Total rostered hours */}
        <div style={cardSt({ marginBottom: 0 })}>
          <SecTitle>Total rostered</SecTitle>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#111827" }}>{fmtH(totalRosteredH)}</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
            {Math.round(totalRosteredH / HPD)} days this month
          </div>
        </div>

        {/* Actual hours worked */}
        <div style={cardSt({ marginBottom: 0 })}>
          <SecTitle>Actual hours worked</SecTitle>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#111827" }}>{fmtH(totalActualH)}</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
            approved + submitted timesheets
          </div>
        </div>

        {/* Variance */}
        <div style={cardSt({ marginBottom: 0, background: totalVariance < 0 ? "#fef2f2" : totalVariance > 0 ? "#f0fdf4" : "#fff", borderColor: totalVariance < 0 ? "#fecaca" : totalVariance > 0 ? "#bbf7d0" : "#e5e7eb" })}>
          <SecTitle>Variance</SecTitle>
          <div style={{
            fontSize: 28,
            fontWeight: 700,
            color: totalVariance < 0 ? "#dc2626" : totalVariance > 0 ? "#059669" : "#111827",
          }}>
            {totalVariance >= 0 ? "+" : ""}{fmtH(totalVariance)}
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>actual vs rostered</div>
        </div>

        {/* Utilisation */}
        <div style={cardSt({ marginBottom: 0 })}>
          <SecTitle>Utilisation</SecTitle>
          <div style={{ fontSize: 28, fontWeight: 700, color: utilisation >= 100 ? "#dc2626" : utilisation >= 80 ? "#d97706" : "#111827" }}>
            {utilisation}%
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>of total capacity</div>
          <ProgBar pct={utilisation} />
        </div>
      </div>

      {/* ── 3. Overtime alerts ── */}
      <div style={cardSt({ marginBottom: 24 })}>
        <div
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
          onClick={() => setOvertimeOpen(o => !o)}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <SecTitle>Overtime alerts</SecTitle>
            {overtimeAlerts.length > 0 && (
              <Tag bg="#fef3c7" col="#92400e">{overtimeAlerts.length} alert{overtimeAlerts.length !== 1 ? "s" : ""}</Tag>
            )}
          </div>
          <span style={{ fontSize: 13, color: "#6b7280", userSelect: "none" }}>
            {overtimeOpen ? "▲ Hide" : "▼ Show"}
          </span>
        </div>

        {overtimeOpen && (
          <div style={{ marginTop: 12 }}>
            {overtimeAlerts.length === 0 ? (
              <Alert type="ok">No overtime detected — all employees are within the 38h weekly limit.</Alert>
            ) : (
              overtimeAlerts.map((a, i) => (
                <Alert key={i} type="warn">
                  ⚠ <strong>{a.name}</strong> — {fmtH(a.hours)} in week of {a.weekLabel} (limit: 38h)
                </Alert>
              ))
            )}
          </div>
        )}
      </div>

      {/* ── 4. Scheduled vs Actual table ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 10 }}>
          Scheduled vs Actual — {MONTHS[rMonth]} {rYear}
        </div>
        <div style={{ overflowX: "auto", borderRadius: 10, border: "1.5px solid #e5e7eb" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                {["Employee", "Rostered Days", "Rostered Hours", "Actual Hours", "Variance", "Utilisation %"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "#6b7280", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap", borderBottom: "1.5px solid #e5e7eb" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: "24px 14px", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
                    No employees to display.
                  </td>
                </tr>
              )}
              {empRows.map(({ emp, rosteredDays, rosteredH, actualH, variance, util }) => (
                <tr key={emp.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "10px 14px", fontWeight: 500, color: "#111827", whiteSpace: "nowrap" }}>
                    <div>{emp.name}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 400 }}>{emp.role}</div>
                  </td>
                  <td style={{ padding: "10px 14px", color: "#374151" }}>{rosteredDays}d</td>
                  <td style={{ padding: "10px 14px", color: "#374151" }}>{fmtH(rosteredH)}</td>
                  <td style={{ padding: "10px 14px", color: "#374151" }}>{fmtH(actualH)}</td>
                  <td style={{ padding: "10px 14px", ...varianceCellStyle(variance) }}>
                    {variance >= 0 ? "+" : ""}{fmtH(variance)}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: util >= 100 ? "#dc2626" : util >= 80 ? "#d97706" : "#374151", fontWeight: 500 }}>{util}%</span>
                      <div style={{ flex: 1, minWidth: 60 }}>
                        <ProgBar pct={util} />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {employees.length > 0 && (
              <tfoot>
                <tr style={{ background: "#f9fafb", borderTop: "1.5px solid #e5e7eb" }}>
                  <td style={{ padding: "10px 14px", fontWeight: 700, color: "#111827" }}>Totals</td>
                  <td style={{ padding: "10px 14px", fontWeight: 600, color: "#111827" }}>{totals.rosteredDays}d</td>
                  <td style={{ padding: "10px 14px", fontWeight: 600, color: "#111827" }}>{fmtH(totals.rosteredH)}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 600, color: "#111827" }}>{fmtH(totals.actualH)}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 600, ...varianceCellStyle(totals.variance) }}>
                    {totals.variance >= 0 ? "+" : ""}{fmtH(totals.variance)}
                  </td>
                  <td style={{ padding: "10px 14px", fontWeight: 600, color: totalUtil >= 100 ? "#dc2626" : totalUtil >= 80 ? "#d97706" : "#374151" }}>
                    {totalUtil}%
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ── 5. Project financial summary ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 10 }}>
          Project financial summary — {MONTHS[rMonth]} {rYear}
        </div>
        {projects.length === 0 && (
          <div style={{ padding: "32px 24px", border: "2px dashed #e5e7eb", borderRadius: 12, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
            No projects to display.
          </div>
        )}
        {projFinancials.map(({ p, manH, labourCost, revenue, margin, budget, allocH, pct }) => (
          <div key={p.id} style={cardSt({ borderLeft: `4px solid ${p.color}` })}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
              <div>
                <span style={{ fontSize: 15, fontWeight: 600, color: "#111827" }}>{p.name}</span>
                {p.client && <span style={{ fontSize: 12, color: "#6b7280", marginLeft: 8 }}>{p.client}</span>}
              </div>
              <Tag
                bg={pct >= 100 ? "#fee2e2" : pct >= 80 ? "#fef9c3" : "#dcfce7"}
                col={pct >= 100 ? "#dc2626" : pct >= 80 ? "#713f12" : "#166534"}
              >
                {pct}% of target
              </Tag>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 12 }}>
              <div style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 12px", border: "1px solid #e5e7eb" }}>
                <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Rostered man-hours</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>{fmtH(manH)}</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>of {fmtH(allocH)} target</div>
              </div>

              {labourCost > 0 && (
                <div style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 12px", border: "1px solid #e5e7eb" }}>
                  <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Labour cost</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>{fmt$(labourCost)}</div>
                  {budget && <div style={{ fontSize: 11, color: labourCost > budget ? "#dc2626" : "#9ca3af" }}>budget: {fmt$(budget)}</div>}
                </div>
              )}

              {revenue !== null && (
                <div style={{ background: "#f0fdf4", borderRadius: 8, padding: "10px 12px", border: "1px solid #bbf7d0" }}>
                  <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Revenue</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>{fmt$(revenue)}</div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>@ ${p.chargeOutRate}/hr</div>
                </div>
              )}

              {margin !== null && (
                <div style={{ background: margin >= 0 ? "#f0fdf4" : "#fef2f2", borderRadius: 8, padding: "10px 12px", border: `1px solid ${margin >= 0 ? "#bbf7d0" : "#fecaca"}` }}>
                  <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Margin</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: margin >= 0 ? "#059669" : "#dc2626" }}>{fmt$(margin)}</div>
                  {revenue && revenue > 0 && (
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>
                      {Math.round((margin / revenue) * 100)}% of revenue
                    </div>
                  )}
                </div>
              )}

              {budget && !labourCost && (
                <div style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 12px", border: "1px solid #e5e7eb" }}>
                  <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Monthly budget slice</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>{fmt$(budget)}</div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b7280", marginBottom: 3 }}>
              <span>Roster progress</span>
              <span style={{ fontWeight: 500 }}>{pct}%</span>
            </div>
            <ProgBar pct={pct} color={p.color} />

            {budget && labourCost > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b7280", marginBottom: 3 }}>
                  <span>Budget consumed</span>
                  <span style={{ fontWeight: 500, color: labourCost > budget ? "#dc2626" : "#374151" }}>
                    {fmt$(labourCost)} / {fmt$(budget)}
                  </span>
                </div>
                <ProgBar pct={Math.round((labourCost / budget) * 100)} />
              </div>
            )}
          </div>
        ))}
      </div>

    </div>
  );
}
