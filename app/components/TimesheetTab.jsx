"use client";

import { useState, useMemo } from "react";
import {
  MONTHS, HPD,
  cardSt, inpSt, selSt,
  StatusBadge, BtnPri, Btn, Empty, SecTitle, Avatar, Tag,
} from "./shared";

const YEARS = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 1 + i);

function MonthSel({ val, set }) {
  return (
    <select value={val} onChange={e => set(+e.target.value)} style={selSt({ width: "auto" })}>
      {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
    </select>
  );
}

function YearSel({ val, set }) {
  return (
    <select value={val} onChange={e => set(+e.target.value)} style={selSt({ width: "auto" })}>
      {YEARS.map(y => <option key={y}>{y}</option>)}
    </select>
  );
}

function pad2(n) { return String(n).padStart(2, "0"); }
function isoDate(y, m, d) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }

function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const STATUS_ORDER = ["draft", "submitted", "approved"];

export default function TimesheetTab({
  projects,
  employees,
  rYear,
  rMonth,
  setRMo,
  setRYear,
  showToast,
  calDays,
  getA,
  timesheets,
  setTimesheets,
  supabase,
}) {
  const [filterEmp, setFilterEmp] = useState("all");

  // Index existing timesheets by "employee_id|date" for O(1) lookup
  const tsIndex = useMemo(() => {
    const idx = {};
    (timesheets || []).forEach(ts => {
      idx[`${ts.employee_id}|${ts.date}`] = ts;
    });
    return idx;
  }, [timesheets]);

  // Build the merged grid: one entry per (employee, rostered day)
  // Local edits live in this state; keyed by "employee_id|date"
  const [localEdits, setLocalEdits] = useState({});

  function getEntry(empId, day) {
    const date = isoDate(rYear, rMonth, day);
    const key = `${empId}|${date}`;
    if (localEdits[key]) return localEdits[key];
    if (tsIndex[key]) {
      const ts = tsIndex[key];
      return { id: ts.id, employee_id: empId, date, project_id: ts.project_id, hours_worked: ts.hours_worked ?? HPD, status: ts.status ?? "draft", notes: ts.notes ?? "" };
    }
    // Pre-populate from roster
    const projectId = getA(rYear, rMonth, day, empId);
    return { id: crypto.randomUUID(), employee_id: empId, date, project_id: projectId, hours_worked: HPD, status: "draft", notes: "" };
  }

  function setEntry(empId, day, patch) {
    const date = isoDate(rYear, rMonth, day);
    const key = `${empId}|${date}`;
    const current = getEntry(empId, day);
    const updated = { ...current, ...patch };
    setLocalEdits(prev => ({ ...prev, [key]: updated }));
    return updated;
  }

  async function upsertEntry(entry) {
    const row = {
      id: entry.id,
      employee_id: entry.employee_id,
      date: entry.date,
      project_id: entry.project_id,
      hours_worked: entry.hours_worked,
      status: entry.status,
      notes: entry.notes,
    };
    const { error } = await supabase.from("timesheets").upsert(row);
    if (error) { showToast(error.message); return false; }
    // Sync into parent timesheets array
    setTimesheets(prev => {
      const without = (prev || []).filter(ts => ts.id !== entry.id);
      return [...without, { ...row, clock_in: null, clock_out: null, created_at: new Date().toISOString() }];
    });
    return true;
  }

  async function changeStatus(empId, day, nextStatus) {
    const updated = setEntry(empId, day, { status: nextStatus });
    await upsertEntry(updated);
  }

  async function saveHoursAndNotes(empId, day) {
    const entry = getEntry(empId, day);
    await upsertEntry(entry);
  }

  // Rostered days per employee
  function rosteredDays(empId) {
    return calDays.filter(d => getA(rYear, rMonth, d, empId));
  }

  const filteredEmployees = employees.filter(e => filterEmp === "all" || e.id === filterEmp);
  const employeesWithRoster = filteredEmployees.filter(e => rosteredDays(e.id).length > 0);

  function projById(id) { return projects.find(p => p.id === id); }

  function exportCSV() {
    const header = ["Employee", "Date", "Project", "Hours", "Rate ($/hr)", "Total Cost ($)", "Status"];
    const rows = [header];
    for (const emp of employees) {
      for (const day of rosteredDays(emp.id)) {
        const entry = getEntry(emp.id, day);
        const proj = projById(entry.project_id);
        const rate = parseFloat(emp.rate) || 0;
        const hours = parseFloat(entry.hours_worked) || 0;
        rows.push([
          emp.name,
          entry.date,
          proj?.name ?? "",
          hours,
          rate,
          Math.round(hours * rate * 100) / 100,
          entry.status,
        ]);
      }
    }
    downloadCSV(`timesheet_${rYear}_${pad2(rMonth + 1)}.csv`, rows);
  }

  const hasAnyRoster = employees.some(e => rosteredDays(e.id).length > 0);

  return (
    <div>
      {/* Header controls */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <MonthSel val={rMonth} set={setRMo} />
        <YearSel val={rYear} set={setRYear} />
        <select
          value={filterEmp}
          onChange={e => setFilterEmp(e.target.value)}
          style={selSt({ width: "auto" })}
        >
          <option value="all">All employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <div style={{ marginLeft: "auto" }}>
          <Btn onClick={exportCSV}>Export payroll CSV</Btn>
        </div>
      </div>

      {!hasAnyRoster && (
        <Empty
          icon="📋"
          title="No roster for this month"
          sub="Assign employees to projects in the Roster tab first."
        />
      )}

      {hasAnyRoster && employeesWithRoster.length === 0 && (
        <Empty
          icon="🔍"
          title="No timesheet entries"
          sub="This employee has no rostered days this month."
        />
      )}

      {employeesWithRoster.map(emp => {
        const days = rosteredDays(emp.id);
        const rate = parseFloat(emp.rate) || 0;
        const totalRostered = days.length * HPD;
        const totalActual = days.reduce((sum, d) => sum + (parseFloat(getEntry(emp.id, d).hours_worked) || 0), 0);

        return (
          <div key={emp.id} style={cardSt({ marginBottom: 18, padding: 0, overflow: "hidden" })}>
            {/* Employee header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 12, padding: "14px 18px",
              background: "var(--bg-muted)", borderBottom: "1.5px solid #e5e7eb",
            }}>
              <Avatar name={emp.name} color="var(--accent)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{emp.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{emp.role}{rate > 0 ? ` · $${rate}/hr` : ""}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                  {totalActual}h actual
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {totalRostered}h rostered
                  {rate > 0 && ` · $${Math.round(totalActual * rate).toLocaleString()} cost`}
                </div>
              </div>
            </div>

            {/* Day rows */}
            <div style={{ padding: "4px 0" }}>
              {days.map(day => {
                const entry = getEntry(emp.id, day);
                const proj = projById(entry.project_id);
                const isApproved = entry.status === "approved";
                const isSubmitted = entry.status === "submitted";
                const isDraft = entry.status === "draft";

                return (
                  <div key={day} style={{
                    display: "grid",
                    gridTemplateColumns: "90px 1fr 90px 80px 160px 120px",
                    gap: 8,
                    alignItems: "center",
                    padding: "10px 18px",
                    borderBottom: "1px solid #f3f4f6",
                    background: isApproved ? "#f0fdf4" : "#fff",
                  }}>
                    {/* Date */}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>
                        {entry.date.slice(8)}{" "}
                        <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>
                          {MONTHS[rMonth].slice(0, 3)}
                        </span>
                      </div>
                    </div>

                    {/* Project */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      {proj && (
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: proj.color, flexShrink: 0 }} />
                      )}
                      <span style={{ fontSize: 13, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {proj?.name ?? "—"}
                      </span>
                    </div>

                    {/* Hours input */}
                    <input
                      type="number"
                      min={0}
                      max={24}
                      step={0.5}
                      disabled={isApproved}
                      value={entry.hours_worked}
                      onChange={e => setEntry(emp.id, day, { hours_worked: parseFloat(e.target.value) || 0 })}
                      onBlur={() => saveHoursAndNotes(emp.id, day)}
                      style={inpSt({
                        width: 80, textAlign: "center", padding: "7px 8px",
                        ...(isApproved ? { background: "var(--bg-muted)", color: "var(--text-faint)" } : {}),
                      })}
                    />

                    {/* Status badge */}
                    <div><StatusBadge status={entry.status} /></div>

                    {/* Notes */}
                    <input
                      type="text"
                      placeholder="Notes…"
                      disabled={isApproved}
                      value={entry.notes}
                      onChange={e => setEntry(emp.id, day, { notes: e.target.value })}
                      onBlur={() => saveHoursAndNotes(emp.id, day)}
                      style={inpSt({
                        fontSize: 12, padding: "7px 10px",
                        ...(isApproved ? { background: "var(--bg-muted)", color: "var(--text-faint)" } : {}),
                      })}
                    />

                    {/* Action buttons */}
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      {isDraft && (
                        <button
                          onClick={() => changeStatus(emp.id, day, "submitted")}
                          style={{
                            padding: "5px 10px", borderRadius: 6, border: "1.5px solid #bfdbfe",
                            background: "#eff6ff", color: "#1d4ed8", fontSize: 12,
                            fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap",
                          }}
                        >
                          Submit
                        </button>
                      )}
                      {isSubmitted && (
                        <>
                          <button
                            onClick={() => changeStatus(emp.id, day, "approved")}
                            style={{
                              padding: "5px 10px", borderRadius: 6, border: "1.5px solid #86efac",
                              background: "#f0fdf4", color: "#166534", fontSize: 12,
                              fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap",
                            }}
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => changeStatus(emp.id, day, "draft")}
                            style={{
                              padding: "5px 10px", borderRadius: 6, border: "1.5px solid #d1d5db",
                              background: "var(--bg-card)", color: "var(--text-secondary)", fontSize: 12,
                              fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap",
                            }}
                          >
                            Edit
                          </button>
                        </>
                      )}
                      {isApproved && (
                        <button
                          onClick={() => changeStatus(emp.id, day, "draft")}
                          style={{
                            padding: "5px 10px", borderRadius: 6, border: "1.5px solid #d1d5db",
                            background: "var(--bg-card)", color: "var(--text-secondary)", fontSize: 12,
                            fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap",
                          }}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary row */}
            <div style={{
              display: "flex", justifyContent: "flex-end", gap: 16, padding: "10px 18px",
              background: "var(--bg-muted)", borderTop: "1.5px solid #e5e7eb", fontSize: 13,
            }}>
              <span style={{ color: "var(--text-muted)" }}>
                Rostered: <strong style={{ color: "var(--text-primary)" }}>{totalRostered}h ({days.length}d)</strong>
              </span>
              <span style={{ color: "var(--text-muted)" }}>
                Actual: <strong style={{ color: totalActual < totalRostered ? "#d97706" : "#059669" }}>
                  {totalActual}h
                </strong>
              </span>
              {rate > 0 && (
                <span style={{ color: "var(--text-muted)" }}>
                  Cost: <strong style={{ color: "var(--text-primary)" }}>${Math.round(totalActual * rate).toLocaleString()}</strong>
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
