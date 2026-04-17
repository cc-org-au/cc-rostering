"use client";

import { useState, useMemo } from "react";
import {
  HPD, MONTHS, fmt$, fmtH, daysInMo, isWknd, dlabel,
  ProgBar, cardSt, BtnPri, SecTitle, Tag, Alert, Btn,
  selSt,
} from "./shared";

// Import report generators
import { getProjectProfitability, getRevenueByClient, getCostBreakdown, getMonthlyMetrics } from "../../lib/reportFinancial.js";
import { getEmployeeUtilization, getUtilizationBySkill, getBillableVsNonBillable, getUnderutilizedEmployees, getOverallocatedEmployees } from "../../lib/reportUtilization.js";
import { getTeamSize, getHeadcountByRole, getCapacityVsDemand } from "../../lib/reportHeadcount.js";
import { getProjectHealth, getBudgetVsActual, getProjectRanking } from "../../lib/reportProjects.js";
import { getComplianceSummary, getHoursViolations, getSkillMismatches, getAvailabilityViolations } from "../../lib/reportCompliance.js";
import { getResourceGaps, getRevenueProjection, getAttritionRisk } from "../../lib/reportForecasts.js";
import { reportCache, generateCacheKey } from "../../lib/reportCache.js";

// ── Local utils ───────────────────────────────────────────────────────────────

