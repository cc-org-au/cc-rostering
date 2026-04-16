"use client";

import { useState, useMemo } from "react";
import {
  PTO_TYPES,
  StatusBadge, BtnPri, BtnSuccess, BtnDanger, Btn,
  Empty, SecTitle, cardSt, selSt, inpSt, Lbl, Avatar, Tag,
} from "./shared";

function calendarDays(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const s = new Date(startDate);
  const e = new Date(endDate);
  if (isNaN(s) || isNaN(e) || e < s) return 0;
  return Math.round((e - s) / 86400000) + 1;
}

function fmtDateDisplay(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

const STATUSES = ["All", "pending", "approved", "denied"];
const STATUS_LABELS = { All: "All", pending: "Pending", approved: "Approved", denied: "Denied" };

export default function PTOTab({
  employees,
  ptoRequests,
  setPtoRequests,
  showToast,
  supabase,
}) {
  const [filterEmp, setFilterEmp] = useState("all");
  const [filterStatus, setFilterStatus] = useState("All");

  // New request form state
  const [form, setForm] = useState({
    employee_id: "",
    type: PTO_TYPES[0],
    start_date: "",
    end_date: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  function setF(patch) { setForm(prev => ({ ...prev, ...patch })); }

  async function submitRequest() {
    if (!form.employee_id) { showToast("Please select an employee."); return; }
    if (!form.start_date || !form.end_date) { showToast("Please select start and end dates."); return; }
    if (form.end_date < form.start_date) { showToast("End date must be on or after start date."); return; }
    setSubmitting(true);
    const id = crypto.randomUUID();
    const row = {
      id,
      employee_id: form.employee_id,
      type: form.type,
      start_date: form.start_date,
      end_date: form.end_date,
      status: "pending",
      notes: form.notes,
    };
    const { error } = await supabase.from("pto_requests").insert(row);
    setSubmitting(false);
    if (error) { showToast(error.message); return; }
    setPtoRequests(prev => [{ ...row, created_at: new Date().toISOString() }, ...(prev || [])]);
    setForm({ employee_id: "", type: PTO_TYPES[0], start_date: "", end_date: "", notes: "" });
  }

  async function updateStatus(id, status) {
    const { error } = await supabase.from("pto_requests").update({ status }).eq("id", id);
    if (error) { showToast(error.message); return; }
    setPtoRequests(prev => (prev || []).map(r => r.id === id ? { ...r, status } : r));
  }

  async function handleDeny(req) {
    if (!window.confirm(`Deny ${empName(req.employee_id)}'s ${req.type} request (${fmtDateDisplay(req.start_date)} – ${fmtDateDisplay(req.end_date)})?`)) return;
    await updateStatus(req.id, "denied");
  }

  async function handleCancel(req) {
    if (!window.confirm(`Cancel this ${req.type} request?`)) return;
    await updateStatus(req.id, "denied");
  }

  function empName(id) {
    return employees.find(e => e.id === id)?.name ?? "Unknown";
  }
  function empRole(id) {
    return employees.find(e => e.id === id)?.role ?? "";
  }

  const sorted = useMemo(() => {
    return [...(ptoRequests || [])].sort((a, b) => {
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }, [ptoRequests]);

  const filtered = useMemo(() => {
    return sorted.filter(r => {
      if (filterEmp !== "all" && r.employee_id !== filterEmp) return false;
      if (filterStatus !== "All" && r.status !== filterStatus) return false;
      return true;
    });
  }, [sorted, filterEmp, filterStatus]);

  const typeColors = {
    "Annual Leave": { bg: "#eff6ff", col: "#1d4ed8" },
    "Sick Leave": { bg: "#fef9c3", col: "#713f12" },
    "TOIL": { bg: "#ecfdf5", col: "#065f46" },
    "Long Service Leave": { bg: "#f5f3ff", col: "#5b21b6" },
    "Unpaid Leave": { bg: "#f3f4f6", col: "#374151" },
    "Other": { bg: "#fef2f2", col: "#991b1b" },
  };

  return (
    <div>
      {/* New request form */}
      <div style={cardSt({ marginBottom: 20 })}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#111827", marginBottom: 14 }}>New leave request</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <Lbl>Employee</Lbl>
            <select
              value={form.employee_id}
              onChange={e => setF({ employee_id: e.target.value })}
              style={selSt({ width: "100%" })}
            >
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <Lbl>Leave type</Lbl>
            <select
              value={form.type}
              onChange={e => setF({ type: e.target.value })}
              style={selSt({ width: "100%" })}
            >
              {PTO_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <Lbl>Start date</Lbl>
            <input
              type="date"
              value={form.start_date}
              onChange={e => setF({ start_date: e.target.value })}
              style={inpSt()}
              onFocus={e => e.target.style.borderColor = "#4f46e5"}
              onBlur={e => e.target.style.borderColor = "#d1d5db"}
            />
          </div>
          <div>
            <Lbl>End date</Lbl>
            <input
              type="date"
              value={form.end_date}
              min={form.start_date}
              onChange={e => setF({ end_date: e.target.value })}
              style={inpSt()}
              onFocus={e => e.target.style.borderColor = "#4f46e5"}
              onBlur={e => e.target.style.borderColor = "#d1d5db"}
            />
          </div>
        </div>
        {form.start_date && form.end_date && form.end_date >= form.start_date && (
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
            {calendarDays(form.start_date, form.end_date)} calendar day{calendarDays(form.start_date, form.end_date) !== 1 ? "s" : ""}
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <Lbl>Notes</Lbl>
          <textarea
            value={form.notes}
            onChange={e => setF({ notes: e.target.value })}
            placeholder="Optional notes or reason…"
            rows={2}
            style={inpSt({ resize: "vertical" })}
            onFocus={e => e.target.style.borderColor = "#4f46e5"}
            onBlur={e => e.target.style.borderColor = "#d1d5db"}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <BtnPri onClick={submitRequest} style={submitting ? { opacity: 0.6, pointerEvents: "none" } : {}}>
            {submitting ? "Submitting…" : "Submit request"}
          </BtnPri>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <select
          value={filterEmp}
          onChange={e => setFilterEmp(e.target.value)}
          style={selSt({ width: "auto" })}
        >
          <option value="all">All employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <div style={{ display: "flex", border: "1.5px solid #d1d5db", borderRadius: 8, overflow: "hidden" }}>
          {STATUSES.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setFilterStatus(s)}
              style={{
                padding: "8px 14px", border: "none", fontFamily: "inherit",
                fontSize: 13, fontWeight: 500, cursor: "pointer",
                background: filterStatus === s ? "#4f46e5" : "#fff",
                color: filterStatus === s ? "#fff" : "#374151",
                whiteSpace: "nowrap",
              }}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: "auto", fontSize: 13, color: "#6b7280" }}>
          {filtered.length} request{filtered.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <Empty
          icon="🌴"
          title="No leave requests"
          sub={filterStatus !== "All" || filterEmp !== "all"
            ? "No requests match the current filters."
            : "Submit a new leave request above."}
        />
      )}

      {/* Request cards */}
      {filtered.map(req => {
        const days = calendarDays(req.start_date, req.end_date);
        const tc = typeColors[req.type] ?? { bg: "#f3f4f6", col: "#374151" };
        const isPending = req.status === "pending";

        return (
          <div key={req.id} style={cardSt({ marginBottom: 10 })}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <Avatar name={empName(req.employee_id)} color="#4f46e5" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#111827" }}>
                    {empName(req.employee_id)}
                  </span>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>{empRole(req.employee_id)}</span>
                  <StatusBadge status={req.status} />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: req.notes ? 6 : 0 }}>
                  <Tag bg={tc.bg} col={tc.col}>{req.type}</Tag>
                  <span style={{ fontSize: 13, color: "#374151" }}>
                    {fmtDateDisplay(req.start_date)}
                    {req.start_date !== req.end_date && ` – ${fmtDateDisplay(req.end_date)}`}
                  </span>
                  <span style={{
                    fontSize: 12, padding: "2px 8px", borderRadius: 99,
                    background: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb",
                  }}>
                    {days} day{days !== 1 ? "s" : ""}
                  </span>
                </div>
                {req.notes && (
                  <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4, fontStyle: "italic" }}>
                    {req.notes}
                  </div>
                )}
                {req.created_at && (
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }}>
                    Submitted {fmtDateDisplay(req.created_at.slice(0, 10))}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "flex-start" }}>
                {isPending && (
                  <>
                    <BtnSuccess onClick={() => updateStatus(req.id, "approved")}>
                      Approve
                    </BtnSuccess>
                    <BtnDanger onClick={() => handleDeny(req)}>
                      Deny
                    </BtnDanger>
                    <Btn onClick={() => handleCancel(req)}>
                      Cancel
                    </Btn>
                  </>
                )}
                {!isPending && req.status === "approved" && (
                  <Btn onClick={() => {
                    if (window.confirm("Revert this approval to pending?")) updateStatus(req.id, "pending");
                  }}>
                    Revert
                  </Btn>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
