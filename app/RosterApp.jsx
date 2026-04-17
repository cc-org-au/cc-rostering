"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { supabase } from '../lib/supabase.js';
import UserMenu from './components/UserMenu';
import { NotificationCenter } from './components/NotificationCenter';
import SettingsTab from './components/SettingsTab';
import ReportsTab from './components/ReportsTab';
import PTOTab from './components/PTOTab';
import AdminTab from './components/AdminTab';
import AssignmentScheduleOverview from './components/AssignmentScheduleOverview';
import { StrengthTagsPicker } from './components/StrengthTagsSection';
import TimesheetTab from './components/TimesheetTab';
import {
  wdInMonth, getProjectMonths, totalBudgetHours, totalInputHours, spreadAcrossMonths,
  monthBudgetSlice, monthlyTargetHoursCapped, DEFAULT_PROJECT_WORK_DAYS,
  isSiteSupervisor, pmKey,
} from '../lib/rosterAlloc.js';
import OpenShiftsTab from './components/OpenShiftsTab';
import {
  DAYS_SHORT, MONTHS, EMP_TYPES, ROLES, STRENGTHS, PROJ_COLORS, HPD, ConfirmModal,
  cardSt, inpSt, selSt, ProgBar, Avatar, Tag, SecTitle, Empty, BtnPri, Btn, BtnDanger,
  Overlay, ModalBox, Lbl, Row2, FocusInp, FocusTxt, ToggleBtn,
} from './components/shared';

const TABS = ["Projects","Employees","Schedule","Roster","Capacity","Summary","Timesheets","Open Shifts","Settings","Reports","PTO","Admin"];
const NOW         = new Date();

// ── pure utils ────────────────────────────────────────────────────────────────
const uid       = () => Math.random().toString(36).slice(2,8);
const daysInMo  = (y,m) => new Date(y,m+1,0).getDate();
const dowOf     = (y,m,d) => new Date(y,m,d).getDay();
const dlabel    = (y,m,d) => DAYS_SHORT[(dowOf(y,m,d)+6)%7];
const isWknd    = (y,m,d) => { const w=dowOf(y,m,d); return w===0||w===6; };
const fmt$      = n => "$"+Math.round(n).toLocaleString();
const fmtH      = n => Math.round(n*10)/10+"h";
const inits     = name => name.trim().split(/\s+/).map(n=>n[0]).join("").slice(0,2).toUpperCase();

function mergeWorkDays(raw) {
  let o = raw;
  if (typeof o === "string") {
    try {
      o = JSON.parse(o);
    } catch {
      o = {};
    }
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) o = {};
  return { ...DEFAULT_PROJECT_WORK_DAYS, ...o };
}
function projectRunsOnDay(p, dl) {
  return mergeWorkDays(p.workDays)[dl] === true;
}
/** Include this calendar day in auto-generate loops (weekends only if at least one project runs then). */
function dayUsedForScheduling(schedProjects, y, m, d) {
  const dl = dlabel(y, m, d);
  if (!isWknd(y, m, d)) return true;
  return schedProjects.some((p) => projectRunsOnDay(p, dl));
}

// ── DB ↔ app mapping ─────────────────────────────────────────────────────────
const projToRow = p => ({
  id: p.id, name: p.name, client: p.client, color: p.color, notes: p.notes,
  budget: p.budget, charge_out_rate: p.chargeOutRate, total_input: p.totalInput,
  total_unit: p.totalUnit, staff_mode: p.staffMode, fixed_staff: p.fixedStaff,
  start_month: p.startMonth, start_year: p.startYear, end_month: p.endMonth,
  end_year: p.endYear, monthly_hours: p.monthlyHours, strengths_required: p.strengthsRequired||[],
  completed: p.isCompleted||false,
  work_days: mergeWorkDays(p.workDays),
  overtime_note: p.overtimeNote||'',
});
const rowToProj = r => ({
  id: r.id, name: r.name, client: r.client||'', color: r.color||PROJ_COLORS[0],
  notes: r.notes||'', budget: r.budget||'', chargeOutRate: r.charge_out_rate||'',
  totalInput: r.total_input||'', totalUnit: r.total_unit||'days',
  staffMode: r.staff_mode||'flexible', fixedStaff: r.fixed_staff||'',
  startMonth: r.start_month||String(NOW.getMonth()), startYear: r.start_year||String(NOW.getFullYear()),
  endMonth: r.end_month||String(NOW.getMonth()), endYear: r.end_year||String(NOW.getFullYear()),
  monthlyHours: r.monthly_hours||{}, strengthsRequired: r.strengths_required||[], isCompleted: r.completed||false,
  workDays: mergeWorkDays(r.work_days),
  overtimeNote: r.overtime_note||'',
});
const empToRow = e => ({
  id: e.id, name: e.name, role: e.role, type: e.type, rate: e.rate,
  phone: e.phone, email: e.email, notes: e.notes, availability: e.availability,
  max_hours_per_month: e.maxHoursPerMonth, strengths: e.strengths||[],
});
const rowToEmp = r => ({
  id: r.id, name: r.name, role: r.role||ROLES[3], type: r.type||EMP_TYPES[0],
  rate: r.rate||'', phone: r.phone||'', email: r.email||'', notes: r.notes||'',
  availability: r.availability||{Mon:true,Tue:true,Wed:true,Thu:true,Fri:true,Sat:false,Sun:false},
  maxHoursPerMonth: r.max_hours_per_month||160, strengths: r.strengths||[],
});

/** Skills arrays on projects/employees — must use .select() after update or PostgREST can report success with 0 rows updated (RLS/id mismatch), which looked like “UI changed but DB did not”. */
async function persistProjectStrengthsRequired(projectId, strengthsRequired, { setProj, showToast }) {
  const { data, error } = await supabase
    .from("projects")
    .update({ strengths_required: strengthsRequired })
    .eq("id", projectId)
    .select("strengths_required");
  if (error) {
    showToast(error.message);
    return { ok: false };
  }
  if (!data?.length) {
    showToast("Could not save skills — the project was not updated in the database.");
    return { ok: false };
  }
  const saved = [...(data[0].strengths_required ?? strengthsRequired)];
  setProj((list) => list.map((x) => (x.id === projectId ? { ...x, strengthsRequired: saved } : x)));
  return { ok: true, saved };
}

async function persistEmployeeStrengths(employeeId, strengths, { setEmps, showToast }) {
  const { data, error } = await supabase
    .from("employees")
    .update({ strengths })
    .eq("id", employeeId)
    .select("strengths");
  if (error) {
    showToast(error.message);
    return { ok: false };
  }
  if (!data?.length) {
    showToast("Could not save skills — the employee was not updated in the database.");
    return { ok: false };
  }
  const saved = [...(data[0].strengths ?? strengths)];
  setEmps((list) => list.map((x) => (x.id === employeeId ? { ...x, strengths: saved } : x)));
  return { ok: true, saved };
}

const YEARS = Array.from({ length: 6 }, (_, i) => NOW.getFullYear() - 1 + i);