const NOW = new Date();
const YEARS = Array.from({ length: 6 }, (_, i) => NOW.getFullYear() - 1 + i);
const REPORT_TYPES = [
  { id: "financial", label: "Financial", icon: "💰" },
  { id: "utilization", label: "Utilization", icon: "📊" },
  { id: "headcount", label: "Headcount", icon: "👥" },
  { id: "projects", label: "Projects", icon: "🎯" },
  { id: "compliance", label: "Compliance", icon: "✅" },
  { id: "forecasts", label: "Forecasts", icon: "🔮" },
];

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
  const [reportType, setReportType] = useState("financial");
  const [overtimeOpen, setOvertimeOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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
    if (variance < -4) return { color: "var(--danger-text)", fontWeight: 600 };
    if (variance >= -4) return { color: "var(--success-text)", fontWeight: 600 };
    return {};
  }

  // ── Report data loaders ────────────────────────────────────────────────────
  const financialData = useMemo(async () => {
    if (reportType !== "financial") return null;
    const key = generateCacheKey("financial", rYear, rMonth);
    const cached = reportCache.get(key);
    if (cached) return cached;
    
    const prof = await getProjectProfitability(projects, employees, calDays, getA, rYear, rMonth);
    const metrics = await getMonthlyMetrics(projects, employees, calDays, getA, rYear, rMonth);
    reportCache.set(key, { prof, metrics });
    return { prof, metrics };
  }, [reportType, rYear, rMonth, projects, employees, calDays]);

  const utilizationData = useMemo(async () => {
    if (reportType !== "utilization") return null;
    const key = generateCacheKey("utilization", rYear, rMonth);
    const cached = reportCache.get(key);
    if (cached) return cached;

    const empUtil = await getEmployeeUtilization(employees, calDays, getA, rYear, rMonth);
    const billable = await getBillableVsNonBillable(employees, projects, calDays, getA, rYear, rMonth);
    const underutil = await getUnderutilizedEmployees(employees, calDays, getA, rYear, rMonth);
    const overalloc = await getOverallocatedEmployees(employees, calDays, getA, rYear, rMonth);
    reportCache.set(key, { empUtil, billable, underutil, overalloc });
    return { empUtil, billable, underutil, overalloc };
  }, [reportType, rYear, rMonth, projects, employees, calDays]);

  const headcountData = useMemo(async () => {
    if (reportType !== "headcount") return null;
    const key = generateCacheKey("headcount", rYear, rMonth);
    const cached = reportCache.get(key);
    if (cached) return cached;

    const teamSize = await getTeamSize(employees);
    const byRole = await getHeadcountByRole(employees);
    const capVsDemand = await getCapacityVsDemand(employees, projects, calDays, getA, rYear, rMonth);
    reportCache.set(key, { teamSize, byRole, capVsDemand });
    return { teamSize, byRole, capVsDemand };
  }, [reportType, rYear, rMonth, projects, employees, calDays]);

  const projectsData = useMemo(async () => {
    if (reportType !== "projects") return null;
    const key = generateCacheKey("projects", rYear, rMonth);
    const cached = reportCache.get(key);
    if (cached) return cached;

    const health = await getProjectHealth(projects, employees, calDays, getA, rYear, rMonth);
    const budgetVsActual = await getBudgetVsActual(projects, employees, calDays, getA, rYear, rMonth);
    const ranking = await getProjectRanking(projects, employees, calDays, getA, rYear, rMonth);
    reportCache.set(key, { health, budgetVsActual, ranking });
    return { health, budgetVsActual, ranking };
  }, [reportType, rYear, rMonth, projects, employees, calDays]);

  const complianceData = useMemo(async () => {
    if (reportType !== "compliance") return null;
    const key = generateCacheKey("compliance", rYear, rMonth);
    const cached = reportCache.get(key);
    if (cached) return cached;

    const summary = await getComplianceSummary(employees, projects, calDays, getA, rYear, rMonth, []);
    const hoursViolations = await getHoursViolations(employees, calDays, getA, rYear, rMonth);
    const skillMismatches = await getSkillMismatches(employees, projects, calDays, getA, rYear, rMonth);
    const availViolations = await getAvailabilityViolations(employees, calDays, getA, rYear, rMonth);
    reportCache.set(key, { summary, hoursViolations, skillMismatches, availViolations });
    return { summary, hoursViolations, skillMismatches, availViolations };
  }, [reportType, rYear, rMonth, projects, employees, calDays]);

  const forecastsData = useMemo(async () => {
    if (reportType !== "forecasts") return null;
    const key = generateCacheKey("forecasts", rYear, rMonth);
    const cached = reportCache.get(key);
    if (cached) return cached;

    const gaps = await getResourceGaps(projects, employees, rMonth, rYear, 3);
    const revenueForecast = await getRevenueProjection(projects, employees, rMonth, rYear, 3);
    const attritionRisk = await getAttritionRisk(employees, calDays, getA, rYear, rMonth);
    reportCache.set(key, { gaps, revenueForecast, attritionRisk });
    return { gaps, revenueForecast, attritionRisk };
  }, [reportType, rYear, rMonth, projects, employees, calDays]);

  async function handleRefresh() {
    setRefreshing(true);
    const key = generateCacheKey(reportType, rYear, rMonth);
    reportCache.clear(key);
    
    // Regenerate data
    setTimeout(() => {
      setRefreshing(false);
      showToast("Report refreshed!");
    }, 500);
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "system-ui,-apple-system,sans-serif" }}>

      {/* ── Report type selector ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {REPORT_TYPES.map(rt => (
            <button
              key={rt.id}
              onClick={() => setReportType(rt.id)}
              style={{
                padding: "8px 14px",
                background: reportType === rt.id ? "var(--accent)" : "var(--surface-cell)",
                color: reportType === rt.id ? "var(--on-accent)" : "var(--text-secondary)",
                border: reportType === rt.id ? "2px solid var(--accent)" : "1.5px solid var(--border-input)",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {rt.icon} {rt.label}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
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
          <Btn onClick={handleRefresh} style={{ opacity: refreshing ? 0.6 : 1 }}>
            {refreshing ? "⟳ Refreshing..." : "⟳ Refresh"}
          </Btn>
        </div>
      </div>

      {/* ── Financial Report ── */}
      {reportType === "financial" && financialData && (
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
            💰 Financial Report — {MONTHS[rMonth]} {rYear}
          </div>

          {/* KPI cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 24 }}>
            {financialData.metrics && [
              { l: "Total Revenue", v: fmt$(financialData.metrics.total_revenue), s: `${financialData.metrics.projects_active} active projects` },
              { l: "Labour Cost %", v: `${financialData.metrics.labour_cost_pct}%`, s: "of revenue" },
              { l: "Utilisation", v: `${financialData.metrics.utilisation}%`, s: "of capacity" },
              { l: "Active Projects", v: financialData.metrics.projects_active, s: `+${financialData.metrics.projects_completed} completed` },
            ].map(x => (
              <div key={x.l} style={cardSt({ marginBottom: 0 })}>
                <SecTitle>{x.l}</SecTitle>
                <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)" }}>{x.v}</div>
                <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>{x.s}</div>
              </div>
            ))}
          </div>

          {/* Project profitability table */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>Project Profitability</div>
            {financialData.prof && financialData.prof.length > 0 ? (
              <div style={{ overflowX: "auto", borderRadius: 10, border: "1.5px solid var(--border)" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "var(--bg-muted)" }}>
                      {["Project", "Client", "Revenue", "Cost", "Margin", "Margin %"].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap", borderBottom: "1.5px solid var(--border)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {financialData.prof.map(p => (
                      <tr key={p.id} style={{ borderBottom: "1px solid var(--border-soft)" }}>
                        <td style={{ padding: "10px 14px", fontWeight: 500, color: "var(--text-primary)" }}>{p.name}</td>
                        <td style={{ padding: "10px 14px", color: "var(--text-muted)" }}>{p.client || "-"}</td>
                        <td style={{ padding: "10px 14px", color: "var(--success-text)", fontWeight: 500 }}>{fmt$(p.revenue)}</td>
                        <td style={{ padding: "10px 14px", color: "var(--danger-text)" }}>{fmt$(p.actual_cost)}</td>
                        <td style={{ padding: "10px 14px", fontWeight: 500, color: p.margin >= 0 ? "var(--success-text)" : "var(--danger-text)" }}>{fmt$(p.margin)}</td>
                        <td style={{ padding: "10px 14px", fontWeight: 600, color: p.margin_pct >= 30 ? "var(--success-text)" : p.margin_pct >= 15 ? "var(--surface-warn-text)" : "var(--danger-text)" }}>
                          {p.margin_pct}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ fontSize: 13, color: "var(--text-faint)" }}>No project data available.</p>
            )}
          </div>
        </div>
      )}

      {/* ── Utilization Report ── */}
      {reportType === "utilization" && utilizationData && (
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
            📊 Utilization Report — {MONTHS[rMonth]} {rYear}
          </div>

          {/* Billable breakdown */}
          {utilizationData.billable && (
            <div style={cardSt({ marginBottom: 24 })}>
              <SecTitle>Billable vs Non-Billable Hours</SecTitle>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "var(--success-text)" }}>{utilizationData.billable.billable_pct}%</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Billable: {fmtH(utilizationData.billable.billable_hours)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text-faint)" }}>{100 - utilizationData.billable.billable_pct}%</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Non-billable: {fmtH(utilizationData.billable.non_billable_hours)}</div>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <ProgBar pct={utilizationData.billable.billable_pct} color="var(--success-text)" />
              </div>
            </div>
          )}

          {/* Over/underutilized */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginBottom: 24 }}>
            {utilizationData.overalloc && utilizationData.overalloc.length > 0 && (
              <div style={cardSt({ background: "var(--danger-bg)", borderColor: "var(--danger-border)" })}>
                <SecTitle>⚠️ Overallocated Employees</SecTitle>
                {utilizationData.overalloc.map(e => (
                  <div key={e.id} style={{ padding: "8px 0", fontSize: 13, borderBottom: "1px solid var(--danger-border)" }}>
                    <div style={{ fontWeight: 500, color: "var(--danger-text)" }}>{e.name} — {e.utilization_pct}%</div>
                    <div style={{ fontSize: 11, color: "var(--text-faint)" }}>+{fmtH(e.overallocated_hours)} over limit</div>
                  </div>
                ))}
              </div>
            )}

            {utilizationData.underutil && utilizationData.underutil.length > 0 && (
              <div style={cardSt({ background: "var(--info-bg)", borderColor: "var(--info-border)" })}>
                <SecTitle>📈 Underutilized Employees</SecTitle>
                {utilizationData.underutil.slice(0, 5).map(e => (
                  <div key={e.id} style={{ padding: "8px 0", fontSize: 13, borderBottom: "1px solid var(--info-border)" }}>
                    <div style={{ fontWeight: 500, color: "var(--info-text-strong)" }}>{e.name} — {e.utilization_pct}%</div>
                    <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{fmtH(e.available_capacity)} available</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Employee util table */}
          {utilizationData.empUtil && utilizationData.empUtil.length > 0 && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>Employee Utilization</div>
              <div style={{ overflowX: "auto", borderRadius: 10, border: "1.5px solid var(--border)" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "var(--bg-muted)" }}>
                      {["Name", "Role", "Assigned", "Available", "Utilization", "Status"].map(h => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1.5px solid var(--border)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {utilizationData.empUtil.map(e => (
                      <tr key={e.id} style={{ borderBottom: "1px solid var(--border-soft)" }}>
                        <td style={{ padding: "10px 12px", fontWeight: 500, color: "var(--text-primary)" }}>{e.name}</td>
                        <td style={{ padding: "10px 12px", color: "var(--text-muted)", fontSize: 11 }}>{e.role}</td>
                        <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>{fmtH(e.assigned_hours)}</td>
                        <td style={{ padding: "10px 12px", color: "var(--text-faint)" }}>{fmtH(e.available_hours)}</td>
                        <td style={{ padding: "10px 12px", fontWeight: 600, color: e.utilization_pct >= 100 ? "var(--danger-text)" : e.utilization_pct >= 80 ? "var(--surface-warn-text)" : "var(--success-text)" }}>
                          {e.utilization_pct}%
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 500, background: e.status === "overallocated" ? "var(--danger-bg)" : e.status === "healthy" ? "var(--str-active-bg)" : "var(--info-bg)", color: e.status === "overallocated" ? "var(--danger-text)" : e.status === "healthy" ? "var(--success-text)" : "var(--info-text-strong)" }}>
                            {e.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Headcount Report ── */}
      {reportType === "headcount" && headcountData && (
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
            👥 Headcount Report — {MONTHS[rMonth]} {rYear}
          </div>

          {headcountData.teamSize && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 24 }}>
              {[
                { l: "Total Staff", v: headcountData.teamSize.total, s: "team members" },
                { l: "Full-time", v: headcountData.teamSize['Full-time'] || 0, s: "permanent staff" },
                { l: "Part-time", v: headcountData.teamSize['Part-time'] || 0, s: "flexible staff" },
                { l: "Casual", v: headcountData.teamSize['Casual'] || 0, s: "on-demand" },
              ].map(x => (
                <div key={x.l} style={cardSt({ marginBottom: 0 })}>
                  <SecTitle>{x.l}</SecTitle>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)" }}>{x.v}</div>
                  <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>{x.s}</div>
                </div>
              ))}
            </div>
          )}

          {headcountData.capVsDemand && (
            <div style={cardSt({ marginBottom: 24 })}>
              <SecTitle>Capacity vs Demand</SecTitle>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Available Capacity</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>{fmtH(headcountData.capVsDemand.total_capacity)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Currently Assigned</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "var(--accent)" }}>{fmtH(headcountData.capVsDemand.current_assigned)}</div>
                </div>
              </div>
              <div style={{ fontSize: 13, color: headcountData.capVsDemand.gap > 0 ? "var(--success-text)" : "var(--danger-text)", fontWeight: 500, marginBottom: 8 }}>
                {headcountData.capVsDemand.gap > 0 ? "✓ " : "✕ "}{fmtH(Math.abs(headcountData.capVsDemand.gap))} {headcountData.capVsDemand.gap > 0 ? "available" : "gap"}
              </div>
              <ProgBar pct={headcountData.capVsDemand.current_assigned > 0 ? (headcountData.capVsDemand.current_assigned / headcountData.capVsDemand.total_capacity) * 100 : 0} />
            </div>
          )}

          {headcountData.byRole && headcountData.byRole.length > 0 && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>Headcount by Role</div>
              <div style={{ overflowX: "auto", borderRadius: 10, border: "1.5px solid var(--border)" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "var(--bg-muted)" }}>
                      {["Role", "Count", "Avg Rate", "Total Capacity"].map(h => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1.5px solid var(--border)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {headcountData.byRole.map(r => (
                      <tr key={r.role} style={{ borderBottom: "1px solid var(--border-soft)" }}>
                        <td style={{ padding: "10px 12px", fontWeight: 500, color: "var(--text-primary)" }}>{r.role}</td>
                        <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>{r.count}</td>
                        <td style={{ padding: "10px 12px", color: "var(--text-muted)" }}>${r.avg_rate}/hr</td>
                        <td style={{ padding: "10px 12px", color: "var(--accent)", fontWeight: 500 }}>{fmtH(r.total_capacity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Projects Report ── */}
      {reportType === "projects" && projectsData && (
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
            🎯 Project Status Report — {MONTHS[rMonth]} {rYear}
          </div>

          {projectsData.health && projectsData.health.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12, marginBottom: 24 }}>
              {projectsData.health.filter(p => p.status !== "completed").map(p => {
                const statusColor = p.status === "on-track" ? "var(--success-text)" : p.status === "finishing" ? "var(--surface-warn-text)" : "var(--danger-text)";
                const statusBg = p.status === "on-track" ? "var(--success-bg)" : p.status === "finishing" ? "var(--surface-warn)" : "var(--danger-bg)";
                return (
                  <div key={p.id} style={cardSt({ background: statusBg, borderLeft: `4px solid ${statusColor}` })}>
                    <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>{p.name}</div>
                    {p.client && <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>Client: {p.client}</div>}
                    <div style={{ fontSize: 13, color: statusColor, fontWeight: 500, marginBottom: 8, textTransform: "capitalize" }}>
                      ● {p.status.replace(/-/g, " ")}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
                      Budget spent: {p.pct_budget_spent}%
                    </div>
                    <ProgBar pct={p.pct_budget_spent} />
                    {p.days_remaining > 0 && <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6 }}>
                      {p.days_remaining} days remaining
                    </div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Compliance Report ── */}
      {reportType === "compliance" && complianceData && (
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
            ✅ Compliance Report — {MONTHS[rMonth]} {rYear}
          </div>

          {complianceData.summary && (
            <div style={cardSt({ marginBottom: 24, background: complianceData.summary.risk_level === "critical" ? "var(--danger-bg)" : complianceData.summary.risk_level === "high" ? "var(--surface-warn)" : "var(--success-bg)", borderColor: complianceData.summary.risk_level === "critical" ? "var(--danger-border)" : complianceData.summary.risk_level === "high" ? "var(--surface-warn-border)" : "var(--success-border)" })}>
              <SecTitle>Risk Level: <span style={{ textTransform: "uppercase", color: complianceData.summary.risk_level === "critical" ? "var(--danger-text)" : complianceData.summary.risk_level === "high" ? "var(--surface-warn-text)" : "var(--success-text)" }}>{complianceData.summary.risk_level}</span></SecTitle>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)" }}>{complianceData.summary.total_violations}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Total violations</div>
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "var(--danger-text)" }}>{complianceData.summary.critical_issues}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Critical issues</div>
                </div>
              </div>
            </div>
          )}

          {complianceData.hoursViolations && complianceData.hoursViolations.length > 0 && (
            <div style={cardSt({ background: "var(--danger-bg)", borderColor: "var(--danger-border)", marginBottom: 16 })}>
              <SecTitle>⚠️ Hours Violations ({complianceData.hoursViolations.length})</SecTitle>
              {complianceData.hoursViolations.map(v => (
                <div key={v.id} style={{ padding: "8px 0", fontSize: 12, borderBottom: "1px solid var(--danger-border)" }}>
                  <div style={{ fontWeight: 500, color: "var(--danger-text)" }}>{v.name} — {v.hours_worked}h / {v.max_hours}h</div>
                  <div style={{ fontSize: 11, color: "var(--text-faint)" }}>+{v.violation_hours}h over ({v.violation_pct}%) • Severity: {v.severity}</div>
                </div>
              ))}
            </div>
          )}

          {complianceData.skillMismatches && complianceData.skillMismatches.length > 0 && (
            <div style={cardSt({ background: "var(--surface-warn)", borderColor: "var(--surface-warn-border)", marginBottom: 16 })}>
              <SecTitle>🔧 Skill Mismatches ({complianceData.skillMismatches.length})</SecTitle>
              {complianceData.skillMismatches.slice(0, 5).map((m, i) => (
                <div key={i} style={{ padding: "8px 0", fontSize: 12, borderBottom: "1px solid var(--surface-warn-border)" }}>
                  <div style={{ fontWeight: 500, color: "var(--surface-warn-text)" }}>{m.employee} → {m.project}</div>
                  <div style={{ fontSize: 11, color: "var(--text-faint)" }}>Missing: {m.missing_skills.join(", ")} ({m.coverage_pct}% coverage)</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Forecasts Report ── */}
      {reportType === "forecasts" && forecastsData && (
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
            🔮 Forecasts Report — {MONTHS[rMonth]} {rYear}
          </div>

          {forecastsData.gaps && forecastsData.gaps.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>Resource Gaps (3 months)</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                {forecastsData.gaps.map(g => (
                  <div key={`${g.year}-${g.month}`} style={cardSt({ background: g.risk_level === "critical" ? "var(--danger-bg)" : g.risk_level === "high" ? "var(--surface-warn)" : "var(--bg-muted)" })}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
                      {MONTHS[g.month]} {g.year}
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: g.gap_pct > 0 ? "var(--danger-text)" : "var(--success-text)", marginBottom: 4 }}>
                      {g.gap_pct}% gap
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
                      {fmtH(g.gap_hours)} hours needed
                    </div>
                    <div style={{ display: "inline-block", padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 500, background: g.risk_level === "critical" ? "var(--danger-border)" : g.risk_level === "high" ? "var(--surface-warn-border)" : "var(--success-border)", color: g.risk_level === "critical" ? "var(--danger-text)" : g.risk_level === "high" ? "var(--surface-warn-text)" : "var(--success-text)" }}>
                      Risk: {g.risk_level}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {forecastsData.attritionRisk && forecastsData.attritionRisk.length > 0 && (
            <div style={cardSt()}>
              <SecTitle>📉 Attrition Risk (Top Concerns)</SecTitle>
              {forecastsData.attritionRisk.filter(a => a.risk_level !== "low").slice(0, 5).map(a => (
                <div key={a.id} style={{ padding: "10px 0", fontSize: 12, borderBottom: "1px solid var(--border)" }}>
                  <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    Risk score: {a.risk_score} ({a.risk_level}) • {a.risk_factors.join(", ")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}


      {/* ── Original Payroll Summary (kept for backward compatibility) ── */}
      {reportType === "financial" && (
        <>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginTop: 32, marginBottom: 16 }}>
            📋 Classic Payroll Summary
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
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)" }}>{fmtH(totalRosteredH)}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                {Math.round(totalRosteredH / HPD)} days this month
              </div>
            </div>

            {/* Actual hours worked */}
            <div style={cardSt({ marginBottom: 0 })}>
              <SecTitle>Actual hours worked</SecTitle>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)" }}>{fmtH(totalActualH)}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                approved + submitted timesheets
              </div>
            </div>

            {/* Variance */}
            <div style={cardSt({ marginBottom: 0, background: totalVariance < 0 ? "var(--danger-bg)" : totalVariance > 0 ? "var(--success-bg)" : "var(--bg-card)", borderColor: totalVariance < 0 ? "var(--danger-border)" : totalVariance > 0 ? "var(--success-border)" : "var(--border)" })}>
              <SecTitle>Variance</SecTitle>
              <div style={{
                fontSize: 28,
                fontWeight: 700,
                color: totalVariance < 0 ? "var(--danger-text)" : totalVariance > 0 ? "var(--success-text)" : "var(--text-primary)",
              }}>
                {totalVariance >= 0 ? "+" : ""}{fmtH(totalVariance)}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>actual vs rostered</div>
            </div>

            {/* Utilisation */}
            <div style={cardSt({ marginBottom: 0 })}>
              <SecTitle>Utilisation</SecTitle>
              <div style={{ fontSize: 28, fontWeight: 700, color: utilisation >= 100 ? "var(--danger-text)" : utilisation >= 80 ? "var(--surface-warn-text)" : "var(--text-primary)" }}>
                {utilisation}%
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>of total capacity</div>
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
                  <Tag bg="var(--surface-warn)" col="var(--surface-warn-text)">{overtimeAlerts.length} alert{overtimeAlerts.length !== 1 ? "s" : ""}</Tag>
                )}
              </div>
              <span style={{ fontSize: 13, color: "var(--text-muted)", userSelect: "none" }}>
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

          {/* ── Export button ── */}
          <div style={{ marginBottom: 24 }}>
            <BtnPri onClick={handleExportCSV}>📥 Export payroll CSV — {MONTHS[rMonth]} {rYear}</BtnPri>
          </div>

          {/* ── 4. Scheduled vs Actual table ── */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>
              Scheduled vs Actual — {MONTHS[rMonth]} {rYear}
            </div>
            <div style={{ overflowX: "auto", borderRadius: 10, border: "1.5px solid var(--border)" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--bg-muted)" }}>
                    {["Employee", "Rostered Days", "Rostered Hours", "Actual Hours", "Variance", "Utilisation %"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap", borderBottom: "1.5px solid var(--border)" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employees.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: "24px 14px", textAlign: "center", color: "var(--text-faint)", fontSize: 13 }}>
                        No employees to display.
                      </td>
                    </tr>
                  )}
                  {empRows.map(({ emp, rosteredDays, rosteredH, actualH, variance, util }) => (
                    <tr key={emp.id} style={{ borderBottom: "1px solid var(--border-soft)" }}>
                      <td style={{ padding: "10px 14px", fontWeight: 500, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                        <div>{emp.name}</div>
                        <div style={{ fontSize: 11, color: "var(--text-faint)", fontWeight: 400 }}>{emp.role}</div>
                      </td>
                      <td style={{ padding: "10px 14px", color: "var(--text-secondary)" }}>{rosteredDays}d</td>
                      <td style={{ padding: "10px 14px", color: "var(--text-secondary)" }}>{fmtH(rosteredH)}</td>
                      <td style={{ padding: "10px 14px", color: "var(--text-secondary)" }}>{fmtH(actualH)}</td>
                      <td style={{ padding: "10px 14px", ...varianceCellStyle(variance) }}>
                        {variance >= 0 ? "+" : ""}{fmtH(variance)}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ color: util >= 100 ? "var(--danger-text)" : util >= 80 ? "var(--surface-warn-text)" : "var(--text-secondary)", fontWeight: 500 }}>{util}%</span>
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
                    <tr style={{ background: "var(--bg-muted)", borderTop: "1.5px solid var(--border)" }}>
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: "var(--text-primary)" }}>Totals</td>
                      <td style={{ padding: "10px 14px", fontWeight: 600, color: "var(--text-primary)" }}>{totals.rosteredDays}d</td>
                      <td style={{ padding: "10px 14px", fontWeight: 600, color: "var(--text-primary)" }}>{fmtH(totals.rosteredH)}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 600, color: "var(--text-primary)" }}>{fmtH(totals.actualH)}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 600, ...varianceCellStyle(totals.variance) }}>
                        {totals.variance >= 0 ? "+" : ""}{fmtH(totals.variance)}
                      </td>
                      <td style={{ padding: "10px 14px", fontWeight: 600, color: totalUtil >= 100 ? "var(--danger-text)" : totalUtil >= 80 ? "var(--surface-warn-text)" : "var(--text-secondary)" }}>
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
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>
              Project financial summary — {MONTHS[rMonth]} {rYear}
            </div>
            {projects.length === 0 && (
              <div style={{ padding: "32px 24px", border: "2px dashed var(--border)", borderRadius: 12, textAlign: "center", color: "var(--text-faint)", fontSize: 13 }}>
                No projects to display.
              </div>
            )}
            {projFinancials.map(({ p, manH, labourCost, revenue, margin, budget, allocH, pct }) => (
              <div key={p.id} style={cardSt({ borderLeft: `4px solid ${p.color}` })}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                  <div>
                    <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{p.name}</span>
                    {p.client && <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>{p.client}</span>}
                  </div>
                  <Tag
                    bg={pct >= 100 ? "var(--danger-bg)" : pct >= 80 ? "var(--surface-warn)" : "var(--str-active-bg)"}
                    col={pct >= 100 ? "var(--danger-text)" : pct >= 80 ? "var(--surface-warn-text)" : "var(--success-text)"}
                  >
                    {pct}% of target
                  </Tag>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 12 }}>
                  <div style={{ background: "var(--bg-muted)", borderRadius: 8, padding: "10px 12px", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>Rostered man-hours</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>{fmtH(manH)}</div>
                    <div style={{ fontSize: 11, color: "var(--text-faint)" }}>of {fmtH(allocH)} target</div>
                  </div>

                  {labourCost > 0 && (
                    <div style={{ background: "var(--bg-muted)", borderRadius: 8, padding: "10px 12px", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>Labour cost</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>{fmt$(labourCost)}</div>
                      {budget && <div style={{ fontSize: 11, color: labourCost > budget ? "var(--danger-text)" : "var(--text-faint)" }}>budget: {fmt$(budget)}</div>}
                    </div>
                  )}

                  {revenue !== null && (
                    <div style={{ background: "var(--success-bg)", borderRadius: 8, padding: "10px 12px", border: "1px solid var(--success-border)" }}>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>Revenue</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>{fmt$(revenue)}</div>
                      <div style={{ fontSize: 11, color: "var(--text-faint)" }}>@ ${p.chargeOutRate}/hr</div>
                    </div>
                  )}

                  {margin !== null && (
                    <div style={{ background: margin >= 0 ? "var(--success-bg)" : "var(--danger-bg)", borderRadius: 8, padding: "10px 12px", border: `1px solid ${margin >= 0 ? "var(--success-border)" : "var(--danger-border)"}` }}>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>Margin</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: margin >= 0 ? "var(--success-text)" : "var(--danger-text)" }}>{fmt$(margin)}</div>
                      {revenue && revenue > 0 && (
                        <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                          {Math.round((margin / revenue) * 100)}% of revenue
                        </div>
                      )}
                    </div>
                  )}

                  {budget && !labourCost && (
                    <div style={{ background: "var(--bg-muted)", borderRadius: 8, padding: "10px 12px", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>Monthly budget slice</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>{fmt$(budget)}</div>
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)", marginBottom: 3 }}>
                  <span>Roster progress</span>
                  <span style={{ fontWeight: 500 }}>{pct}%</span>
                </div>
                <ProgBar pct={pct} color={p.color} />

                {budget && labourCost > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)", marginBottom: 3 }}>
                      <span>Budget consumed</span>
                      <span style={{ fontWeight: 500, color: labourCost > budget ? "var(--danger-text)" : "var(--text-secondary)" }}>
                        {fmt$(labourCost)} / {fmt$(budget)}
                      </span>
                    </div>
                    <ProgBar pct={Math.round((labourCost / budget) * 100)} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

    </div>
  );
}
