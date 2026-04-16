"use client";

import { useState } from "react";
import {
  MONTHS, ROLES, STRENGTHS, HPD,
  cardSt, selSt,
  Lbl, Row2, FocusInp, FocusTxt,
  BtnPri, Btn, BtnDanger, BtnSuccess, ToggleBtn,
  ConfirmModal,
  StatusBadge, SecTitle, Empty, Tag, StrBtn, Avatar, inits,
  DAYS_SHORT, dlabel, uid,
} from "./shared";

const YEARS = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 1 + i);

// Parse a YYYY-MM-DD date string into { y, m, d } with 0-indexed month
function parseDate(str) {
  if (!str) return null;
  const [y, mm, d] = str.split("-").map(Number);
  return { y, m: mm - 1, d };
}

// Format { y, m, d } (0-indexed month) back to YYYY-MM-DD
function fmtDateStr(y, m, d) {
  const mm = String(m + 1).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

// Day-of-week label from a date string (YYYY-MM-DD)
function dayLabel(dateStr) {
  const p = parseDate(dateStr);
  if (!p) return "";
  return dlabel(p.y, p.m, p.d);
}

export default function OpenShiftsTab({
  projects,
  employees,
  assigns,
  openShifts,
  setOpenShifts,
  shiftSwaps,
  setShiftSwaps,
  rYear,
  rMonth,
  setRMo,
  setRYear,
  showToast,
  calDays,
  getA,
  supabase,
}) {
  const [section, setSection] = useState("open"); // "open" | "swaps"

  // ── Month/Year nav ────────────────────────────────────────────────────────────
  function MonthSel({ val, set }) {
    return (
      <select
        value={val}
        onChange={(e) => set(+e.target.value)}
        style={selSt({ width: "auto" })}
      >
        {MONTHS.map((m, i) => (
          <option key={i} value={i}>
            {m}
          </option>
        ))}
      </select>
    );
  }

  function YearSel({ val, set }) {
    return (
      <select
        value={val}
        onChange={(e) => set(+e.target.value)}
        style={selSt({ width: "auto" })}
      >
        {YEARS.map((y) => (
          <option key={y}>{y}</option>
        ))}
      </select>
    );
  }

  // ── Helper: project lookup ────────────────────────────────────────────────────
  function projById(id) {
    return projects.find((p) => p.id === id);
  }

  function empById(id) {
    return employees.find((e) => e.id === id);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION 1: OPEN SHIFTS
  // ════════════════════════════════════════════════════════════════════════════
  function OpenShiftsSection() {
    // Default date: first day of current rYear/rMonth
    const defaultDate = fmtDateStr(rYear, rMonth, 1);

    const [date, setDate] = useState(defaultDate);
    const [projectId, setProjectId] = useState(projects[0]?.id || "");
    const [requiredRole, setRequiredRole] = useState(ROLES[0]);
    const [requiredStrengths, setRequiredStrengths] = useState([]);
    const [notes, setNotes] = useState("");
    const [saving, setSaving] = useState(false);
    const [openShiftToDelete, setOpenShiftToDelete] = useState(null);

    function toggleStrength(s) {
      setRequiredStrengths((prev) =>
        prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
      );
    }

    async function postShift() {
      if (!date || !projectId) {
        showToast("Please select a date and project.");
        return;
      }
      setSaving(true);
      const newShift = {
        id: uid(),
        date,
        project_id: projectId,
        required_role: requiredRole,
        required_strengths: requiredStrengths,
        claimed_by: null,
        status: "open",
        notes,
      };
      // Optimistic update
      setOpenShifts((prev) => [...prev, newShift]);
      // Reset form
      setDate(defaultDate);
      setRequiredStrengths([]);
      setNotes("");

      supabase
        .from("open_shifts")
        .insert(newShift)
        .then(({ error }) => {
          if (error) {
            showToast("Error posting shift: " + error.message);
            setOpenShifts((prev) => prev.filter((s) => s.id !== newShift.id));
          } else {
            showToast("Open shift posted.");
          }
        });
      setSaving(false);
    }

    // Filter shifts to the selected rYear/rMonth
    const filtered = openShifts.filter((s) => {
      const p = parseDate(s.date);
      return p && p.y === rYear && p.m === rMonth;
    });

    // Determine eligible employees for an open shift
    function eligibleEmployees(shift) {
      const p = parseDate(shift.date);
      if (!p) return [];
      return employees.filter((e) => {
        // Must not already be assigned that day
        if (getA(p.y, p.m, p.d, e.id)) return false;
        // Role match OR strength overlap
        const roleMatch = e.role === shift.required_role;
        const strengthMatch =
          shift.required_strengths?.length > 0 &&
          e.strengths?.some((s) => shift.required_strengths.includes(s));
        return roleMatch || strengthMatch || (!shift.required_role && !shift.required_strengths?.length);
      });
    }

    function claimShift(shift, empId) {
      const updated = { ...shift, status: "claimed", claimed_by: empId };
      setOpenShifts((prev) =>
        prev.map((s) => (s.id === shift.id ? updated : s))
      );

      // Insert the assignment into Supabase
      const p = parseDate(shift.date);
      if (p) {
        supabase
          .from("assignments")
          .upsert({
            year: p.y,
            month: p.m,
            day: p.d,
            employee_id: empId,
            project_id: shift.project_id,
          })
          .then(({ error }) => {
            if (error) showToast("Assignment error: " + error.message);
          });
      }

      supabase
        .from("open_shifts")
        .upsert(updated)
        .then(({ error }) => {
          if (error) showToast("Error claiming shift: " + error.message);
          else showToast("Shift claimed — refresh roster to see assignment.");
        });
    }

    function markFilled(shift) {
      const updated = { ...shift, status: "filled" };
      setOpenShifts((prev) =>
        prev.map((s) => (s.id === shift.id ? updated : s))
      );
      supabase
        .from("open_shifts")
        .upsert(updated)
        .then(({ error }) => {
          if (error) showToast("Error updating shift: " + error.message);
          else showToast("Shift marked as filled.");
        });
    }

    function deleteShift(id) {
      setOpenShifts((prev) => prev.filter((s) => s.id !== id));
      supabase
        .from("open_shifts")
        .delete()
        .eq("id", id)
        .then(({ error }) => {
          if (error) showToast("Error deleting shift: " + error.message);
        });
    }

    return (
      <div>
        {/* ── Post new shift form ── */}
        <div style={cardSt({ marginBottom: 20 })}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#111827",
              marginBottom: 14,
            }}
          >
            Post a new open shift
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Row2>
              <div>
                <Lbl>Date</Lbl>
                <FocusInp
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div>
                <Lbl>Project</Lbl>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  style={selSt({ width: "100%" })}
                >
                  {projects.length === 0 && (
                    <option value="">No projects</option>
                  )}
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </Row2>
            <div>
              <Lbl>Required role</Lbl>
              <select
                value={requiredRole}
                onChange={(e) => setRequiredRole(e.target.value)}
                style={selSt({ width: "100%" })}
              >
                {ROLES.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <Lbl>Required strengths</Lbl>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  padding: 10,
                  border: "1.5px solid #e5e7eb",
                  borderRadius: 8,
                  background: "#fafafa",
                }}
              >
                {STRENGTHS.map((s) => (
                  <StrBtn
                    key={s}
                    label={s}
                    active={requiredStrengths.includes(s)}
                    onClick={() => toggleStrength(s)}
                  />
                ))}
              </div>
            </div>
            <div>
              <Lbl>Notes</Lbl>
              <FocusTxt
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any details about this shift..."
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <BtnPri onClick={postShift} style={saving ? { opacity: 0.6 } : {}}>
                Post shift
              </BtnPri>
            </div>
          </div>
        </div>

        {/* ── Shift list ── */}
        <SecTitle>
          Open shifts — {MONTHS[rMonth]} {rYear} ({filtered.length})
        </SecTitle>

        {filtered.length === 0 && (
          <Empty
            icon="📋"
            title="No open shifts this month"
            sub="Post a shift above to make it visible to employees"
          />
        )}

        {filtered
          .slice()
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((shift) => {
            const proj = projById(shift.project_id);
            const claimedEmp = shift.claimed_by
              ? empById(shift.claimed_by)
              : null;
            const eligible = eligibleEmployees(shift);
            const dl = dayLabel(shift.date);

            return (
              <div key={shift.id} style={cardSt()}>
                {/* Header row */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                    marginBottom: 10,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    {/* Date + day label */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 6,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          color: "#111827",
                        }}
                      >
                        {shift.date}
                      </span>
                      {dl && (
                        <span
                          style={{
                            fontSize: 12,
                            color: "#6b7280",
                            background: "#f3f4f6",
                            padding: "2px 8px",
                            borderRadius: 99,
                          }}
                        >
                          {dl}
                        </span>
                      )}
                      <StatusBadge status={shift.status} />
                    </div>

                    {/* Project */}
                    {proj && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          marginBottom: 4,
                        }}
                      >
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background: proj.color,
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontSize: 13, color: "#374151" }}>
                          {proj.name}
                          {proj.client ? ` · ${proj.client}` : ""}
                        </span>
                      </div>
                    )}

                    {/* Required role */}
                    {shift.required_role && (
                      <div
                        style={{
                          fontSize: 13,
                          color: "#6b7280",
                          marginBottom: 4,
                        }}
                      >
                        Role:{" "}
                        <span style={{ color: "#374151", fontWeight: 500 }}>
                          {shift.required_role}
                        </span>
                      </div>
                    )}

                    {/* Required strengths */}
                    {shift.required_strengths?.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          gap: 4,
                          flexWrap: "wrap",
                          marginBottom: 4,
                        }}
                      >
                        {shift.required_strengths.map((s) => (
                          <Tag key={s} bg="#ecfdf5" col="#065f46">
                            {s}
                          </Tag>
                        ))}
                      </div>
                    )}

                    {/* Claimed by */}
                    {claimedEmp && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          marginBottom: 4,
                        }}
                      >
                        <Avatar name={claimedEmp.name} />
                        <span style={{ fontSize: 13, color: "#374151" }}>
                          Claimed by{" "}
                          <strong>{claimedEmp.name}</strong>
                        </span>
                      </div>
                    )}

                    {/* Notes */}
                    {shift.notes && (
                      <div
                        style={{
                          fontSize: 13,
                          color: "#6b7280",
                          fontStyle: "italic",
                          marginTop: 4,
                        }}
                      >
                        {shift.notes}
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      flexShrink: 0,
                    }}
                  >
                    {shift.status === "claimed" && (
                      <BtnSuccess onClick={() => markFilled(shift)}>
                        Mark filled
                      </BtnSuccess>
                    )}
                    <BtnDanger onClick={() => setOpenShiftToDelete(shift.id)}>
                      Delete
                    </BtnDanger>
                  </div>
                </div>

                {/* Eligible employees (only for open shifts) */}
                {shift.status === "open" && (
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#6b7280",
                        letterSpacing: "0.07em",
                        textTransform: "uppercase",
                        marginBottom: 6,
                      }}
                    >
                      Eligible employees ({eligible.length})
                    </div>
                    {eligible.length === 0 ? (
                      <div
                        style={{
                          fontSize: 13,
                          color: "#9ca3af",
                          padding: "8px 0",
                        }}
                      >
                        No eligible employees available on this date.
                      </div>
                    ) : (
                      <div
                        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                      >
                        {eligible.map((emp) => (
                          <div
                            key={emp.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "6px 10px",
                              border: "1.5px solid #e5e7eb",
                              borderRadius: 8,
                              background: "#f9fafb",
                            }}
                          >
                            <Avatar name={emp.name} />
                            <div>
                              <div
                                style={{
                                  fontSize: 13,
                                  fontWeight: 500,
                                  color: "#111827",
                                }}
                              >
                                {emp.name}
                              </div>
                              <div style={{ fontSize: 11, color: "#6b7280" }}>
                                {emp.role}
                              </div>
                            </div>
                            <Btn
                              onClick={() => claimShift(shift, emp.id)}
                              style={{ marginLeft: 4, fontSize: 12, padding: "5px 10px" }}
                            >
                              Claim
                            </Btn>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        <ConfirmModal
          open={!!openShiftToDelete}
          title="Delete open shift?"
          message="Remove this open shift posting? This cannot be undone."
          onCancel={() => setOpenShiftToDelete(null)}
          onConfirm={() => {
            const id = openShiftToDelete;
            setOpenShiftToDelete(null);
            if (id) deleteShift(id);
          }}
        />
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION 2: SHIFT SWAPS
  // ════════════════════════════════════════════════════════════════════════════
  function ShiftSwapsSection() {
    const defaultDate = fmtDateStr(rYear, rMonth, 1);

    const [requesterId, setRequesterId] = useState(employees[0]?.id || "");
    const [shiftDate, setShiftDate] = useState(defaultDate);
    const [swapProjectId, setSwapProjectId] = useState(projects[0]?.id || "");
    const [acceptorId, setAcceptorId] = useState("");
    const [swapNotes, setSwapNotes] = useState("");
    const [swapToDelete, setSwapToDelete] = useState(null);

    // Auto-derive project from assigns when requester + date change
    function deriveProject(empId, dateStr) {
      const p = parseDate(dateStr);
      if (!p || !empId) return projects[0]?.id || "";
      // Look through all days matching the date
      const assigned = getA(p.y, p.m, p.d, empId);
      if (assigned) return assigned;
      return projects[0]?.id || "";
    }

    function handleRequesterChange(id) {
      setRequesterId(id);
      setSwapProjectId(deriveProject(id, shiftDate));
    }

    function handleShiftDateChange(dateStr) {
      setShiftDate(dateStr);
      setSwapProjectId(deriveProject(requesterId, dateStr));
    }

    // Employees available on a given date (based on availability JSONB)
    function availableOnDate(dateStr) {
      const p = parseDate(dateStr);
      if (!p) return employees;
      const dayName = dlabel(p.y, p.m, p.d);
      return employees.filter((e) => e.availability?.[dayName]);
    }

    const otherEmployees = availableOnDate(shiftDate).filter(
      (e) => e.id !== requesterId
    );

    async function requestSwap() {
      if (!requesterId || !shiftDate) {
        showToast("Please select a requester and shift date.");
        return;
      }
      const newSwap = {
        id: uid(),
        requester_id: requesterId,
        acceptor_id: acceptorId || null,
        shift_date: shiftDate,
        project_id: swapProjectId,
        status: "pending",
        notes: swapNotes,
        created_at: new Date().toISOString(),
      };
      setShiftSwaps((prev) => [...prev, newSwap]);
      setSwapNotes("");

      supabase
        .from("shift_swaps")
        .insert(newSwap)
        .then(({ error }) => {
          if (error) {
            showToast("Error requesting swap: " + error.message);
            setShiftSwaps((prev) => prev.filter((s) => s.id !== newSwap.id));
          } else {
            showToast("Swap request submitted.");
          }
        });
    }

    function updateSwapStatus(swap, status) {
      const updated = { ...swap, status };
      setShiftSwaps((prev) =>
        prev.map((s) => (s.id === swap.id ? updated : s))
      );
      supabase
        .from("shift_swaps")
        .upsert(updated)
        .then(({ error }) => {
          if (error) showToast("Error updating swap: " + error.message);
          else {
            const msgs = {
              accepted: "Swap accepted.",
              denied: "Swap denied.",
              completed: "Swap marked as completed.",
            };
            showToast(msgs[status] || "Swap updated.");
          }
        });
    }

    function deleteSwap(id) {
      setShiftSwaps((prev) => prev.filter((s) => s.id !== id));
      supabase
        .from("shift_swaps")
        .delete()
        .eq("id", id)
        .then(({ error }) => {
          if (error) showToast("Error deleting swap: " + error.message);
        });
    }

    // Filter swaps to current rYear/rMonth by shift_date
    const filtered = shiftSwaps.filter((s) => {
      const p = parseDate(s.shift_date);
      return p && p.y === rYear && p.m === rMonth;
    });

    return (
      <div>
        {/* ── Request swap form ── */}
        <div style={cardSt({ marginBottom: 20 })}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#111827",
              marginBottom: 14,
            }}
          >
            Request a shift swap
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Row2>
              <div>
                <Lbl>Requester</Lbl>
                <select
                  value={requesterId}
                  onChange={(e) => handleRequesterChange(e.target.value)}
                  style={selSt({ width: "100%" })}
                >
                  {employees.length === 0 && (
                    <option value="">No employees</option>
                  )}
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Lbl>Shift date</Lbl>
                <FocusInp
                  type="date"
                  value={shiftDate}
                  onChange={(e) => handleShiftDateChange(e.target.value)}
                />
              </div>
            </Row2>
            <div>
              <Lbl>Project</Lbl>
              <select
                value={swapProjectId}
                onChange={(e) => setSwapProjectId(e.target.value)}
                style={selSt({ width: "100%" })}
              >
                {projects.length === 0 && (
                  <option value="">No projects</option>
                )}
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Lbl>Swap with (optional — leave blank for open swap)</Lbl>
              <select
                value={acceptorId}
                onChange={(e) => setAcceptorId(e.target.value)}
                style={selSt({ width: "100%" })}
              >
                <option value="">Any available employee</option>
                {otherEmployees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} · {e.role}
                  </option>
                ))}
              </select>
              {shiftDate && otherEmployees.length === 0 && (
                <div
                  style={{
                    fontSize: 12,
                    color: "#9ca3af",
                    marginTop: 4,
                  }}
                >
                  No other employees available on {dayLabel(shiftDate) || shiftDate}.
                </div>
              )}
            </div>
            <div>
              <Lbl>Notes</Lbl>
              <FocusTxt
                value={swapNotes}
                onChange={(e) => setSwapNotes(e.target.value)}
                placeholder="Reason for swap or any details..."
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <BtnPri onClick={requestSwap}>Request swap</BtnPri>
            </div>
          </div>
        </div>

        {/* ── Swap list ── */}
        <SecTitle>
          Shift swaps — {MONTHS[rMonth]} {rYear} ({filtered.length})
        </SecTitle>

        {filtered.length === 0 && (
          <Empty
            icon="🔄"
            title="No shift swaps this month"
            sub="Use the form above to request a swap"
          />
        )}

        {filtered
          .slice()
          .sort((a, b) => a.shift_date.localeCompare(b.shift_date))
          .map((swap) => {
            const requester = empById(swap.requester_id);
            const acceptor = swap.acceptor_id ? empById(swap.acceptor_id) : null;
            const proj = projById(swap.project_id);
            const dl = dayLabel(swap.shift_date);
            const canDelete =
              swap.status === "denied" || swap.status === "completed";

            return (
              <div key={swap.id} style={cardSt()}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    {/* Requester → Acceptor */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 6,
                        flexWrap: "wrap",
                      }}
                    >
                      {requester && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          <Avatar name={requester.name} />
                          <span
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              color: "#111827",
                            }}
                          >
                            {requester.name}
                          </span>
                        </div>
                      )}
                      <span style={{ fontSize: 13, color: "#9ca3af" }}>→</span>
                      {acceptor ? (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          <Avatar name={acceptor.name} />
                          <span
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              color: "#111827",
                            }}
                          >
                            {acceptor.name}
                          </span>
                        </div>
                      ) : (
                        <span
                          style={{
                            fontSize: 13,
                            color: "#6b7280",
                            fontStyle: "italic",
                          }}
                        >
                          Any
                        </span>
                      )}
                      <StatusBadge status={swap.status} />
                    </div>

                    {/* Date + project */}
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        flexWrap: "wrap",
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ fontSize: 13, color: "#374151" }}>
                        {swap.shift_date}
                      </span>
                      {dl && (
                        <span
                          style={{
                            fontSize: 12,
                            color: "#6b7280",
                            background: "#f3f4f6",
                            padding: "2px 8px",
                            borderRadius: 99,
                          }}
                        >
                          {dl}
                        </span>
                      )}
                      {proj && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background: proj.color,
                            }}
                          />
                          <span style={{ fontSize: 13, color: "#374151" }}>
                            {proj.name}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Notes */}
                    {swap.notes && (
                      <div
                        style={{
                          fontSize: 13,
                          color: "#6b7280",
                          fontStyle: "italic",
                          marginBottom: 4,
                        }}
                      >
                        {swap.notes}
                      </div>
                    )}

                    {/* Completed note */}
                    {swap.status === "completed" && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "#059669",
                          background: "#f0fdf4",
                          border: "1px solid #bbf7d0",
                          borderRadius: 6,
                          padding: "6px 10px",
                          marginTop: 4,
                        }}
                      >
                        Remember to update the roster assignments manually.
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      flexShrink: 0,
                    }}
                  >
                    {swap.status === "pending" && (
                      <>
                        <BtnSuccess
                          onClick={() => updateSwapStatus(swap, "accepted")}
                        >
                          Accept
                        </BtnSuccess>
                        <BtnDanger
                          onClick={() => updateSwapStatus(swap, "denied")}
                        >
                          Deny
                        </BtnDanger>
                      </>
                    )}
                    {swap.status === "accepted" && (
                      <BtnSuccess
                        onClick={() => updateSwapStatus(swap, "completed")}
                      >
                        Complete
                      </BtnSuccess>
                    )}
                    {canDelete && (
                      <BtnDanger onClick={() => setSwapToDelete(swap.id)}>
                        Delete
                      </BtnDanger>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        <ConfirmModal
          open={!!swapToDelete}
          title="Delete shift swap?"
          message="Remove this swap record? This cannot be undone."
          onCancel={() => setSwapToDelete(null)}
          onConfirm={() => {
            const id = swapToDelete;
            setSwapToDelete(null);
            if (id) deleteSwap(id);
          }}
        />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Page heading */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <h3
          style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#111827" }}
        >
          Open Shifts &amp; Swaps
        </h3>
        {/* Month / year navigation */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <MonthSel val={rMonth} set={setRMo} />
          <YearSel val={rYear} set={setRYear} />
        </div>
      </div>

      <SectionToggle />

      {section === "open" && <OpenShiftsSection />}
      {section === "swaps" && <ShiftSwapsSection />}
    </div>
  );
}