/** Stable module-level modals — inner `function Modal()` inside App remounts every parent render and resets StrengthTagsPicker edit state. */
function ProjectModal({
  projMod,
  pRef,
  setProjMod,
  strengthsCatalog,
  customStrengths,
  setCustomStrengths,
  setProj,
  showToast,
  saveProj,
  purgeTagFromSystem,
}) {
  const p = pRef.current;
  if (!p) return null;
  const [name, setName] = useState(p.name);
  const [client, setClient] = useState(p.client);
  const [budget, setBudget] = useState(p.budget);
  const [cor, setCor] = useState(p.chargeOutRate || "");
  const [totalInput, setTI] = useState(p.totalInput || "");
  const [totalUnit, setTU] = useState(p.totalUnit || "days");
  const [staffMode, setSM] = useState(p.staffMode || "flexible");
  const [fixedStaff, setFS] = useState(p.fixedStaff || "");
  const [color, setColor] = useState(p.color);
  const [sm, setSm] = useState(p.startMonth);
  const [sy, setSy] = useState(p.startYear);
  const [em, setEm] = useState(p.endMonth);
  const [ey, setEy] = useState(p.endYear);
  const [hours, setHours] = useState({ ...p.monthlyHours });
  const [notes, setNotes] = useState(p.notes);
  const [isCompleted, setIsCompleted] = useState(p.isCompleted || false);
  const [workDays, setWd] = useState(() => mergeWorkDays(p.workDays));
  const [overtimeNote, setOt] = useState(p.overtimeNote || "");
  const [, rerender] = useState(0);
  const sync = (patch) => Object.assign(pRef.current, patch);
  function applyStrengthsRequired(update) {
    const prev = [...(pRef.current.strengthsRequired || [])];
    const next = typeof update === "function" ? update(prev) : update;
    const copy = [...next];
    const id = pRef.current?.id;
    const snapshot = prev;
    sync({ strengthsRequired: copy });
    rerender((t) => t + 1);
    if (!id) return;
    setProj((list) => list.map((x) => (x.id === id ? { ...x, strengthsRequired: copy } : x)));
    void (async () => {
      const result = await persistProjectStrengthsRequired(id, copy, { setProj, showToast });
      if (!result.ok) {
        sync({ strengthsRequired: snapshot });
        rerender((t) => t + 1);
        setProj((list) => list.map((x) => (x.id === id ? { ...x, strengthsRequired: snapshot } : x)));
        return;
      }
      if (result.saved && pRef.current?.id === id) {
        sync({ strengthsRequired: [...result.saved] });
        rerender((t) => t + 1);
      }
    })();
  }
  const localMonths = getProjectMonths({ startMonth: sm, startYear: sy, endMonth: em, endYear: ey });
  const impliedSpreadForAlloc = spreadAcrossMonths({
    ...pRef.current,
    totalInput,
    totalUnit,
    startMonth: sm,
    startYear: sy,
    endMonth: em,
    endYear: ey,
  });
  const totalAllocH = localMonths.reduce((a, { y, m }) => {
    const k = pmKey(y, m);
    const v =
      hours[k] !== undefined
        ? hours[k]
        : impliedSpreadForAlloc[k] !== undefined
          ? impliedSpreadForAlloc[k]
          : wdInMonth(y, m) * HPD;
    return a + v;
  }, 0);
  const tH = totalInputHours({ totalInput, totalUnit });
  const diff = tH !== null ? totalAllocH - tH : null;
  function doSpread() {
    const s = spreadAcrossMonths({ ...pRef.current, totalInput, totalUnit });
    setHours(s);
    sync({ monthlyHours: s });
    rerender((r) => r + 1);
  }
  function setMonthVal(key, raw) {
    const v = parseFloat(raw) || 0;
    const stored = totalUnit === "hours" ? v : v * HPD;
    const next = { ...hours, [key]: stored };
    setHours(next);
    sync({ monthlyHours: next });
  }
  function clearMonthVal(key) {
    const next = { ...hours };
    delete next[key];
    setHours(next);
    sync({ monthlyHours: next });
  }
  function switchUnit(u) {
    setTU(u);
    sync({ totalUnit: u });
    const s = spreadAcrossMonths({ ...pRef.current, totalUnit: u });
    if (Object.keys(s).length) {
      setHours(s);
      sync({ monthlyHours: s });
    }
    rerender((r) => r + 1);
  }
  const close = () => {
    setProjMod(null);
    pRef.current = null;
  };
  return (
    <Overlay onClose={close}>
      <ModalBox>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>
            {projMod === "new" ? "New project" : "Edit project"}
          </h3>
          <Btn onClick={close}>Cancel</Btn>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Row2>
            <div>
              <Lbl>Project name *</Lbl>
              <FocusInp
                value={name}
                placeholder="e.g. Riverside Park"
                onChange={(e) => {
                  setName(e.target.value);
                  sync({ name: e.target.value });
                }}
              />
            </div>
            <div>
              <Lbl>Client</Lbl>
              <FocusInp
                value={client}
                placeholder="e.g. City Council"
                onChange={(e) => {
                  setClient(e.target.value);
                  sync({ client: e.target.value });
                }}
              />
            </div>
          </Row2>
          <Row2>
            <div>
              <Lbl>Total budget ($)</Lbl>
              <FocusInp
                type="number"
                value={budget}
                placeholder="e.g. 250000"
                onChange={(e) => {
                  setBudget(e.target.value);
                  sync({ budget: e.target.value });
                  rerender((r) => r + 1);
                }}
              />
            </div>
            <div>
              <Lbl>Client charge-out rate ($/hr)</Lbl>
              <FocusInp
                type="number"
                value={cor}
                placeholder="e.g. 85"
                onChange={(e) => {
                  setCor(e.target.value);
                  sync({ chargeOutRate: e.target.value });
                  rerender((r) => r + 1);
                }}
              />
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>
                Rate billed to the client per hour on this job. Auto-schedule caps to budget ÷ this rate.
              </div>
            </div>
          </Row2>
          <div>
            <Lbl>Total project allocation</Lbl>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <FocusInp
                type="number"
                value={totalInput}
                placeholder={totalUnit === "days" ? "e.g. 45" : "e.g. 360"}
                style={{ flex: 1, width: "auto" }}
                onChange={(e) => {
                  setTI(e.target.value);
                  sync({ totalInput: e.target.value });
                  rerender((r) => r + 1);
                }}
              />
              <ToggleBtn options={[["days", "Days"], ["hours", "Hours"]]} value={totalUnit} onChange={switchUnit} />
            </div>
            {totalInput && parseFloat(totalInput) > 0 && (
              <div style={{ marginTop: 5, fontSize: 12, color: "var(--text-muted)" }}>
                {totalUnit === "days" ? (
                  <>
                    = <b style={{ color: "var(--text-primary)" }}>{parseFloat(totalInput) * HPD}h</b> total
                  </>
                ) : (
                  <>
                    = <b style={{ color: "var(--text-primary)" }}>{(parseFloat(totalInput) / HPD).toFixed(1)} days</b> equiv
                  </>
                )}
              </div>
            )}
            {budget && cor && parseFloat(budget) > 0 && parseFloat(cor) > 0 && (
              <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted)" }}>
                💡 Budget implies{" "}
                <b style={{ color: "var(--text-primary)" }}>{Math.round(parseFloat(budget) / parseFloat(cor) / HPD)} days</b> (
                {Math.round(parseFloat(budget) / parseFloat(cor))}h) at ${cor}/hr
              </div>
            )}
          </div>
          <div>
            <Lbl>Daily staff requirement</Lbl>
            <ToggleBtn
              options={[["flexible", "Flexible"], ["fixed", "Fixed team size"]]}
              value={staffMode}
              onChange={(v) => {
                setSM(v);
                sync({ staffMode: v });
              }}
            />
            <div style={{ marginTop: 10 }}>
              {staffMode === "flexible" ? (
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-muted)",
                    padding: "10px 14px",
                    background: "var(--bg-muted)",
                    border: "1.5px solid var(--border)",
                    borderRadius: 8,
                  }}
                >
                  Staff can vary day to day — assign whoever is needed when building the roster.
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 14px",
                    background: "var(--info-bg)",
                    border: "1.5px solid var(--info-border)",
                    borderRadius: 8,
                  }}
                >
                  <span style={{ fontSize: 13, color: "var(--info-text-strong)", whiteSpace: "nowrap" }}>Exactly</span>
                  <FocusInp
                    type="number"
                    value={fixedStaff}
                    placeholder="e.g. 4"
                    style={{ width: 80, textAlign: "center" }}
                    onChange={(e) => {
                      setFS(e.target.value);
                      sync({ fixedStaff: e.target.value });
                    }}
                  />
                  <span style={{ fontSize: 13, color: "var(--info-text-strong)" }}>staff required on site every day.</span>
                </div>
              )}
            </div>
          </div>
          <div>
            <Lbl>Project colour</Lbl>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {PROJ_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setColor(c);
                    sync({ color: c });
                  }}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: c,
                    border: color === c ? "3px solid var(--text-primary)" : "2px solid transparent",
                    cursor: "pointer",
                  }}
                />
              ))}
            </div>
          </div>
          <StrengthTagsPicker
            label="Strengths / skills required"
            catalog={strengthsCatalog}
            selected={[...(pRef.current.strengthsRequired || [])]}
            onSelectedChange={applyStrengthsRequired}
            onPurgeTagGlobally={purgeTagFromSystem}
            ensureCatalogTag={(v) => {
              if (!strengthsCatalog.includes(v)) setCustomStrengths((s) => [...s, v]);
            }}
          />
          <div>
            <Lbl>Project dates</Lbl>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 20px 1fr 1fr", gap: 8, alignItems: "center" }}>
              <select
                style={selSt({ width: "100%" })}
                value={sm}
                onChange={(e) => {
                  setSm(e.target.value);
                  sync({ startMonth: e.target.value });
                  rerender((r) => r + 1);
                }}
              >
                {MONTHS.map((m, i) => (
                  <option key={i} value={i}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                style={selSt({ width: "100%" })}
                value={sy}
                onChange={(e) => {
                  setSy(e.target.value);
                  sync({ startYear: e.target.value });
                  rerender((r) => r + 1);
                }}
              >
                {YEARS.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
              <span style={{ textAlign: "center", color: "var(--text-faint)" }}>→</span>
              <select
                style={selSt({ width: "100%" })}
                value={em}
                onChange={(e) => {
                  setEm(e.target.value);
                  sync({ endMonth: e.target.value });
                  rerender((r) => r + 1);
                }}
              >
                {MONTHS.map((m, i) => (
                  <option key={i} value={i}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                style={selSt({ width: "100%" })}
                value={ey}
                onChange={(e) => {
                  setEy(e.target.value);
                  sync({ endYear: e.target.value });
                  rerender((r) => r + 1);
                }}
              >
                {YEARS.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Lbl>Days this project runs (auto-schedule &amp; bulk assign)</Lbl>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {DAYS_SHORT.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    const n = { ...workDays, [d]: !workDays[d] };
                    setWd(n);
                    sync({ workDays: n });
                  }}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1.5px solid",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 13,
                    fontWeight: 500,
                    background: workDays[d] ? "#dbeafe" : "var(--bg-muted)",
                    color: workDays[d] ? "#1e40af" : "var(--text-muted)",
                    borderColor: workDays[d] ? "#93c5fd" : "var(--border)",
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 12, color: "var(--text-faint)", margin: "8px 0 0" }}>
              Turn on Sat/Sun only if this job actually runs weekends. Staff must also be available those days.
            </p>
          </div>
          {localMonths.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-faint)", margin: 0 }}>Set project dates above to configure monthly allocations.</p>
          ) : (
            <div>
              <Lbl>Monthly allocation ({totalUnit})</Lbl>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  flexWrap: "wrap",
                  alignItems: "center",
                  marginBottom: 10,
                  padding: "10px 14px",
                  background: "var(--bg-muted)",
                  border: "1.5px solid var(--border)",
                  borderRadius: 8,
                }}
              >
                {tH && (
                  <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    Target:{" "}
                    <b style={{ color: "var(--text-primary)" }}>
                      {totalUnit === "hours" ? fmtH(tH) : `${Math.round(tH / HPD)}d`}
                    </b>
                  </span>
                )}
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  Allocated:{" "}
                  <b style={{ color: "var(--text-primary)" }}>
                    {totalUnit === "hours" ? fmtH(totalAllocH) : `${Math.round(totalAllocH / HPD)}d`}
                  </b>
                </span>
                {diff !== null && (
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: diff > 0.5 ? "#dc2626" : diff < -0.5 ? "#d97706" : "#059669",
                    }}
                  >
                    {diff > 0.5
                      ? `+${totalUnit === "hours" ? fmtH(diff) : `${Math.round(diff / HPD)}d`} over`
                      : diff < -0.5
                        ? `${totalUnit === "hours" ? fmtH(Math.abs(diff)) : `${Math.round(Math.abs(diff) / HPD)}d`} unallocated`
                        : "✓ Fully allocated"}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <Btn style={{ fontSize: 12, padding: "6px 12px" }} onClick={doSpread}>
                  {tH
                    ? `Spread ${totalUnit === "hours" ? fmtH(tH) : `${Math.round(tH / HPD)}d`} across months`
                    : "Auto-fill working " + totalUnit}
                </Btn>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(148px,1fr))", gap: 8 }}>
                {localMonths.map(({ y, m }) => {
                  const key = pmKey(y, m);
                  const wd = wdInMonth(y, m);
                  const hasOv = hours[key] !== undefined;
                  const stored = hasOv
                    ? hours[key]
                    : impliedSpreadForAlloc[key] !== undefined
                      ? impliedSpreadForAlloc[key]
                      : wd * HPD;
                  const isH = totalUnit === "hours";
                  const displayVal = isH ? Math.round(stored * 10) / 10 : Math.round(stored / HPD);
                  const mb = monthBudgetSlice(
                    { ...pRef.current, startMonth: sm, startYear: sy, endMonth: em, endYear: ey },
                    y,
                    m
                  );
                  const mRev = cor && parseFloat(cor) > 0 ? stored * parseFloat(cor) : null;
                  return (
                    <div
                      key={key}
                      style={{
                        background: hasOv ? "#fffbeb" : "var(--bg-muted)",
                        border: `1.5px solid ${hasOv ? "#fcd34d" : "var(--border)"}`,
                        borderRadius: 8,
                        padding: "10px 12px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                          {MONTHS[m].slice(0, 3)} {y}
                        </span>
                        {hasOv && <span style={{ fontSize: 10, color: "#b45309" }}>edited</span>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <input
                          type="number"
                          min={0}
                          value={displayVal}
                          style={inpSt({ width: 64, padding: "6px 8px", textAlign: "center" })}
                          onChange={(e) => setMonthVal(key, e.target.value)}
                          onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                          onBlur={(e) => (e.target.style.borderColor = "var(--border-input)")}
                        />
                        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
                          {isH ? `h / ${wd * HPD}h` : `d / ${wd}d`}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
                        {isH ? <div>{(stored / HPD).toFixed(1)}d equiv</div> : <div>{stored}h total</div>}
                        {mb && <div>Budget: {fmt$(mb)}</div>}
                        {mRev && <div>Revenue: {fmt$(mRev)}</div>}
                      </div>
                      {hasOv && (
                        <button
                          type="button"
                          onClick={() => clearMonthVal(key)}
                          style={{
                            marginTop: 5,
                            fontSize: 10,
                            color: "var(--text-faint)",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                          }}
                        >
                          ↩ reset
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            <Lbl>Overtime / extra hours (planning note)</Lbl>
            <FocusTxt
              value={overtimeNote}
              placeholder="e.g. Extra shift approved 12 Apr — track overtime here"
              onChange={(e) => {
                setOt(e.target.value);
                sync({ overtimeNote: e.target.value });
              }}
            />
          </div>
          <div>
            <Lbl>Notes</Lbl>
            <FocusTxt
              value={notes}
              placeholder="Any additional notes..."
              onChange={(e) => {
                setNotes(e.target.value);
                sync({ notes: e.target.value });
              }}
            />
          </div>
          <div style={{ paddingTop: 12, borderTop: "1.5px solid var(--border)" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
              <input
                type="checkbox"
                checked={isCompleted}
                onChange={(e) => {
                  setIsCompleted(e.target.checked);
                  sync({ isCompleted: e.target.checked });
                }}
                style={{ width: 18, height: 18, cursor: "pointer" }}
              />
              <span style={{ color: isCompleted ? "#059669" : "var(--text-muted)", fontWeight: 500 }}>Mark project as completed</span>
            </label>
            {isCompleted && (
              <p style={{ fontSize: 11, color: "#059669", margin: "6px 0 0 26px" }}>✓ This project will not appear in active scheduling.</p>
            )}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <Btn onClick={close}>Cancel</Btn>
          <BtnPri onClick={saveProj}>Save project</BtnPri>
        </div>
      </ModalBox>
    </Overlay>
  );
}

function EmployeeModal({
  empMod,
  eRef,
  setEmpMod,
  strengthsCatalog,
  customStrengths,
  setCustomStrengths,
  setEmps,
  showToast,
  saveEmp,
  purgeTagFromSystem,
}) {
  const e0 = eRef.current;
  if (!e0) return null;
  const [name, setName] = useState(e0.name);
  const [role, setRole] = useState(e0.role);
  const [type, setType] = useState(e0.type);
  const [rate, setRate] = useState(e0.rate);
  const [phone, setPhone] = useState(e0.phone);
  const [email, setEmail] = useState(e0.email);
  const [maxH, setMaxH] = useState(e0.maxHoursPerMonth);
  const [avail, setAvail] = useState({ ...e0.availability });
  const [notes, setNotes] = useState(e0.notes);
  const [, rerenderEmpStr] = useState(0);
  const sync = (patch) => Object.assign(eRef.current, patch);
  function applyEmpStrengths(update) {
    const prev = [...(eRef.current.strengths || [])];
    const next = typeof update === "function" ? update(prev) : update;
    const copy = [...next];
    const id = eRef.current?.id;
    const snapshot = prev;
    sync({ strengths: copy });
    rerenderEmpStr((t) => t + 1);
    if (!id) return;
    setEmps((list) => list.map((x) => (x.id === id ? { ...x, strengths: copy } : x)));
    void (async () => {
      const result = await persistEmployeeStrengths(id, copy, { setEmps, showToast });
      if (!result.ok) {
        sync({ strengths: snapshot });
        rerenderEmpStr((t) => t + 1);
        setEmps((list) => list.map((x) => (x.id === id ? { ...x, strengths: snapshot } : x)));
        return;
      }
      if (result.saved && eRef.current?.id === id) {
        sync({ strengths: [...result.saved] });
        rerenderEmpStr((t) => t + 1);
      }
    })();
  }
  const close = () => {
    setEmpMod(null);
    eRef.current = null;
  };
  return (
    <Overlay onClose={close}>
      <ModalBox>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>
            {empMod === "new" ? "New employee" : "Edit employee"}
          </h3>
          <Btn onClick={close}>Cancel</Btn>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Row2>
            <div>
              <Lbl>Full name *</Lbl>
              <FocusInp
                value={name}
                placeholder="e.g. Jane Smith"
                onChange={(e) => {
                  setName(e.target.value);
                  sync({ name: e.target.value });
                }}
              />
            </div>
            <div>
              <Lbl>Role</Lbl>
              <select style={selSt({ width: "100%" })} value={role} onChange={(e) => {
                setRole(e.target.value);
                sync({ role: e.target.value });
              }}>
                {ROLES.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
          </Row2>
          <Row2>
            <div>
              <Lbl>Employment type</Lbl>
              <select style={selSt({ width: "100%" })} value={type} onChange={(e) => {
                setType(e.target.value);
                sync({ type: e.target.value });
              }}>
                {EMP_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <Lbl>Hourly pay rate — cost ($/hr)</Lbl>
              <FocusInp
                type="number"
                value={rate}
                placeholder="e.g. 35"
                onChange={(e) => {
                  setRate(e.target.value);
                  sync({ rate: e.target.value });
                }}
              />
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>
                Internal labour cost for margin calculations. Client billing uses each project&apos;s charge-out rate.
              </div>
            </div>
          </Row2>
          <Row2>
            <div>
              <Lbl>Phone</Lbl>
              <FocusInp
                value={phone}
                placeholder="04xx xxx xxx"
                onChange={(e) => {
                  setPhone(e.target.value);
                  sync({ phone: e.target.value });
                }}
              />
            </div>
            <div>
              <Lbl>Email</Lbl>
              <FocusInp
                value={email}
                placeholder="jane@company.com"
                onChange={(e) => {
                  setEmail(e.target.value);
                  sync({ email: e.target.value });
                }}
              />
            </div>
          </Row2>
          <div>
            <Lbl>Max hours per month</Lbl>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <FocusInp
                type="number"
                value={maxH}
                style={{ width: 110 }}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10) || 160;
                  setMaxH(v);
                  sync({ maxHoursPerMonth: v });
                }}
              />
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{Math.round(maxH / HPD)} days</span>
            </div>
          </div>
          <StrengthTagsPicker
            label="Strengths / skills"
            catalog={strengthsCatalog}
            selected={[...(eRef.current.strengths || [])]}
            onSelectedChange={applyEmpStrengths}
            onPurgeTagGlobally={purgeTagFromSystem}
            ensureCatalogTag={(v) => {
              if (!strengthsCatalog.includes(v)) setCustomStrengths((s) => [...s, v]);
            }}
          />
          <div>
            <Lbl>Weekly availability</Lbl>
            <p style={{ fontSize: 12, color: "var(--text-faint)", margin: "0 0 8px" }}>
              Include <b>Sat</b> (or <b>Sun</b>) if this person can work weekends; project must also run those days.
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {DAYS_SHORT.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    const n = { ...avail, [d]: !avail[d] };
                    setAvail(n);
                    sync({ availability: n });
                  }}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1.5px solid",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 13,
                    fontWeight: 500,
                    background: avail[d] ? "#dcfce7" : "var(--bg-muted)",
                    color: avail[d] ? "#166534" : "var(--text-muted)",
                    borderColor: avail[d] ? "#86efac" : "var(--border)",
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Lbl>Notes</Lbl>
            <FocusTxt
              value={notes}
              placeholder="Any additional notes..."
              onChange={(e) => {
                setNotes(e.target.value);
                sync({ notes: e.target.value });
              }}
            />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <Btn onClick={close}>Cancel</Btn>
          <BtnPri onClick={saveEmp}>Save employee</BtnPri>
        </div>
      </ModalBox>
    </Overlay>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App({ auth }) {
  const [tab,setTab]          = useState("Projects");
  const [projects,setProj]    = useState([]);
  const [employees,setEmps]   = useState([]);
  const [rYear,setRYear]      = useState(NOW.getFullYear());
  const [rMonth,setRMo]       = useState(NOW.getMonth());
  const [assigns,setAssigns]  = useState({});
  const [dayEd,setDayEd]      = useState(null);
  const [projMod,setProjMod]  = useState(null);
  const [empMod,setEmpMod]    = useState(null);
  const [pTick,setPTick]      = useState(0);
  const [eTick,setETick]      = useState(0);
  const [mainNavOpen, setMainNavOpen] = useState(false);
  const [autoGenNoProjectModal, setAutoGenNoProjectModal] = useState(false);
  const [loading,setLoading]  = useState(true);
  const [toast,setToast]      = useState(null);
  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(null),4000); }
  const refreshProjectsFromDb = useCallback(async () => {
    const { data, error } = await supabase.from("projects").select("*");
    if (error) {
      showToast(error.message);
      return;
    }
    if (data) setProj(data.map(rowToProj));
  }, []);
  const [rosterView,setRView] = useState("calendar");
  const [certifications,setCertifications] = useState([]);
  const [shiftRules,setShiftRules] = useState({max_hours_per_day:10,max_hours_per_week:50,overtime_threshold_daily:8,overtime_threshold_weekly:38,min_break_minutes:30});
  const [userProfiles,setUserProfiles] = useState([]);
  const [timesheets,setTimesheets] = useState([]);
  const [openShifts,setOpenShifts] = useState([]);
  const [shiftSwaps,setShiftSwaps] = useState([]);
  const pRef = useRef(null);
  const eRef = useRef(null);

  const LS_CUSTOM_STRENGTHS = "cc-roster-custom-strengths";
  const LS_PURGED_STRENGTHS = "cc-roster-purged-strengths";
  const [customStrengths, setCustomStrengths] = useState([]);
  /** Built-in STRENGTHS hidden after user purges them org-wide (otherwise they’d reappear from code). */
  const [purgedStrengths, setPurgedStrengths] = useState([]);
  useEffect(() => {
    try {
      const raw = typeof localStorage !== "undefined" && localStorage.getItem(LS_CUSTOM_STRENGTHS);
      if (raw) setCustomStrengths(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try {
      const raw = typeof localStorage !== "undefined" && localStorage.getItem(LS_PURGED_STRENGTHS);
      if (raw) setPurgedStrengths(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(LS_CUSTOM_STRENGTHS, JSON.stringify(customStrengths));
    } catch { /* ignore */ }
  }, [customStrengths]);
  useEffect(() => {
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(LS_PURGED_STRENGTHS, JSON.stringify(purgedStrengths));
    } catch { /* ignore */ }
  }, [purgedStrengths]);
  const strengthsCatalog = useMemo(() => {
    const hidden = new Set(purgedStrengths.map((x) => String(x).trim()).filter(Boolean));
    const set = new Set(
      [...STRENGTHS, ...customStrengths.map((s) => String(s).trim()).filter(Boolean)].filter((s) => s && !hidden.has(s))
    );
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [customStrengths, purgedStrengths]);

  const purgeTagFromSystem = useCallback(async (tag) => {
    const t = String(tag).trim();
    if (!t) return;
    const strip = (arr) => (Array.isArray(arr) ? arr.filter((x) => x !== t) : arr);
    try {
      const { data: projs, error: pe } = await supabase.from("projects").select("id, strengths_required");
      if (pe) throw pe;
      const { data: emps, error: ee } = await supabase.from("employees").select("id, strengths");
      if (ee) throw ee;
      let osData = null;
      try {
        const { data, error } = await supabase.from("open_shifts").select("id, required_strengths");
        if (!error) osData = data;
      } catch {
        /* open_shifts may be missing */
      }
      const projUps = (projs || [])
        .filter((row) => (row.strengths_required || []).includes(t))
        .map((row) =>
          supabase
            .from("projects")
            .update({ strengths_required: strip(row.strengths_required) })
            .eq("id", row.id)
            .select("id")
        );
      const empUps = (emps || [])
        .filter((row) => (row.strengths || []).includes(t))
        .map((row) =>
          supabase.from("employees").update({ strengths: strip(row.strengths) }).eq("id", row.id).select("id")
        );
      const shiftUps = (osData || [])
        .filter((row) => (row.required_strengths || []).includes(t))
        .map((row) =>
          supabase
            .from("open_shifts")
            .update({ required_strengths: strip(row.required_strengths) })
            .eq("id", row.id)
            .select("id")
        );
      const all = await Promise.all([...projUps, ...empUps, ...shiftUps]);
      for (const res of all) {
        if (res.error) throw res.error;
      }
      setProj((prev) => prev.map((p) => ({ ...p, strengthsRequired: strip(p.strengthsRequired) })));
      setEmps((prev) => prev.map((e) => ({ ...e, strengths: strip(e.strengths) })));
      setOpenShifts((prev) =>
        prev.map((s) => ({ ...s, required_strengths: strip(s.required_strengths) }))
      );
      setCustomStrengths((s) => s.filter((x) => x !== t));
      if (STRENGTHS.includes(t)) {
        setPurgedStrengths((prev) => (prev.includes(t) ? prev : [...prev, t]));
      }
      if (pRef.current) {
        pRef.current.strengthsRequired = strip(pRef.current.strengthsRequired);
        setPTick((x) => x + 1);
      }
      if (eRef.current) {
        eRef.current.strengths = strip(eRef.current.strengths);
        setETick((x) => x + 1);
      }
      showToast(`“${t}” removed from all projects, employees, and open shifts.`);
    } catch (e) {
      showToast(e?.message || String(e));
    }
  }, [showToast]);

  useEffect(()=>{
    const safetyTimer = setTimeout(() => {
      setLoading(false);
      console.warn("[RosterApp] Initial data load exceeded safety timeout — showing UI anyway.");
    }, 20000);
    (async()=>{
      try {
        const [{data:pd},{data:ed},{data:ad}] = await Promise.all([
          supabase.from('projects').select('*'),
          supabase.from('employees').select('*'),
          supabase.from('assignments').select('*'),
        ]);
        if(pd?.length) {
          const mapped = [];
          for (const r of pd) {
            try { mapped.push(rowToProj(r)); } catch (e) {
              console.error("Project row mapping failed:", r?.id, e);
            }
          }
          setProj(mapped);
        }
        if(ed?.length) setEmps(ed.map(rowToEmp));
        if(ad?.length){
          const a={};
          ad.forEach(r=>{a[`${r.year}-${r.month}-${r.day}-${r.employee_id}`]=r.project_id;});
          setAssigns(a);
        }
      } catch (e) {
        console.error("Initial data load failed:", e);
        showToast("Could not load all data. Check Supabase connection.");
      } finally {
        clearTimeout(safetyTimer);
        setLoading(false);
      }
    })();
    return () => clearTimeout(safetyTimer);
  },[]);

  useEffect(() => {
    (async () => {
      try {
        const [
          { data: certData },
          { data: rulesData },
          { data: tsData },
          { data: osData },
          { data: ssData },
        ] = await Promise.all([
          supabase.from("certifications").select("*").order("expiry_date", { ascending: true }),
          supabase.from("shift_rules").select("*").single(),
          supabase.from("timesheets").select("*").order("date", { ascending: false }),
          supabase.from("open_shifts").select("*").order("date", { ascending: true }),
          supabase.from("shift_swaps").select("*").order("created_at", { ascending: false }),
        ]);
        if (certData) setCertifications(certData);
        if (rulesData) setShiftRules(rulesData);
        if (tsData) setTimesheets(tsData);
        if (osData) setOpenShifts(osData);
        if (ssData) setShiftSwaps(ssData);
      } catch {
        /* tables may not exist until migration applied */
      }
    })();
  }, []);

  const mkProj = useCallback(()=>({
    id:"", name:"", client:"", color:PROJ_COLORS[0], notes:"",
    budget:"", chargeOutRate:"",
    totalInput:"", totalUnit:"days",
    staffMode:"flexible", fixedStaff:"",
    startMonth:String(NOW.getMonth()), startYear:String(NOW.getFullYear()),
    endMonth:String(NOW.getMonth()),   endYear:String(NOW.getFullYear()),
    monthlyHours:{}, isCompleted:false,
    workDays:{ ...DEFAULT_PROJECT_WORK_DAYS },
    overtimeNote:"",
    strengthsRequired: [],
  }),[]);

  const mkEmp = useCallback(()=>({
    id:"", name:"", role:ROLES[3], type:EMP_TYPES[0],
    rate:"", phone:"", email:"", notes:"",
    availability:{Mon:true,Tue:true,Wed:true,Thu:true,Fri:true,Sat:false,Sun:false},
    maxHoursPerMonth:160, strengths:[],
  }),[]);

  function openProjMod(p) {
    pRef.current = p
      ? {
          ...p,
          monthlyHours: { ...p.monthlyHours },
          workDays: mergeWorkDays(p.workDays),
          strengthsRequired: [...(p.strengthsRequired || [])],
        }
      : mkProj();
    setProjMod(p ? p.id : "new");
    setPTick((t) => t + 1);
  }
  function openEmpMod(e)  { eRef.current=e?{...e,strengths:[...e.strengths],availability:{...e.availability}}:mkEmp(); setEmpMod(e?e.id:"new"); setETick(t=>t+1); }

  function saveProj() {
    const p=pRef.current; if(!p||!p.name.trim()) return;
    const s={...p,id:p.id||uid()};
    setProj(prev=>p.id?prev.map(x=>x.id===s.id?s:x):[...prev,s]);
    setProjMod(null); pRef.current=null;
    supabase.from('projects').upsert(projToRow(s)).then(({error})=>{if(error)showToast(error.message);});
  }
  function saveEmp() {
    const e=eRef.current; if(!e||!e.name.trim()) return;
    const s={...e,id:e.id||uid()};
    setEmps(prev=>e.id?prev.map(x=>x.id===s.id?s:x):[...prev,s]);
    setEmpMod(null); eRef.current=null;
    supabase.from('employees').upsert(empToRow(s)).then(({error})=>{if(error)showToast(error.message);});
  }

  // assignments
  const aKey=(y,m,d,eId)=>`${y}-${m}-${d}-${eId}`;
  const getA=(y,m,d,eId)=>assigns[aKey(y,m,d,eId)];
  function setA(y,m,d,eId,pid) {
    if (pid !== null) {
      const emp = employees.find((x) => x.id === eId);
      if (emp && isSiteSupervisor(emp)) {
        const clash = employees.some(
          (o) =>
            o.id !== eId &&
            isSiteSupervisor(o) &&
            getA(y, m, d, o.id) === pid
        );
        if (clash) {
          showToast("Only one site supervisor per project per day.");
          return;
        }
      }
    }
    setAssigns(prev=>{const n={...prev};if(pid===null)delete n[aKey(y,m,d,eId)];else n[aKey(y,m,d,eId)]=pid;return n;});
    if(pid===null) supabase.from('assignments').delete().match({year:y,month:m,day:d,employee_id:eId}).then(({error})=>{if(error)showToast(error.message);});
    else supabase.from('assignments').upsert({year:y,month:m,day:d,employee_id:eId,project_id:pid}).then(({error})=>{if(error)showToast(error.message);});
  }

  const calDays=useMemo(()=>Array.from({length:daysInMo(rYear,rMonth)},(_,i)=>i+1),[rYear,rMonth]);
  const linkedEmployeeId = useMemo(() => {
    const email = auth?.user?.email?.toLowerCase();
    if (!email) return employees[0]?.id || "";
    const match = employees.find((e) => (e.email || "").toLowerCase() === email);
    return match?.id || employees[0]?.id || "";
  }, [auth?.user?.email, employees]);
  const assignedOnDay=(y,m,d)=>employees.filter(e=>getA(y,m,d,e.id));
  const empMonthH=eId=>calDays.reduce((h,d)=>h+(getA(rYear,rMonth,d,eId)?HPD:0),0);
  const projManH=pId=>calDays.reduce((h,d)=>h+employees.filter(e=>getA(rYear,rMonth,d,e.id)===pId).length*HPD,0);
  // Calendar-aware capacity: available working days this month × 8h, capped by contract max
  const empCalCap=(e)=>{
    let avDays=0;
    for(let d=1;d<=daysInMo(rYear,rMonth);d++){
      if(e.availability[dlabel(rYear,rMonth,d)]) avDays++;
    }
    return Math.min(e.maxHoursPerMonth, avDays*HPD);
  };
  const totalCapH=()=>employees.reduce((a,e)=>a+empCalCap(e),0);
  const scheduledH=()=>calDays.reduce((h,d)=>h+employees.filter(e=>getA(rYear,rMonth,d,e.id)).length*HPD,0);
  const labourCostM=pId=>employees.reduce((acc,e)=>{const days=calDays.filter(d=>getA(rYear,rMonth,d,e.id)===pId).length;return acc+days*HPD*(parseFloat(e.rate)||0);},0);
  const revenueM=p=>p.chargeOutRate?projManH(p.id)*parseFloat(p.chargeOutRate):null;
  const projColor=id=>projects.find(p=>p.id===id)?.color||"#64748b";
  const projNameOf=id=>projects.find(p=>p.id===id)?.name||"";

  function clearMonth() {
    const pre=`${rYear}-${rMonth}-`;
    setAssigns(p=>{const n={...p};Object.keys(n).forEach(k=>{if(k.startsWith(pre))delete n[k];});return n;});
    supabase.from('assignments').delete().eq('year',rYear).eq('month',rMonth).then(({error})=>{if(error)showToast(error.message);});
  }

  // Bulk-assign until monthly cap (allocation ∩ budget) — same ceiling as auto-generate
  function bulkAssignEmpToProj(eId,pid) {
    const e=employees.find(x=>x.id===eId);
    const proj=projects.find(x=>x.id===pid);
    if(!e||!proj) return;
    const targetH=monthlyTargetHoursCapped(proj,rYear,rMonth);
    let usedH=calDays.reduce((h,d)=>h+(getA(rYear,rMonth,d,eId)===pid?HPD:0),0);
    const schedProjects=projects.filter(p=>{
      if(p.isCompleted) return false;
      const months=getProjectMonths(p);
      return months.some(({y,m})=>y===rYear&&m===rMonth);
    });
    const newKeys=[],rows=[];
    calDays.forEach(d=>{
      const rem=targetH-usedH;
      if(rem<=0) return;
      const add=Math.min(HPD,rem);
      const dl=dlabel(rYear,rMonth,d);
      if(!dayUsedForScheduling(schedProjects,rYear,rMonth,d)) return;
      if(!projectRunsOnDay(proj,dl)) return;
      if(!e.availability[dl]||getA(rYear,rMonth,d,eId)) return;
      if(isSiteSupervisor(e)){
        const clash=employees.some(o=>o.id!==eId&&isSiteSupervisor(o)&&getA(rYear,rMonth,d,o.id)===pid);
        if(clash) return;
      }
      newKeys.push([aKey(rYear,rMonth,d,eId),pid]);
      rows.push({year:rYear,month:rMonth,day:d,employee_id:eId,project_id:pid});
      usedH+=add;
    });
    if(!newKeys.length) return;
    setAssigns(prev=>{const n={...prev};newKeys.forEach(([k,p])=>{n[k]=p;});return n;});
    supabase.from('assignments').upsert(rows).then(({error})=>{if(error)showToast(error.message);});
  }

  function autoGenerate() {
    if (projects.length === 0) {
      setAutoGenNoProjectModal(true);
      return;
    }
    if(!employees.length){
      showToast("Add employees before auto-generating.");
      return;
    }
    const pre=`${rYear}-${rMonth}-`;
    const newA={};
    Object.keys(assigns).forEach(k=>{if(!k.startsWith(pre))newA[k]=assigns[k];});
    const targets={},filled={},empH={};
    const schedProjects=projects.filter(p=>{
      if(p.isCompleted) return false;
      const months=getProjectMonths(p);
      return months.some(({y,m})=>y===rYear&&m===rMonth);
    });
    if(!schedProjects.length){
      showToast("No active projects in this month — check start/end dates or completed flag.");
      return;
    }
    schedProjects.forEach(p=>{
      targets[p.id]=monthlyTargetHoursCapped(p,rYear,rMonth);
      filled[p.id]=0;
    });
    if(!schedProjects.some(p=>targets[p.id]>0)){
      showToast("Monthly target is 0h for every project — set total allocation, monthly hours, budget, or charge-out rate.");
      return;
    }
    employees.forEach(e=>{empH[e.id]=0;});
    let placedSlots=0;
    const skillMatch=(e,p)=>p.strengthsRequired?.length
      ?e.strengths.filter(s=>p.strengthsRequired.includes(s)).length:0;
    const supOnProject=(map,d,pid)=>
      employees.filter(o=>isSiteSupervisor(o)&&map[aKey(rYear,rMonth,d,o.id)]===pid).length;
    const canPlaceSupervisor=(map,d,e,pid)=>{
      if(!isSiteSupervisor(e)) return true;
      return supOnProject(map,d,pid)<1;
    };
    calDays.forEach(d=>{
      if(!dayUsedForScheduling(schedProjects,rYear,rMonth,d)) return;
      const dl=dlabel(rYear,rMonth,d);
      schedProjects.filter(p=>p.staffMode==="fixed"&&p.fixedStaff).forEach(p=>{
        if(!projectRunsOnDay(p,dl)) return;
        if(targets[p.id]-filled[p.id]<=0) return;
        const need=parseInt(p.fixedStaff,10)||0;
        const already=employees.filter(e=>newA[aKey(rYear,rMonth,d,e.id)]===p.id).length;
        const toAdd=Math.max(0,need-already);
        if(toAdd<=0) return;
        const avail=employees
          .filter(e=>{
            const remT=targets[p.id]-filled[p.id];
            const add=Math.min(HPD,remT);
            return e.availability[dl]&&!newA[aKey(rYear,rMonth,d,e.id)]&&empH[e.id]+add<=e.maxHoursPerMonth&&canPlaceSupervisor(newA,d,e,p.id);
          })
          .sort((a,b)=>skillMatch(b,p)-skillMatch(a,p));
        let added=0;
        for(const e of avail){
          if(added>=toAdd) break;
          const rem=targets[p.id]-filled[p.id];
          if(rem<=0) break;
          const add=Math.min(HPD,rem);
          if(empH[e.id]+add>e.maxHoursPerMonth) continue;
          newA[aKey(rYear,rMonth,d,e.id)]=p.id;
          filled[p.id]+=add;
          empH[e.id]+=add;
          placedSlots++;
          added++;
        }
      });
      employees
        .filter(e=>e.availability[dl]&&!newA[aKey(rYear,rMonth,d,e.id)]&&empH[e.id]+HPD<=e.maxHoursPerMonth)
        .forEach(e=>{
          let bestP=null,bestScore=-Infinity;
          schedProjects.filter(p=>p.staffMode!=="fixed").forEach(p=>{
            if(!projectRunsOnDay(p,dl)) return;
            const rem=targets[p.id]-filled[p.id];
            if(rem<=0) return;
            if(!canPlaceSupervisor(newA,d,e,p.id)) return;
            const score=skillMatch(e,p)*1000+rem;
            if(score>bestScore){bestScore=score;bestP=p;}
          });
          if(bestP){
            const rem=targets[bestP.id]-filled[bestP.id];
            const add=Math.min(HPD,rem);
            if(add<=0||empH[e.id]+add>e.maxHoursPerMonth) return;
            newA[aKey(rYear,rMonth,d,e.id)]=bestP.id;
            filled[bestP.id]+=add;
            empH[e.id]+=add;
            placedSlots++;
          }
        });
    });
    const stillNeed=schedProjects.some(p=>filled[p.id]<targets[p.id]-0.01);
    if(placedSlots===0&&stillNeed){
      showToast("No assignments placed — check project work days (Mon–Sun), staff availability, monthly hour targets, and at most one site supervisor per project per day.");
    }
    setAssigns(newA);
    const rows=Object.entries(newA)
      .filter(([k])=>k.startsWith(`${rYear}-${rMonth}-`))
      .map(([k,pid])=>{const[y,m,d,eId]=k.split('-');return{year:+y,month:+m,day:+d,employee_id:eId,project_id:pid};});
    supabase.from('assignments').delete().eq('year',rYear).eq('month',rMonth)
      .then(()=>rows.length&&supabase.from('assignments').insert(rows).then(({error})=>{if(error)showToast(error.message);}));
  }

  const MonthSel=({val,set})=><select value={val} onChange={e=>set(+e.target.value)} style={selSt({width:"auto"})}>{MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}</select>;
  const YearSel=({val,set})=><select value={val} onChange={e=>set(+e.target.value)} style={selSt({width:"auto"})}>{YEARS.map(y=><option key={y}>{y}</option>)}</select>;


  // ── DAY EDITOR ───────────────────────────────────────────────────────────────
  function DayEditorModal({day}) {
    const dl=dlabel(rYear,rMonth,day);
    const activeProjs=projects.filter(p=>!p.isCompleted);
    const assigned =employees.filter(emp=> getA(rYear,rMonth,day,emp.id));
    const unassigned=employees.filter(emp=>!getA(rYear,rMonth,day,emp.id));
    const available =unassigned.filter(emp=> emp.availability[dl]);
    const unavail   =unassigned.filter(emp=>!emp.availability[dl]);
    const defaultPid=activeProjs[0]?.id||"";
    const [selProj,setSelProj]=useState(()=>{
      const init={};
      unassigned.forEach(emp=>{init[emp.id]=defaultPid;});
      return init;
    });
    const skillMatch=(emp,p)=>{
      const total=p.strengthsRequired?.length||0;
      if(!total) return null;
      return {n:emp.strengths.filter(s=>p.strengthsRequired.includes(s)).length,total};
    };
    return (
      <Overlay onClose={()=>setDayEd(null)}>
        <ModalBox maxWidth={560}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div>
              <div style={{fontSize:18,fontWeight:700,color:"var(--text-primary)"}}>{dl} {day} {MONTHS[rMonth]} {rYear}</div>
              <div style={{fontSize:13,color:"var(--text-muted)",marginTop:2}}>{assigned.length} staff on site</div>
            </div>
            <Btn onClick={()=>setDayEd(null)}>Close</Btn>
          </div>
          {activeProjs.length>0&&(
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
              {activeProjs.map(p=>{
                const count=assigned.filter(emp=>getA(rYear,rMonth,day,emp.id)===p.id).length;
                const fixed=p.staffMode==="fixed"&&p.fixedStaff?parseInt(p.fixedStaff):null;
                const ok=fixed===null||count===fixed;
                const bg=fixed===null?"var(--bg-muted)":ok?"#dcfce7":"#fee2e2";
                const col=fixed===null?"var(--text-muted)":ok?"#166534":"#dc2626";
                const border=ok?(fixed===null?"var(--border)":"#86efac"):"#fca5a5";
                return (
                  <div key={p.id} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:99,background:bg,border:`1.5px solid ${border}`}}>
                    <span style={{width:7,height:7,borderRadius:"50%",background:p.color,flexShrink:0}}/>
                    <span style={{fontSize:12,fontWeight:500,color:col}}>
                      {p.name}: {count}{fixed!==null?` / ${fixed} required`:" assigned"}
                      {fixed!==null&&!ok&&(count<fixed?` — need ${fixed-count} more`:` — ${count-fixed} too many`)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {activeProjs.some((p)=>{
            const sups=assigned.filter(e=>isSiteSupervisor(e)&&getA(rYear,rMonth,day,e.id)===p.id);
            return sups.length>1;
          })&&(
            <div style={{marginBottom:14,padding:"10px 12px",borderRadius:8,background:"#fff7ed",border:"1.5px solid #fdba74",fontSize:13,color:"#9a3412"}}>
              <strong>Site supervisor rule:</strong> only one <b>Site Supervisor</b> should be on the same project (site) per day. Adjust assignments so each active site has at most one supervisor.
            </div>
          )}
          <SecTitle>On site ({assigned.length})</SecTitle>
          {assigned.length===0&&<p style={{fontSize:13,color:"var(--text-faint)",marginBottom:12}}>No one assigned — add staff below.</p>}
          {assigned.map(emp=>{
            const pid=getA(rYear,rMonth,day,emp.id);
            return (
              <div key={emp.id} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",border:"1.5px solid var(--border)",borderRadius:10,background:"var(--bg-surface)",marginBottom:6}}>
                <Avatar name={emp.name} color={projColor(pid)}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:500,color:"var(--text-primary)"}}>{emp.name}</div>
                  <div style={{fontSize:12,color:"var(--text-muted)"}}>{emp.role}</div>
                </div>
                <select value={pid} onChange={ev=>setA(rYear,rMonth,day,emp.id,ev.target.value)} style={selSt({fontSize:13,padding:"6px 10px"})}>
                  {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button onClick={()=>setA(rYear,rMonth,day,emp.id,null)} style={{border:"none",background:"none",cursor:"pointer",color:"var(--text-faint)",fontSize:20,lineHeight:1,padding:"0 4px"}}>✕</button>
              </div>
            );
          })}
          {available.length>0&&(
            <div style={{marginTop:16}}>
              <SecTitle>Available to add ({available.length})</SecTitle>
              {available.map(emp=>{
                const chosenPid=selProj[emp.id]||defaultPid;
                const chosenProj=activeProjs.find(p=>p.id===chosenPid);
                const sm=chosenProj?skillMatch(emp,chosenProj):null;
                const smColor=sm?(sm.n===sm.total?"#059669":sm.n>0?"#d97706":"#dc2626"):null;
                return (
                  <div key={emp.id} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",border:"1.5px solid var(--border)",borderRadius:10,background:"var(--bg-card)",marginBottom:6}}>
                    <Avatar name={emp.name}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:500,color:"var(--text-primary)"}}>{emp.name}</div>
                      <div style={{fontSize:12,color:"var(--text-muted)"}}>{emp.role}{emp.rate?` · $${emp.rate}/hr`:""}</div>
                    </div>
                    <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0}}>
                      <select
                        value={chosenPid}
                        onChange={ev=>setSelProj(prev=>({...prev,[emp.id]:ev.target.value}))}
                        style={selSt({fontSize:12,padding:"5px 8px",minWidth:0,maxWidth:140})}>
                        {activeProjs.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      {sm&&<span style={{fontSize:11,fontWeight:600,color:smColor,whiteSpace:"nowrap"}}>{sm.n}/{sm.total}★</span>}
                      <button
                        title={`Assign ${emp.name} to ${chosenProj?.name} today`}
                        onClick={()=>chosenPid&&setA(rYear,rMonth,day,emp.id,chosenPid)}
                        disabled={!chosenPid}
                        style={{padding:"5px 10px",borderRadius:8,border:`1.5px solid ${chosenProj?.color||"var(--border)"}`,background:`${chosenProj?.color||"#888"}14`,color:chosenProj?.color||"var(--text-secondary)",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                        + Day
                      </button>
                      <button
                        title={`Assign ${emp.name} to ${chosenProj?.name} for all available weekdays this month`}
                        onClick={()=>chosenPid&&bulkAssignEmpToProj(emp.id,chosenPid)}
                        disabled={!chosenPid}
                        style={{padding:"5px 8px",borderRadius:8,border:"1.5px solid var(--border)",background:"var(--bg-muted)",color:"var(--text-secondary)",fontSize:11,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",fontWeight:500}}>
                        + Month
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {unavail.length>0&&(
            <div style={{marginTop:16}}>
              <SecTitle>Off today ({unavail.length})</SecTitle>
              {unavail.map(emp=>(
                <div key={emp.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",border:"1.5px solid #fecaca",borderRadius:10,background:"#fff5f5",marginBottom:6,opacity:0.75}}>
                  <Avatar name={emp.name} color="#d1d5db"/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:500,color:"#9ca3af"}}>{emp.name}</div>
                    <div style={{fontSize:11,color:"#f87171"}}>Not available {dl}s · {emp.role}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ModalBox>
      </Overlay>
    );
  }

  // ── PROJECTS TAB ─────────────────────────────────────────────────────────────
  function ProjectsTab() {
    const [projectToDelete, setProjectToDelete] = useState(null);
    const active=projects.filter(p=>!p.isCompleted);
    const completed=projects.filter(p=>p.isCompleted);
    function runDeleteProject() {
      if (!projectToDelete) return;
      const p = projectToDelete;
      setProjectToDelete(null);
      setProj(prev=>prev.filter(x=>x.id!==p.id));
      supabase.from('projects').delete().eq('id',p.id).then(({error})=>{if(error)showToast(error.message);});
    }
    return (
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h3 style={{margin:0,fontSize:16,fontWeight:600,color:"var(--text-primary)"}}>Projects <span style={{fontWeight:400,color:"var(--text-muted)"}}>({active.length}{completed.length>0?`+${completed.length} completed`:""})</span></h3>
          <BtnPri onClick={()=>openProjMod(null)}>+ Add project</BtnPri>
        </div>
        {projects.length===0&&<Empty icon="🌿" title="No projects yet" sub='Click "Add project" to get started'/>}
        {active.length===0&&completed.length>0&&<p style={{fontSize:13,color:"var(--text-faint)",marginBottom:16}}>All projects completed! 🎉</p>}
        {active.map(p=>{
          const months=getProjectMonths(p);
          const budH=totalBudgetHours(p);
          const tH=totalInputHours(p);
          const totalAllocH=months.reduce((a,{y,m})=>a+monthlyTargetHoursCapped(p,y,m),0);
          return (
            <div key={p.id} style={cardSt({borderLeft:`4px solid ${p.color}`})}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:16,fontWeight:600,color:"var(--text-primary)"}}>{p.name}</div>
                  {p.client&&<div style={{fontSize:13,color:"var(--text-muted)",marginTop:2}}>{p.client}</div>}
                  <div style={{marginTop:8,display:"flex",gap:6,flexWrap:"wrap"}}>
                    {p.budget&&<Tag bg="#eff6ff" col="#1d4ed8">Budget: {fmt$(p.budget)}</Tag>}
                    {p.chargeOutRate&&<Tag bg="#fef9c3" col="#713f12">Charge-out: ${p.chargeOutRate}/hr</Tag>}
                    {tH&&<Tag bg="#ecfdf5" col="#065f46">Allocation: {p.totalUnit==="hours"?fmtH(tH):`${Math.round(tH/HPD)}d`}</Tag>}
                    {budH&&!tH&&<Tag bg="#ecfdf5" col="#065f46">Budget: {Math.round(budH/HPD)}d ({Math.round(budH)}h)</Tag>}
                    {months.length>0&&<Tag bg="#fef3c7" col="#92400e">{MONTHS[+p.startMonth].slice(0,3)} {p.startYear} – {MONTHS[+p.endMonth].slice(0,3)} {p.endYear}</Tag>}
                    {p.staffMode==="fixed"&&p.fixedStaff?<Tag bg="#eff6ff" col="#1d4ed8">Fixed: {p.fixedStaff} staff/day</Tag>:<Tag bg="var(--bg-muted)" col="var(--text-muted)">Flexible staffing</Tag>}
                  </div>
                  {p.strengthsRequired?.length>0&&<div style={{marginTop:6,display:"flex",gap:4,flexWrap:"wrap"}}>{p.strengthsRequired.map(s=><Tag key={s} bg="#ecfdf5" col="#065f46">{s}</Tag>)}</div>}
                  {months.length>0&&(
                    <div style={{marginTop:8,display:"flex",gap:4,flexWrap:"wrap"}}>
                      {months.map(({y,m})=>{
                        const h=monthlyTargetHoursCapped(p,y,m);
                        const mb=monthBudgetSlice(p,y,m);
                        const display=p.totalUnit==="hours"?fmtH(h):`${Math.round(h/HPD)}d`;
                        return <span key={pmKey(y,m)} style={{fontSize:12,padding:"3px 8px",borderRadius:6,background:"var(--bg-muted)",border:"1px solid var(--border)",color:"var(--text-secondary)"}}>{MONTHS[m].slice(0,3)} {y}: <b style={{color:"var(--text-primary)"}}>{display}</b>{mb?` · ${fmt$(mb)}`:""}</span>;
                      })}
                    </div>
                  )}
                  {months.length>0&&tH&&(
                    <div style={{marginTop:6,fontSize:12,fontWeight:500,color:totalAllocH>tH+0.5?"#dc2626":totalAllocH<tH-0.5?"#d97706":"#059669"}}>
                      Allocated: {p.totalUnit==="hours"?fmtH(totalAllocH):`${Math.round(totalAllocH/HPD)}d`} / {p.totalUnit==="hours"?fmtH(tH):`${Math.round(tH/HPD)}d`} target
                      {totalAllocH>tH+0.5?" — over":totalAllocH<tH-0.5?" — under":" ✓"}
                    </div>
                  )}
                  {p.notes&&<div style={{fontSize:13,color:"var(--text-muted)",marginTop:8}}>{p.notes}</div>}
                </div>
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  <Btn onClick={()=>openProjMod(p)}>Edit</Btn>
                  <BtnDanger onClick={()=>setProjectToDelete(p)}>Delete</BtnDanger>
                </div>
              </div>
            </div>
          );
        })}
        {completed.length>0&&(
          <div style={{marginTop:20,paddingTop:16,borderTop:"2px solid var(--border)"}}>
            <h4 style={{margin:"0 0 12px",fontSize:14,fontWeight:600,color:"var(--text-muted)"}}>✓ Completed ({completed.length})</h4>
            {completed.map(p=>(
              <div key={p.id} style={cardSt({opacity:0.7,borderLeft:`4px solid ${p.color}`})}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:15,fontWeight:600,color:"var(--text-muted)",textDecoration:"line-through"}}>{p.name}</div>
                    {p.client&&<div style={{fontSize:12,color:"var(--text-faint)",marginTop:2}}>{p.client}</div>}
                  </div>
                  <div style={{display:"flex",gap:6,flexShrink:0}}>
                    <Btn onClick={()=>openProjMod(p)}>Edit</Btn>
                    <BtnDanger onClick={()=>setProjectToDelete(p)}>Delete</BtnDanger>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <ConfirmModal
          open={!!projectToDelete}
          title="Delete project?"
          message={projectToDelete ? `Delete "${projectToDelete.name}"? This cannot be undone.` : ""}
          onCancel={()=>setProjectToDelete(null)}
          onConfirm={runDeleteProject}
        />
      </div>
    );
  }

  // ── EMPLOYEES TAB ────────────────────────────────────────────────────────────
  function EmployeesTab() {
    const [employeeToDelete, setEmployeeToDelete] = useState(null);
    function runDeleteEmployee() {
      if (!employeeToDelete) return;
      const e = employeeToDelete;
      setEmployeeToDelete(null);
      setEmps(prev=>prev.filter(x=>x.id!==e.id));
      supabase.from('employees').delete().eq('id',e.id).then(({error})=>{if(error)showToast(error.message);});
    }
    return (
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h3 style={{margin:0,fontSize:16,fontWeight:600,color:"var(--text-primary)"}}>Employees <span style={{fontWeight:400,color:"var(--text-muted)"}}>({employees.length})</span></h3>
          <BtnPri onClick={()=>openEmpMod(null)}>+ Add employee</BtnPri>
        </div>
        {employees.length===0&&<Empty icon="👷" title="No employees yet" sub='Click "Add employee" to get started'/>}
        {employees.map(e=>(
          <div key={e.id} style={cardSt()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
              <div style={{display:"flex",gap:12,alignItems:"flex-start",flex:1}}>
                <Avatar name={e.name} color="var(--accent)"/>
                <div>
                  <div style={{fontSize:15,fontWeight:600,color:"var(--text-primary)"}}>{e.name}</div>
                  <div style={{marginTop:5,display:"flex",gap:5,flexWrap:"wrap"}}>
                    <Tag bg="#eef2ff" col="#3730a3">{e.type}</Tag>
                    <Tag bg="#f0f9ff" col="#075985">{e.role}</Tag>
                    {e.rate&&<Tag bg="#ecfdf5" col="#065f46">${e.rate}/hr</Tag>}
                    <Tag bg="#fef9c3" col="#713f12">{e.maxHoursPerMonth}h/mo · {Math.round(e.maxHoursPerMonth/HPD)}d</Tag>
                  </div>
                  {e.strengths?.length>0&&<div style={{marginTop:6,display:"flex",gap:4,flexWrap:"wrap"}}>{e.strengths.map(s=><Tag key={s} bg="#ecfdf5" col="#065f46">{s}</Tag>)}</div>}
                  <div style={{marginTop:7,display:"flex",gap:4,flexWrap:"wrap"}}>
                    {DAYS_SHORT.map(d=><span key={d} style={{fontSize:11,padding:"2px 6px",borderRadius:4,background:e.availability[d]?"#dcfce7":"var(--bg-muted)",color:e.availability[d]?"#166534":"var(--text-faint)",fontWeight:e.availability[d]?500:400}}>{d}</span>)}
                  </div>
                  {e.notes&&<div style={{fontSize:13,color:"var(--text-muted)",marginTop:6}}>{e.notes}</div>}
                </div>
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                <Btn onClick={()=>openEmpMod(e)}>Edit</Btn>
                <BtnDanger onClick={()=>setEmployeeToDelete(e)}>Delete</BtnDanger>
              </div>
            </div>
          </div>
        ))}
        <ConfirmModal
          open={!!employeeToDelete}
          title="Delete employee?"
          message={employeeToDelete ? `Delete "${employeeToDelete.name}"? This cannot be undone.` : ""}
          onCancel={()=>setEmployeeToDelete(null)}
          onConfirm={runDeleteEmployee}
        />
      </div>
    );
  }

  // ── ROSTER TAB ───────────────────────────────────────────────────────────────
  function RosterTab() {
    const [clearMonthOpen, setClearMonthOpen] = useState(false);
    const activeProjects=projects.filter(p=>!p.isCompleted);
    const firstDow=(dowOf(rYear,rMonth,1)+6)%7;
    const cells=[];
    for(let i=0;i<firstDow;i++) cells.push(null);
    for(let d=1;d<=daysInMo(rYear,rMonth);d++) cells.push(d);
    while(cells.length%7!==0) cells.push(null);
    const weeks=[];
    for(let i=0;i<cells.length;i+=7) weeks.push(cells.slice(i,i+7));
    return (
      <div>
        <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12,flexWrap:"wrap"}}>
          <MonthSel val={rMonth} set={setRMo}/>
          <YearSel  val={rYear}  set={setRYear}/>
          <BtnPri onClick={autoGenerate}>Auto-generate</BtnPri>
          <Btn onClick={()=>setClearMonthOpen(true)}>Clear month</Btn>
          <div style={{marginLeft:"auto",display:"flex",border:"1.5px solid var(--border-input)",borderRadius:8,overflow:"hidden"}}>
            {[["calendar","Calendar"],["employees","By employee"]].map(([v,label])=>(
              <button key={v} type="button" onClick={()=>setRView(v)}
                style={{padding:"8px 14px",border:"none",fontFamily:"inherit",fontSize:13,fontWeight:500,cursor:"pointer",background:rosterView===v?"var(--accent)":"var(--bg-card)",color:rosterView===v?"var(--on-accent)":"var(--text-secondary)",whiteSpace:"nowrap"}}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {activeProjects.length>0&&(
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
            {activeProjects.map(p=>{
              const target=monthlyTargetHoursCapped(p,rYear,rMonth);
              const actual=projManH(p.id);
              const pct=target>0?Math.round(actual/target*100):0;
              const display=p.totalUnit==="hours"?`${fmtH(actual)}/${fmtH(target)}`:`${Math.round(actual/HPD)}d/${Math.round(target/HPD)}d`;
              return (
                <div key={p.id} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:99,background:`${p.color}14`,border:`1.5px solid ${p.color}44`}}>
                  <span style={{width:8,height:8,borderRadius:"50%",background:p.color,display:"inline-block"}}/>
                  <span style={{fontSize:13,color:p.color,fontWeight:500}}>{p.name}: {display} ({pct}%)</span>
                </div>
              );
            })}
          </div>
        )}
        {(activeProjects.length===0||employees.length===0)&&<div style={{textAlign:"center",padding:32,border:"2px dashed var(--border)",borderRadius:12,color:"var(--text-faint)",fontSize:14}}>Add projects and employees first to start building the roster.</div>}
        {activeProjects.length>0&&employees.length>0&&rosterView==="calendar"&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:4}}>
              {DAYS_SHORT.map(d=><div key={d} style={{fontSize:12,fontWeight:600,textAlign:"center",color:"var(--text-muted)",padding:"4px 0"}}>{d}</div>)}
            </div>
            {weeks.map((week,wi)=>(
              <div key={wi} style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:4}}>
                {week.map((day,di)=>{
                  if(!day) return <div key={di}/>;
                  const wknd=isWknd(rYear,rMonth,day);
                  const onSite=assignedOnDay(rYear,rMonth,day);
                  const byProj={};
                  onSite.forEach(e=>{ const pid=getA(rYear,rMonth,day,e.id); byProj[pid]=(byProj[pid]||0)+1; });
                  return (
                    <div key={day}
                      onClick={()=>setDayEd(day)}
                      onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--accent-muted)";e.currentTarget.style.boxShadow="0 0 0 3px var(--accent-soft)";}}
                      onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.boxShadow="none";}}
                      style={{border:"1.5px solid var(--border)",borderRadius:10,padding:"6px 7px",minHeight:72,background:wknd?"var(--bg-muted)":"var(--bg-card)",cursor:"pointer",transition:"border-color 0.12s,box-shadow 0.12s",opacity:wknd?0.92:1}}>
                      <div style={{fontSize:12,fontWeight:600,color:wknd?"var(--text-faint)":"var(--text-secondary)",marginBottom:4}}>{day}</div>
                      {Object.entries(byProj).map(([pid,count])=>(
                        <div key={pid} style={{display:"flex",alignItems:"center",gap:3,marginBottom:2}}>
                          <span style={{width:7,height:7,borderRadius:"50%",background:projColor(pid),flexShrink:0}}/>
                          <span style={{fontSize:10,color:"var(--text-secondary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{count} · {projNameOf(pid).slice(0,9)}{projNameOf(pid).length>9?"…":""}</span>
                        </div>
                      ))}
                      {Object.keys(byProj).length===0&&<span style={{fontSize:10,color:"var(--border-input)"}}>Tap to add</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
        {activeProjects.length>0&&employees.length>0&&rosterView==="employees"&&(
          <div style={{overflowX:"auto"}}>
            <table style={{borderCollapse:"collapse",fontSize:12,width:"100%"}}>
              <thead>
                <tr>
                  <th style={{textAlign:"left",padding:"6px 12px",fontWeight:600,color:"var(--text-muted)",borderBottom:"1.5px solid var(--border)",minWidth:140,position:"sticky",left:0,background:"var(--bg-card)",zIndex:1}}>Employee</th>
                  {calDays.map(d=>{
                    const wknd=isWknd(rYear,rMonth,d);
                    return (
                      <th key={d} style={{padding:"3px 1px",textAlign:"center",color:wknd?"var(--border-input)":"var(--text-muted)",fontWeight:500,borderBottom:"1.5px solid var(--border)",minWidth:28}}>
                        <div style={{fontSize:11}}>{d}</div>
                        <div style={{fontSize:9,marginTop:1}}>{dlabel(rYear,rMonth,d).slice(0,1)}</div>
                      </th>
                    );
                  })}
                  <th style={{padding:"6px 10px",textAlign:"right",fontWeight:600,color:"var(--text-muted)",borderBottom:"1.5px solid var(--border)",whiteSpace:"nowrap",minWidth:80}}>Scheduled</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(e=>{
                  const sch=empMonthH(e.id);
                  const pct=e.maxHoursPerMonth>0?Math.round(sch/e.maxHoursPerMonth*100):0;
                  return (
                    <tr key={e.id} style={{borderBottom:"1px solid var(--bg-muted)"}}>
                      <td style={{padding:"8px 12px",fontWeight:500,color:"var(--text-primary)",fontSize:13,whiteSpace:"nowrap",position:"sticky",left:0,background:"var(--bg-card)",zIndex:1}}>
                        <div>{e.name}</div>
                        <div style={{fontSize:11,color:"var(--text-faint)",fontWeight:400}}>{e.role}</div>
                      </td>
                      {calDays.map(d=>{
                        const wknd=isWknd(rYear,rMonth,d);
                        const pid=getA(rYear,rMonth,d,e.id);
                        const dl2=dlabel(rYear,rMonth,d);
                        const avail=e.availability[dl2];
                        return (
                          <td key={d}
                            onClick={()=>setDayEd(d)}
                            title={pid?`${e.name} → ${projNameOf(pid)}`:undefined}
                            style={{padding:"3px 1px",textAlign:"center",background:wknd?"var(--bg-muted)":pid?projColor(pid)+"28":"var(--bg-card)",cursor:"pointer",borderLeft:"1px solid var(--bg-muted)",opacity:wknd?0.9:1}}>
                            {pid&&<span style={{display:"block",width:10,height:10,borderRadius:"50%",background:projColor(pid),margin:"0 auto"}}/>}
                            {!pid&&!wknd&&!avail&&<span style={{color:"var(--border)",fontSize:9}}>–</span>}
                          </td>
                        );
                      })}
                      <td style={{padding:"8px 10px",textAlign:"right",whiteSpace:"nowrap"}}>
                        <span style={{fontSize:12,fontWeight:600,color:pct>=100?"#dc2626":pct>=80?"#d97706":"var(--text-secondary)"}}>{Math.round(sch/HPD)}d</span>
                        <span style={{fontSize:11,color:"var(--text-faint)"}}> / {Math.round(e.maxHoursPerMonth/HPD)}d</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <ConfirmModal
          open={clearMonthOpen}
          title="Clear month?"
          message={`Clear all assignments for ${MONTHS[rMonth]} ${rYear}? This cannot be undone.`}
          confirmLabel="Clear month"
          onCancel={()=>setClearMonthOpen(false)}
          onConfirm={()=>{ setClearMonthOpen(false); clearMonth(); }}
        />
      </div>
    );
  }

  // ── CAPACITY TAB ─────────────────────────────────────────────────────────────
  function CapacityTab() {
    const activeProjects=projects.filter(p=>!p.isCompleted);
    const cap=totalCapH(),sched=scheduledH(),pct=cap>0?Math.round(sched/cap*100):0,rem=cap-sched;
    return (
      <div>
        <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}><MonthSel val={rMonth} set={setRMo}/><YearSel val={rYear} set={setRYear}/></div>
        <div style={cardSt({marginBottom:20})}>
          <div style={{fontSize:16,fontWeight:600,color:"var(--text-primary)",marginBottom:14}}>Overall — {MONTHS[rMonth]} {rYear}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:14}}>
            {[
              {l:"Total capacity",v:fmtH(cap),s:`${employees.length} staff`,danger:false},
              {l:"Scheduled",v:fmtH(sched),s:`${pct}% utilised`,danger:false},
              {l:"Remaining",v:fmtH(Math.max(rem,0)),s:rem<0?"Over capacity":"Available",danger:rem<0},
              {l:"Working days",v:wdInMonth(rYear,rMonth)+"d",s:"this month",danger:false},
            ].map(x=>(
              <div key={x.l} style={{background:x.danger?"#fef2f2":"var(--bg-muted)",borderRadius:10,padding:"12px 14px",border:`1.5px solid ${x.danger?"#fecaca":"var(--border)"}`}}>
                <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:2}}>{x.l}</div>
                <div style={{fontSize:22,fontWeight:700,color:x.danger?"#dc2626":"var(--text-primary)"}}>{x.v}</div>
                <div style={{fontSize:11,color:x.danger?"#dc2626":"var(--text-faint)"}}>{x.s}</div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"var(--text-muted)",marginBottom:4}}><span>Utilisation</span><span style={{fontWeight:500}}>{pct}%</span></div>
          <ProgBar pct={pct} color="var(--accent)"/>
        </div>
        <div style={{fontSize:14,fontWeight:600,color:"var(--text-primary)",marginBottom:10}}>By project</div>
        {activeProjects.length===0&&<p style={{fontSize:13,color:"var(--text-faint)"}}>No active projects.</p>}
        {activeProjects.map(p=>{
          const manH=projManH(p.id),target=monthlyTargetHoursCapped(p,rYear,rMonth),pct2=target>0?Math.round(manH/target*100):0;
          const mb=monthBudgetSlice(p,rYear,rMonth),lc=labourCostM(p.id),rev=revenueM(p);
          const margin=rev!==null&&lc>=0?rev-lc:null;
          const daysSched=manH/HPD;
          const isH=p.totalUnit==="hours";
          const hasCor=!!(p.chargeOutRate&&parseFloat(p.chargeOutRate)>0);
          const metrics=[
            {l:"Scheduled",v:isH?`${fmtH(manH)} / ${fmtH(target)}`:`${Math.round(manH/HPD)}d / ${Math.round(target/HPD)}d`},
            mb?{l:"Monthly budget",v:fmt$(mb)}:null,
            manH>0?{l:"Labour cost (pay rates)",v:fmt$(lc)}:null,
            manH>0&&!hasCor?{l:"Revenue & margin",v:"Set charge-out rate",sub:"Project editor → Client charge-out ($/hr) unlocks revenue and margin.",muted:true}:null,
            rev?{l:"Revenue (charge-out × hrs)",v:fmt$(rev)}:null,
            margin!==null&&manH>0?{l:"Margin (this month)",v:fmt$(margin),danger:margin<0}:null,
            margin!==null&&manH>0?{l:"Margin / hour",v:fmt$(margin/manH),danger:margin<0}:null,
            margin!==null&&daysSched>0?{l:"Margin / day scheduled",v:fmt$(margin/daysSched),danger:margin<0}:null,
            mb&&lc>0?{l:"Budget left",v:fmt$(mb-lc),danger:lc>mb}:null,
          ].filter(Boolean);
          return (
            <div key={p.id} style={cardSt({borderLeft:`4px solid ${p.color}`})}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:10,alignItems:"baseline"}}>
                <span style={{fontSize:15,fontWeight:600,color:"var(--text-primary)"}}>{p.name}</span>
                {p.client&&<span style={{fontSize:12,color:"var(--text-muted)"}}>{p.client}</span>}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8,marginBottom:10}}>
                {metrics.map(x=>(
                  <div key={x.l} style={{background:x.danger?"#fef2f2":x.muted?"#fffbeb":"var(--bg-muted)",borderRadius:8,padding:"10px 12px",border:`1px solid ${x.danger?"#fecaca":x.muted?"#fde68a":"var(--border)"}`}}>
                    <div style={{fontSize:11,color:"var(--text-muted)"}}>{x.l}</div>
                    <div style={{fontSize:17,fontWeight:700,color:x.danger?"#dc2626":x.muted?"#92400e":"var(--text-primary)"}}>{x.v}</div>
                    {x.sub&&<div style={{fontSize:11,color:"var(--text-muted)",marginTop:4,lineHeight:1.35}}>{x.sub}</div>}
                  </div>
                ))}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"var(--text-muted)",marginBottom:3}}><span>Progress</span><span style={{fontWeight:500}}>{pct2}%</span></div>
              <ProgBar pct={pct2} color={p.color}/>
            </div>
          );
        })}
        <div style={{fontSize:14,fontWeight:600,color:"var(--text-primary)",margin:"20px 0 10px"}}>By employee</div>
        {employees.length===0&&<p style={{fontSize:13,color:"var(--text-faint)"}}>No employees yet.</p>}
        {employees.map(e=>{
          const sch=empMonthH(e.id),cap3=empCalCap(e),pct3=cap3>0?Math.round(sch/cap3*100):0;
          return (
            <div key={e.id} style={cardSt({display:"flex",gap:12,alignItems:"center",padding:"12px 16px"})}>
              <Avatar name={e.name} color="var(--accent)"/>
              <div style={{flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:2}}>
                  <span style={{fontWeight:600,fontSize:14,color:"var(--text-primary)"}}>{e.name} <span style={{fontSize:12,color:"var(--text-muted)",fontWeight:400}}>{e.role}</span></span>
                  <span style={{fontSize:13,color:pct3>=100?"#dc2626":"var(--text-muted)",fontWeight:500}}>{Math.round(sch/HPD)}d / {Math.round(cap3/HPD)}d · {pct3}%</span>
                </div>
                <ProgBar pct={pct3} color="var(--accent)"/>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── SUMMARY TAB ──────────────────────────────────────────────────────────────
  function SummaryTab() {
    const activeProjects=projects.filter(p=>!p.isCompleted);
    return (
      <div>
        <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}><MonthSel val={rMonth} set={setRMo}/><YearSel val={rYear} set={setRYear}/></div>
        {activeProjects.length===0&&<p style={{fontSize:13,color:"var(--text-faint)"}}>No active projects to summarise.</p>}
        {activeProjects.map(p=>{
          const manH=projManH(p.id),target=monthlyTargetHoursCapped(p,rYear,rMonth),pct=target>0?Math.round(manH/target*100):0;
          const lc=labourCostM(p.id),rev=revenueM(p),margin=rev!=null&&lc>=0?rev-lc:null;
          const daysSched=manH/HPD;
          const staff=employees.filter(e=>calDays.some(d=>getA(rYear,rMonth,d,e.id)===p.id));
          const isH=p.totalUnit==="hours";
          const hasCor=!!(p.chargeOutRate&&parseFloat(p.chargeOutRate)>0);
          return (
            <div key={p.id} style={cardSt({borderLeft:`4px solid ${p.color}`})}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                <span style={{fontSize:15,fontWeight:600,color:"var(--text-primary)"}}>{p.name}</span>
                {p.client&&<span style={{fontSize:13,color:"var(--text-muted)"}}>{p.client}</span>}
              </div>
              {p.overtimeNote&&<div style={{fontSize:12,color:"#9a3412",marginBottom:8,padding:"8px 10px",background:"#fff7ed",borderRadius:8,border:"1px solid #fdba74"}}><strong>Overtime / extra:</strong> {p.overtimeNote}</div>}
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                {staff.map(e=>{ const days=calDays.filter(d=>getA(rYear,rMonth,d,e.id)===p.id).length; return <span key={e.id} style={{fontSize:13,padding:"4px 10px",borderRadius:99,background:"var(--bg-muted)",color:"var(--text-secondary)",border:"1px solid var(--border)"}}>{e.name} · {days}d · {days*HPD}h</span>; })}
                {staff.length===0&&<span style={{fontSize:13,color:"var(--text-faint)"}}>No staff assigned this month</span>}
              </div>
              {manH>0&&(
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8,marginBottom:10}}>
                  <div style={{background:"var(--bg-muted)",borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:11,color:"var(--text-muted)"}}>Labour cost</div><div style={{fontWeight:600}}>{fmt$(lc)}</div></div>
                  <div style={{background:"var(--bg-muted)",borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:11,color:"var(--text-muted)"}}>Revenue (charge-out)</div><div style={{fontWeight:600}}>{rev!=null?fmt$(rev):"—"}</div></div>
                  {hasCor&&margin!=null&&(
                    <>
                      <div style={{background:margin<0?"#fef2f2":"#ecfdf5",borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:11,color:"var(--text-muted)"}}>Margin</div><div style={{fontWeight:600,color:margin<0?"#dc2626":"#065f46"}}>{fmt$(margin)}</div></div>
                      <div style={{background:"var(--bg-muted)",borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:11,color:"var(--text-muted)"}}>Margin / hr</div><div style={{fontWeight:600}}>{fmt$(margin/manH)}</div></div>
                      <div style={{background:"var(--bg-muted)",borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:11,color:"var(--text-muted)"}}>Margin / day (8h)</div><div style={{fontWeight:600}}>{daysSched>0?fmt$(margin/daysSched):"—"}</div></div>
                    </>
                  )}
                  {!hasCor&&(
                    <div style={{gridColumn:"1 / -1",fontSize:12,color:"#92400e",padding:"8px 10px",background:"#fffbeb",borderRadius:8,border:"1px solid #fde68a"}}>
                      Add a <strong>client charge-out rate</strong> on this project to see revenue, margin, margin/hr, and margin per scheduled day.
                    </div>
                  )}
                </div>
              )}
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"var(--text-muted)",marginBottom:3}}>
                <span>{isH?`${fmtH(manH)} of ${fmtH(target)}`:`${Math.round(manH/HPD)}d of ${Math.round(target/HPD)}d`} target</span>
                <span style={{fontWeight:500}}>{pct}%</span>
              </div>
              <ProgBar pct={pct} color={p.color}/>
            </div>
          );
        })}
      </div>
    );
  }

  // ── RENDER ───────────────────────────────────────────────────────────────────
  if(loading) return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"system-ui",fontSize:14,color:"var(--text-muted)",background:"var(--bg-page)"}}>
      Loading…
    </div>
  );

  // Role-based tab visibility — default to "employee" if no profile yet
  const visibleTabs = TABS.filter(t => {
    const role = auth?.profile?.role || "employee";
    if (t === "Admin") return role === "admin";
    if (t === "Settings") return ["admin", "manager"].includes(role);
    if (t === "Reports") return ["admin", "manager", "dispatcher"].includes(role);
    if (t === "PTO") return true;
    if (t === "Capacity") return ["admin", "manager"].includes(role);
    if (t === "Summary") return ["admin", "manager", "dispatcher"].includes(role);
    if (t === "Roster") return ["admin", "manager", "dispatcher"].includes(role);
    if (t === "Schedule") return ["admin", "manager", "dispatcher"].includes(role);
    if (t === "Timesheets") return ["admin", "manager"].includes(role);
    if (t === "Open Shifts") return ["admin", "manager", "dispatcher"].includes(role);
    return true;
  });

  const effectiveTab = visibleTabs.includes(tab) ? tab : visibleTabs[0] || "Projects";

  return (
    <div style={{fontFamily:"system-ui,-apple-system,sans-serif",padding:"1rem",maxWidth:1100,margin:"0 auto",color:"var(--text-primary)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,gap:12,flexWrap:"wrap"}}>
        <div>
          <h2 style={{fontSize:24,fontWeight:700,margin:"0 0 4px",color:"var(--text-primary)"}}>Roster manager</h2>
          <p style={{fontSize:13,color:"var(--text-muted)",margin:0}}>7:00 am – 3:30 pm · 8h days</p>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10,marginLeft:"auto"}}>
          {auth?.user && <NotificationCenter />}
          {auth && <UserMenu auth={auth}/>}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 20,
          borderBottom: "1.5px solid var(--border)",
          paddingBottom: 10,
          minHeight: 48,
          overflowY: "hidden",
        }}
      >
        <button
          type="button"
          aria-label={mainNavOpen ? "Close menu" : "Open menu"}
          aria-expanded={mainNavOpen}
          onClick={() => setMainNavOpen((o) => !o)}
          style={{
            flexShrink: 0,
            width: 44,
            height: 44,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            border: "1.5px solid var(--border-input)",
            borderRadius: 10,
            background: "var(--bg-card)",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <span style={{ display: "block", width: 20, height: 2, background: "var(--text-primary)", borderRadius: 1 }} />
          <span style={{ display: "block", width: 20, height: 2, background: "var(--text-primary)", borderRadius: 1 }} />
          <span style={{ display: "block", width: 20, height: 2, background: "var(--text-primary)", borderRadius: 1 }} />
        </button>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            overflowX: "auto",
            overflowY: "hidden",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {mainNavOpen ? (
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                flexWrap: "nowrap",
                gap: 6,
                alignItems: "center",
                paddingBottom: 2,
              }}
            >
              {visibleTabs.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  style={{
                    padding: "10px 16px",
                    border: "none",
                    background: effectiveTab === t ? "var(--bg-muted)" : "transparent",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 14,
                    color: effectiveTab === t ? "var(--text-primary)" : "var(--text-muted)",
                    borderBottom: effectiveTab === t ? "2px solid var(--accent)" : "2px solid transparent",
                    fontWeight: effectiveTab === t ? 600 : 400,
                    whiteSpace: "nowrap",
                    borderRadius: 8,
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          ) : (
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "var(--text-primary)",
                whiteSpace: "nowrap",
                padding: "8px 4px",
              }}
            >
              {effectiveTab}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={autoGenNoProjectModal}
        title="Create a project first"
        message="Auto-generate needs at least one project. Add a project under Projects, then try again."
        confirmLabel="Go to Projects"
        cancelLabel="Close"
        confirmDanger={false}
        onCancel={() => setAutoGenNoProjectModal(false)}
        onConfirm={() => {
          setAutoGenNoProjectModal(false);
          setTab("Projects");
        }}
      />

      {effectiveTab==="Projects"  && <ProjectsTab/>}
      {effectiveTab==="Employees" && <EmployeesTab/>}
      {effectiveTab==="Schedule" && (
        <AssignmentScheduleOverview
          projects={projects}
          employees={employees}
          rYear={rYear}
          rMonth={rMonth}
          calDays={calDays}
          getA={getA}
          dlabel={dlabel}
          isWknd={isWknd}
          projNameOf={projNameOf}
          projColor={projColor}
          MONTHS={MONTHS}
          onGoToRoster={() => setTab("Roster")}
        />
      )}
      {effectiveTab==="Roster"    && <RosterTab/>}
      {effectiveTab==="Capacity"  && <CapacityTab/>}
      {effectiveTab==="Summary"   && <SummaryTab/>}
      {effectiveTab==="Settings" && (
        <SettingsTab
          employees={employees}
          setEmployees={setEmps}
          certifications={certifications}
          setCertifications={setCertifications}
          shiftRules={shiftRules}
          setShiftRules={setShiftRules}
          userProfiles={userProfiles}
          setUserProfiles={setUserProfiles}
          assignments={assigns}
          projects={projects}
          refreshProjects={refreshProjectsFromDb}
          showToast={showToast}
          supabase={supabase}
          year={rYear}
          month={rMonth}
        />
      )}
      {effectiveTab==="Reports" && (
        <ReportsTab
          projects={projects}
          employees={employees}
          assigns={assigns}
          timesheets={timesheets}
          rYear={rYear}
          rMonth={rMonth}
          setRMo={setRMo}
          setRYear={setRYear}
          showToast={showToast}
          calDays={calDays}
          getA={getA}
        />
      )}
      {effectiveTab==="Timesheets" && (
        <TimesheetTab
          projects={projects}
          employees={employees}
          rYear={rYear}
          rMonth={rMonth}
          setRMo={setRMo}
          setRYear={setRYear}
          showToast={showToast}
          calDays={calDays}
          getA={getA}
          timesheets={timesheets}
          setTimesheets={setTimesheets}
          supabase={supabase}
        />
      )}
      {effectiveTab==="Open Shifts" && (
        <OpenShiftsTab
          projects={projects}
          employees={employees}
          assigns={assigns}
          openShifts={openShifts}
          setOpenShifts={setOpenShifts}
          shiftSwaps={shiftSwaps}
          setShiftSwaps={setShiftSwaps}
          rYear={rYear}
          rMonth={rMonth}
          setRMo={setRMo}
          setRYear={setRYear}
          showToast={showToast}
          calDays={calDays}
          getA={getA}
          supabase={supabase}
        />
      )}
      {effectiveTab==="PTO" && (
        <PTOTab employeeId={linkedEmployeeId} userRole={auth?.profile?.role || "employee"} />
      )}
      {effectiveTab==="Admin" && (
        <AdminTab auth={auth} showToast={showToast} />
      )}
      {dayEd   !== null && <DayEditorModal day={dayEd}/>}
      {projMod !== null && (
        <ProjectModal
          key={pTick}
          projMod={projMod}
          pRef={pRef}
          setProjMod={setProjMod}
          strengthsCatalog={strengthsCatalog}
          customStrengths={customStrengths}
          setCustomStrengths={setCustomStrengths}
          setProj={setProj}
          showToast={showToast}
          saveProj={saveProj}
          purgeTagFromSystem={purgeTagFromSystem}
        />
      )}
      {empMod !== null && (
        <EmployeeModal
          key={eTick}
          empMod={empMod}
          eRef={eRef}
          setEmpMod={setEmpMod}
          strengthsCatalog={strengthsCatalog}
          customStrengths={customStrengths}
          setCustomStrengths={setCustomStrengths}
          setEmps={setEmps}
          showToast={showToast}
          saveEmp={saveEmp}
          purgeTagFromSystem={purgeTagFromSystem}
        />
      )}
      {toast&&(
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"var(--toast-bg)",color:"var(--toast-fg)",padding:"12px 20px",borderRadius:10,fontSize:13,zIndex:1000,boxShadow:"0 4px 16px rgba(0,0,0,0.2)",maxWidth:400,textAlign:"center",pointerEvents:"none"}}>
          {toast}
        </div>
      )}
    </div>
  );
}
