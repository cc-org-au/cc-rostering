"use client";
import { useState, useMemo, useCallback } from "react";
import { monthlyTargetHoursCapped } from "../../lib/rosterAlloc.js";
import {
  DAYS_SHORT, MONTHS, HPD,
  daysInMo, dowOf, dlabel, isWknd,
  fmtH, fmt$,
  cardSt, inpSt, selSt,
  BtnPri, Btn, BtnDanger,
  Overlay, ModalBox, SecTitle,
  Avatar, Tag, Empty, Alert,
  inits,
} from "./shared";

const YEARS = Array.from({length:6},(_,i)=>new Date().getFullYear()-1+i);

function projColor(projects,id){return projects.find(p=>p.id===id)?.color||"#888";}
function projNameOf(projects,id){return projects.find(p=>p.id===id)?.name||"";}

// ── Shift rule violation detection ────────────────────────────────────────────
function computeViolations(employees, projects, assigns, rYear, rMonth, calDays, shiftRules, ptoRequests) {
  const violations = [];
  const maxDay  = shiftRules?.max_hours_per_day  || 10;
  const maxWeek = shiftRules?.max_hours_per_week || 50;
  const otDay   = shiftRules?.overtime_threshold_daily  || 8;
  const otWeek  = shiftRules?.overtime_threshold_weekly || 38;

  // Group days into Mon-Sun weeks
  const weeks = [];
  let week = [];
  for (let d = 1; d <= daysInMo(rYear, rMonth); d++) {
    week.push(d);
    const dow = (dowOf(rYear, rMonth, d) + 6) % 7; // 0=Mon..6=Sun
    if (dow === 6 || d === daysInMo(rYear, rMonth)) { weeks.push([...week]); week = []; }
  }

  employees.forEach(e => {
    // PTO days for this employee this month
    const ptoDays = new Set();
    (ptoRequests||[]).filter(r=>r.employee_id===e.id&&r.status==='approved').forEach(r=>{
      const sd=new Date(r.start_date), ed=new Date(r.end_date);
      for(let dt=new Date(sd);dt<=ed;dt.setDate(dt.getDate()+1)){
        if(dt.getFullYear()===rYear&&dt.getMonth()===rMonth) ptoDays.add(dt.getDate());
      }
    });

    weeks.forEach((wDays, wi) => {
      const weekH = wDays.reduce((h,d)=>{
        const pid = assigns[`${rYear}-${rMonth}-${d}-${e.id}`];
        return h + (pid ? HPD : 0);
      }, 0);
      if (weekH > otWeek) violations.push({type:'overtime_week', emp:e, week:wi+1, hours:weekH, threshold:otWeek});
      if (weekH > maxWeek) violations.push({type:'exceed_week', emp:e, week:wi+1, hours:weekH, threshold:maxWeek});
    });

    // PTO conflict: rostered on an approved PTO day
    calDays.forEach(d => {
      const pid = assigns[`${rYear}-${rMonth}-${d}-${e.id}`];
      if (pid && ptoDays.has(d)) {
        violations.push({type:'pto_conflict', emp:e, day:d, project: projNameOf(projects, pid)});
      }
      // Availability conflict
      if (pid && !isWknd(rYear, rMonth, d)) {
        const dl = dlabel(rYear, rMonth, d);
        if (!e.availability?.[dl]) violations.push({type:'avail', emp:e, day:d, dl});
      }
    });
  });
  return violations;
}

// ── Day Editor Modal ──────────────────────────────────────────────────────────
function DayEditorModal({ day, rYear, rMonth, employees, projects, assigns, getA, setA, bulkAssignEmpToProj, onClose }) {
  const [dragOver, setDragOver] = useState(null);
  const dl = dlabel(rYear, rMonth, day);
  const assigned  = employees.filter(e => getA(rYear, rMonth, day, e.id));
  const available = employees.filter(e => !getA(rYear, rMonth, day, e.id) && e.availability?.[dl]);
  const unavail   = employees.filter(e => !getA(rYear, rMonth, day, e.id) && !e.availability?.[dl]);

  const skillMatch = (e, p) => {
    const total = p.strengthsRequired?.length || 0;
    if (!total) return null;
    return { n: e.strengths?.filter(s => p.strengthsRequired.includes(s)).length || 0, total };
  };

  return (
    <Overlay onClose={onClose}>
      <ModalBox maxWidth={540}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div>
            <div style={{fontSize:18,fontWeight:700,color:"var(--text-primary)"}}>{dl} {day} {MONTHS[rMonth]} {rYear}</div>
            <div style={{fontSize:13,color:"var(--text-muted)",marginTop:2}}>{assigned.length} staff on site</div>
          </div>
          <Btn onClick={onClose}>Close</Btn>
        </div>
        {projects.length > 0 && (
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
            {projects.map(p => {
              const count = assigned.filter(e => getA(rYear, rMonth, day, e.id) === p.id).length;
              const fixed = p.staffMode === "fixed" && p.fixedStaff ? parseInt(p.fixedStaff) : null;
              const ok = fixed === null || count === fixed;
              const bg = fixed === null ? "var(--bg-muted)" : ok ? "#dcfce7" : "#fee2e2";
              const col = fixed === null ? "var(--text-muted)" : ok ? "#166534" : "#dc2626";
              const border = ok ? (fixed === null ? "var(--border)" : "#86efac") : "#fca5a5";
              return (
                <div key={p.id} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:99,background:bg,border:`1.5px solid ${border}`}}>
                  <span style={{width:7,height:7,borderRadius:"50%",background:p.color,flexShrink:0}}/>
                  <span style={{fontSize:12,fontWeight:500,color:col}}>
                    {p.name}: {count}{fixed !== null ? ` / ${fixed} req` : " assigned"}
                    {fixed !== null && !ok && (count < fixed ? ` — need ${fixed-count}` : ` — ${count-fixed} over`)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <SecTitle>On site ({assigned.length})</SecTitle>
        {assigned.length === 0 && <p style={{fontSize:13,color:"var(--text-faint)",marginBottom:12}}>No one assigned — add staff below.</p>}
        {assigned.map(e => {
          const pid = getA(rYear, rMonth, day, e.id);
          return (
            <div key={e.id} draggable
              onDragStart={ev => ev.dataTransfer.setData("text/plain", JSON.stringify({eId:e.id, fromDay:day}))}
              style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",border:"1.5px solid #e5e7eb",borderRadius:10,background:"var(--bg-surface)",marginBottom:6,cursor:"grab"}}>
              <Avatar name={e.name} color={projColor(projects, pid)}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:500,color:"var(--text-primary)"}}>{e.name}</div>
                <div style={{fontSize:12,color:"var(--text-muted)"}}>{e.role}</div>
              </div>
              <select value={pid} onChange={ev => setA(rYear, rMonth, day, e.id, ev.target.value)} style={selSt({fontSize:13,padding:"6px 10px"})}>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button onClick={() => setA(rYear, rMonth, day, e.id, null)} style={{border:"none",background:"none",cursor:"pointer",color:"var(--text-faint)",fontSize:20,lineHeight:1,padding:"0 4px"}}>✕</button>
            </div>
          );
        })}
        {available.length > 0 && (
          <div style={{marginTop:16}}>
            <SecTitle>Available to add ({available.length})</SecTitle>
            {available.map(e => (
              <div key={e.id} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",border:"1.5px solid #e5e7eb",borderRadius:10,background:"var(--bg-card)",marginBottom:6}}>
                <Avatar name={e.name}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:500,color:"var(--text-primary)"}}>{e.name}</div>
                  <div style={{fontSize:12,color:"var(--text-muted)"}}>{e.role}{e.strengths?.length ? ` · ${e.strengths.slice(0,2).join(", ")}${e.strengths.length>2?` +${e.strengths.length-2}`:""}` : ""}</div>
                </div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"flex-end"}}>
                  {projects.map(p => {
                    const sm = skillMatch(e, p);
                    const badgeCol = sm ? (sm.n === sm.total ? "#059669" : sm.n > 0 ? "#d97706" : "#dc2626") : null;
                    return (
                      <div key={p.id} style={{display:"flex",gap:0}}>
                        <button title={`Assign ${e.name} to ${p.name} today`}
                          onClick={() => setA(rYear, rMonth, day, e.id, p.id)}
                          style={{padding:"5px 10px",borderRadius:"8px 0 0 8px",border:`1.5px solid ${p.color}`,borderRight:"none",background:`${p.color}14`,color:badgeCol||p.color,fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                          + {p.name}{sm?` ${sm.n}/${sm.total}★`:""}
                        </button>
                        <button title={`Assign ${e.name} to ${p.name} for all available weekdays`}
                          onClick={() => bulkAssignEmpToProj(e.id, p.id)}
                          style={{padding:"5px 8px",borderRadius:"0 8px 8px 0",border:`1.5px solid ${p.color}`,background:`${p.color}22`,color:p.color,fontSize:11,cursor:"pointer",fontFamily:"inherit",fontWeight:500}}>
                          mo↓
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        {unavail.length > 0 && (
          <div style={{marginTop:16}}>
            <SecTitle>Unavailable today ({unavail.length})</SecTitle>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {unavail.map(e => <span key={e.id} style={{fontSize:12,padding:"3px 10px",borderRadius:99,background:"var(--bg-muted)",color:"var(--text-faint)",border:"1px solid #e5e7eb"}}>{e.name}</span>)}
            </div>
          </div>
        )}
      </ModalBox>
    </Overlay>
  );
}

// ── Coverage view ─────────────────────────────────────────────────────────────
function CoverageView({ projects, employees, assigns, rYear, rMonth, calDays, onDayClick }) {
  const weekdays = calDays.filter(d => !isWknd(rYear, rMonth, d));
  return (
    <div style={{overflowX:"auto"}}>
      <table style={{borderCollapse:"collapse",fontSize:12,width:"100%"}}>
        <thead>
          <tr>
            <th style={{textAlign:"left",padding:"6px 12px",fontWeight:600,color:"var(--text-muted)",borderBottom:"1.5px solid var(--border)",minWidth:160,position:"sticky",left:0,background:"var(--bg-card)",zIndex:1}}>Project</th>
            {weekdays.map(d => (
              <th key={d} style={{padding:"3px 2px",textAlign:"center",color:"var(--text-muted)",fontWeight:500,borderBottom:"1.5px solid var(--border)",minWidth:36}}>
                <div style={{fontSize:11}}>{d}</div>
                <div style={{fontSize:9,marginTop:1}}>{dlabel(rYear,rMonth,d).slice(0,1)}</div>
              </th>
            ))}
            <th style={{padding:"6px 10px",textAlign:"right",fontWeight:600,color:"var(--text-muted)",borderBottom:"1.5px solid var(--border)",minWidth:90}}>Coverage</th>
          </tr>
        </thead>
        <tbody>
          {projects.map(p => {
            const fixed = p.staffMode === "fixed" && p.fixedStaff ? parseInt(p.fixedStaff) : null;
            const totalDays = weekdays.length;
            const filledDays = weekdays.filter(d => employees.some(e => assigns[`${rYear}-${rMonth}-${d}-${e.id}`] === p.id)).length;
            return (
              <tr key={p.id} style={{borderBottom:"1px solid #f3f4f6"}}>
                <td style={{padding:"8px 12px",fontWeight:500,color:"var(--text-primary)",position:"sticky",left:0,background:"var(--bg-card)",zIndex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{width:10,height:10,borderRadius:"50%",background:p.color,flexShrink:0}}/>
                    <span style={{fontSize:13}}>{p.name}</span>
                  </div>
                  {fixed && <div style={{fontSize:11,color:"var(--text-muted)",marginLeft:18}}>Needs {fixed}/day</div>}
                </td>
                {weekdays.map(d => {
                  const count = employees.filter(e => assigns[`${rYear}-${rMonth}-${d}-${e.id}`] === p.id).length;
                  const needed = fixed || 0;
                  const ok = fixed === null ? count > 0 : count >= fixed;
                  const empty = count === 0;
                  const bg = empty ? "rgba(254,202,202,0.35)" : ok ? `${p.color}20` : "var(--surface-warn)";
                  const col = empty ? "#dc2626" : ok ? p.color : "#d97706";
                  return (
                    <td key={d} onClick={() => onDayClick(d)}
                      style={{padding:"4px 2px",textAlign:"center",background:bg,cursor:"pointer",borderLeft:"1px solid var(--border-soft)",borderRadius:4}}>
                      <span style={{fontSize:12,fontWeight:600,color:col}}>{count || "–"}</span>
                      {fixed && count < fixed && count > 0 && <span style={{fontSize:9,color:"#d97706",display:"block"}}>-{fixed-count}</span>}
                    </td>
                  );
                })}
                <td style={{padding:"8px 10px",textAlign:"right"}}>
                  <span style={{fontSize:12,fontWeight:600,color:filledDays<totalDays*0.8?"#dc2626":"#059669"}}>
                    {filledDays}/{totalDays}d
                  </span>
                </td>
              </tr>
            );
          })}
          {/* Unassigned row */}
          <tr style={{borderBottom:"1px solid var(--border-soft)",background:"var(--bg-surface)"}}>
            <td style={{padding:"8px 12px",fontWeight:500,color:"var(--text-muted)",fontSize:13,position:"sticky",left:0,background:"var(--bg-surface)",zIndex:1}}>Unassigned</td>
            {weekdays.map(d => {
              const unassigned = employees.filter(e => {
                const dl = dlabel(rYear, rMonth, d);
                return e.availability?.[dl] && !assigns[`${rYear}-${rMonth}-${d}-${e.id}`];
              }).length;
              return (
                <td key={d} onClick={() => onDayClick(d)}
                  style={{padding:"4px 2px",textAlign:"center",background:unassigned>0?"var(--surface-warn)":"var(--surface-ok)",cursor:"pointer",borderLeft:"1px solid var(--border-soft)"}}>
                  <span style={{fontSize:12,fontWeight:600,color:unassigned>0?"#d97706":"#059669"}}>{unassigned||"✓"}</span>
                </td>
              );
            })}
            <td/>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Main RosterTab ────────────────────────────────────────────────────────────
export default function RosterTab({
  projects, employees, assigns, setAssigns,
  rYear, rMonth, setRMo, setRYear,
  showToast, calDays,
  getA, setA,
  autoGenerate, clearMonth, bulkAssignEmpToProj,
  shiftRules, ptoRequests,
  openShifts,
  supabase,
}) {
  const [dayEd, setDayEd]         = useState(null);
  const [rosterView, setRView]    = useState("calendar");
  const [showViolations, setShowV]= useState(true);
  const [dragOverDay, setDragOverDay] = useState(null);

  const MonthSel = ({val,set}) => <select value={val} onChange={e=>set(+e.target.value)} style={selSt({width:"auto"})}>{MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}</select>;
  const YearSel  = ({val,set}) => <select value={val} onChange={e=>set(+e.target.value)} style={selSt({width:"auto"})}>{YEARS.map(y=><option key={y}>{y}</option>)}</select>;

  const violations = useMemo(() =>
    computeViolations(employees, projects, assigns, rYear, rMonth, calDays, shiftRules, ptoRequests),
    [employees, projects, assigns, rYear, rMonth, calDays, shiftRules, ptoRequests]
  );

  const projManH = useCallback(pId => calDays.reduce((h,d)=>h+employees.filter(e=>getA(rYear,rMonth,d,e.id)===pId).length*HPD,0), [calDays,employees,getA,rYear,rMonth]);
  const empMonthH = useCallback(eId => calDays.reduce((h,d)=>h+(getA(rYear,rMonth,d,eId)?HPD:0),0), [calDays,getA,rYear,rMonth]);

  // Approved PTO dates this month (employee_id → Set of days)
  const ptoDaysMap = useMemo(() => {
    const map = {};
    (ptoRequests||[]).filter(r=>r.status==='approved').forEach(r=>{
      const sd=new Date(r.start_date), ed=new Date(r.end_date);
      for(let dt=new Date(sd);dt<=ed;dt.setDate(dt.getDate()+1)){
        if(dt.getFullYear()===rYear&&dt.getMonth()===rMonth){
          if(!map[r.employee_id]) map[r.employee_id]=new Set();
          map[r.employee_id].add(dt.getDate());
        }
      }
    });
    return map;
  }, [ptoRequests, rYear, rMonth]);

  // Open shifts this month (date → count)
  const openShiftDays = useMemo(() => {
    const map = {};
    (openShifts||[]).filter(s=>s.status==='open').forEach(s=>{
      const d = new Date(s.date);
      if(d.getFullYear()===rYear && d.getMonth()===rMonth) {
        const day = d.getDate();
        map[day] = (map[day]||0)+1;
      }
    });
    return map;
  }, [openShifts, rYear, rMonth]);

  // DnD handlers
  function handleDrop(toDay, ev) {
    ev.preventDefault();
    setDragOverDay(null);
    try {
      const {eId, fromDay} = JSON.parse(ev.dataTransfer.getData("text/plain"));
      if (fromDay === toDay || isWknd(rYear, rMonth, toDay)) return;
      const pid = getA(rYear, rMonth, fromDay, eId);
      if (!pid) return;
      setA(rYear, rMonth, fromDay, eId, null);
      setA(rYear, rMonth, toDay, eId, pid);
    } catch {}
  }

  // Calendar view
  const firstDow = (dowOf(rYear, rMonth, 1) + 6) % 7;
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMo(rYear, rMonth); d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i+7));

  const vCount = violations.length;

  return (
    <div>
      {/* Controls */}
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12,flexWrap:"wrap"}}>
        <MonthSel val={rMonth} set={setRMo}/>
        <YearSel  val={rYear}  set={setRYear}/>
        <BtnPri onClick={autoGenerate}>Auto-generate</BtnPri>
        <Btn onClick={clearMonth}>Clear month</Btn>
        <div style={{marginLeft:"auto",display:"flex",border:"1.5px solid var(--border-input)",borderRadius:8,overflow:"hidden"}}>
          {[["calendar","Calendar"],["employees","By employee"],["coverage","Coverage"]].map(([v,label])=>(
            <button key={v} type="button" onClick={()=>setRView(v)}
              style={{padding:"8px 14px",border:"none",fontFamily:"inherit",fontSize:13,fontWeight:500,cursor:"pointer",background:rosterView===v?"var(--accent)":"var(--surface-cell)",color:rosterView===v?"var(--on-accent)":"var(--text-secondary)",whiteSpace:"nowrap"}}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Violations panel */}
      {vCount > 0 && (
        <div style={{marginBottom:14}}>
          <button onClick={()=>setShowV(v=>!v)} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderRadius:8,background:"var(--surface-warn)",border:"1.5px solid var(--surface-warn-border)",color:"var(--surface-warn-text)",fontSize:13,fontWeight:600,cursor:"pointer",width:"100%",textAlign:"left",fontFamily:"inherit"}}>
            <span>⚠ {vCount} compliance issue{vCount>1?"s":""} detected</span>
            <span style={{marginLeft:"auto",fontSize:11}}>{showViolations?"▲ Hide":"▼ Show"}</span>
          </button>
          {showViolations && (
            <div style={{border:"1.5px solid var(--surface-warn-border)",borderTop:"none",borderRadius:"0 0 8px 8px",padding:12,background:"var(--surface-warn-panel)"}}>
              {violations.map((v,i) => (
                <div key={i} style={{fontSize:13,color:"var(--surface-warn-text)",padding:"4px 0",borderBottom:i<violations.length-1?"1px solid var(--surface-warn-border)":"",...{display:"flex",gap:8,alignItems:"center"}}}>
                  <span style={{fontSize:16}}>{v.type==='pto_conflict'?"🏖":v.type==='avail'?"📅":"⏰"}</span>
                  {v.type==='overtime_week' && <span><b>{v.emp.name}</b> — Week {v.week}: {v.hours}h scheduled (overtime threshold: {v.threshold}h)</span>}
                  {v.type==='exceed_week'   && <span><b>{v.emp.name}</b> — Week {v.week}: {v.hours}h scheduled exceeds max {v.threshold}h</span>}
                  {v.type==='pto_conflict'  && <span><b>{v.emp.name}</b> — Rostered on approved leave day {v.day} {MONTHS[rMonth]} ({v.project})</span>}
                  {v.type==='avail'         && <span><b>{v.emp.name}</b> — Rostered on {v.dl} {v.day} but not available that day</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Project progress pills */}
      {projects.length > 0 && (
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
          {projects.map(p => {
            const target = monthlyTargetHoursCapped(p, rYear, rMonth);
            const actual = projManH(p.id);
            const pct = target > 0 ? Math.round(actual/target*100) : 0;
            const display = p.totalUnit==="hours" ? `${fmtH(actual)}/${fmtH(target)}` : `${Math.round(actual/HPD)}d/${Math.round(target/HPD)}d`;
            return (
              <div key={p.id} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:99,background:`${p.color}14`,border:`1.5px solid ${p.color}44`}}>
                <span style={{width:8,height:8,borderRadius:"50%",background:p.color,display:"inline-block"}}/>
                <span style={{fontSize:13,color:p.color,fontWeight:500}}>{p.name}: {display} ({pct}%)</span>
              </div>
            );
          })}
        </div>
      )}

      {(projects.length === 0 || employees.length === 0) && (
        <div style={{textAlign:"center",padding:32,border:"2px dashed var(--border)",borderRadius:12,color:"var(--text-faint)",fontSize:14}}>
          Add projects and employees first to start building the roster.
        </div>
      )}

      {/* ── Calendar view ── */}
      {projects.length > 0 && employees.length > 0 && rosterView === "calendar" && (
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:4}}>
            {DAYS_SHORT.map(d=><div key={d} style={{fontSize:12,fontWeight:600,textAlign:"center",color:"var(--text-muted)",padding:"4px 0"}}>{d}</div>)}
          </div>
          {weeks.map((week,wi) => (
            <div key={wi} style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:4}}>
              {week.map((day,di) => {
                if (!day) return <div key={di}/>;
                const wknd = isWknd(rYear, rMonth, day);
                const onSite = employees.filter(e => getA(rYear, rMonth, day, e.id));
                const byProj = {};
                onSite.forEach(e => { const pid=getA(rYear,rMonth,day,e.id); byProj[pid]=(byProj[pid]||0)+1; });
                const hasOpenShift = openShiftDays[day] > 0;
                const isDragOver = dragOverDay === day;
                return (
                  <div key={day}
                    onClick={() => { if (!wknd) setDayEd(day); }}
                    onDragOver={ev => { if (!wknd){ ev.preventDefault(); setDragOverDay(day); }}}
                    onDragLeave={() => setDragOverDay(null)}
                    onDrop={ev => handleDrop(day, ev)}
                    onMouseEnter={e=>{if(!wknd){e.currentTarget.style.borderColor="#a5b4fc";e.currentTarget.style.boxShadow="0 0 0 3px #eef2ff";}}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor=isDragOver?"#6366f1":"var(--border)";e.currentTarget.style.boxShadow="none";}}
                    style={{border:`1.5px solid ${isDragOver?"#6366f1":"var(--border)"}`,borderRadius:10,padding:"6px 7px",minHeight:72,background:wknd?"var(--bg-muted)":isDragOver?"var(--surface-drag)":"var(--surface-cell)",cursor:wknd?"default":"pointer",transition:"border-color 0.12s,box-shadow 0.12s,background 0.12s"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                      <span style={{fontSize:12,fontWeight:600,color:wknd?"var(--text-faint)":"var(--text-secondary)"}}>{day}</span>
                      {hasOpenShift && <span title={`${openShiftDays[day]} open shift(s)`} style={{fontSize:9,padding:"1px 5px",borderRadius:99,background:"var(--info-bg)",color:"var(--info-text-strong)",fontWeight:700}}>+{openShiftDays[day]}</span>}
                    </div>
                    {!wknd && Object.entries(byProj).map(([pid,count]) => (
                      <div key={pid} style={{display:"flex",alignItems:"center",gap:3,marginBottom:2}}>
                        <span style={{width:7,height:7,borderRadius:"50%",background:projColor(projects,pid),flexShrink:0}}/>
                        <span style={{fontSize:10,color:"var(--text-secondary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{count} · {projNameOf(projects,pid).slice(0,9)}{projNameOf(projects,pid).length>9?"…":""}</span>
                      </div>
                    ))}
                    {!wknd && Object.keys(byProj).length===0 && <span style={{fontSize:10,color:"var(--border-input)"}}>Tap to add</span>}
                  </div>
                );
              })}
            </div>
          ))}
          <div style={{fontSize:12,color:"var(--text-faint)",marginTop:8}}>💡 Drag an assigned employee to another day to move them. Blue badge = open shifts available.</div>
        </div>
      )}

      {/* ── By employee view ── */}
      {projects.length > 0 && employees.length > 0 && rosterView === "employees" && (
        <div style={{overflowX:"auto"}}>
          <table style={{borderCollapse:"collapse",fontSize:12,width:"100%"}}>
            <thead>
              <tr>
                <th style={{textAlign:"left",padding:"6px 12px",fontWeight:600,color:"var(--text-muted)",borderBottom:"1.5px solid var(--border)",minWidth:140,position:"sticky",left:0,background:"var(--bg-card)",zIndex:1}}>Employee</th>
                {calDays.map(d => {
                  const wknd = isWknd(rYear, rMonth, d);
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
              {employees.map(e => {
                const sch = empMonthH(e.id);
                const pct = e.maxHoursPerMonth > 0 ? Math.round(sch/e.maxHoursPerMonth*100) : 0;
                const hasViol = violations.some(v => v.emp.id === e.id);
                return (
                  <tr key={e.id} style={{borderBottom:"1px solid var(--border-soft)",background:hasViol?"var(--surface-warn)":"var(--surface-cell)"}}>
                    <td style={{padding:"8px 12px",fontWeight:500,color:"var(--text-primary)",fontSize:13,whiteSpace:"nowrap",position:"sticky",left:0,background:hasViol?"var(--surface-warn)":"var(--surface-cell)",zIndex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        {hasViol && <span title="Compliance issue">⚠</span>}
                        <div>
                          <div>{e.name}</div>
                          <div style={{fontSize:11,color:"var(--text-faint)",fontWeight:400}}>{e.role}</div>
                        </div>
                      </div>
                    </td>
                    {calDays.map(d => {
                      const wknd = isWknd(rYear, rMonth, d);
                      const pid = getA(rYear, rMonth, d, e.id);
                      const dl2 = dlabel(rYear, rMonth, d);
                      const avail = e.availability?.[dl2];
                      const isPTO = ptoDaysMap[e.id]?.has(d);
                      return (
                        <td key={d}
                          draggable={!!pid}
                          onDragStart={ev => pid && ev.dataTransfer.setData("text/plain", JSON.stringify({eId:e.id, fromDay:d}))}
                          onDragOver={ev => { if(!wknd){ev.preventDefault(); setDragOverDay(d);}}}
                          onDragLeave={() => setDragOverDay(null)}
                          onDrop={ev => handleDrop(d, ev)}
                          onClick={() => { if (!wknd) setDayEd(d); }}
                          title={pid ? `${e.name} → ${projNameOf(projects,pid)}` : isPTO ? "Approved leave" : undefined}
                          style={{padding:"3px 1px",textAlign:"center",background:wknd?"var(--bg-muted)":isPTO?"var(--accent-soft)":pid?projColor(projects,pid)+"28":"var(--surface-cell)",cursor:wknd?"default":"pointer",borderLeft:"1px solid var(--border-soft)"}}>
                          {pid && <span style={{display:"block",width:10,height:10,borderRadius:"50%",background:projColor(projects,pid),margin:"0 auto"}}/>}
                          {isPTO && !pid && <span style={{color:"#7c3aed",fontSize:9}}>PTO</span>}
                          {!pid && !wknd && !avail && !isPTO && <span style={{color:"var(--border)",fontSize:9}}>–</span>}
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

      {/* ── Coverage view ── */}
      {projects.length > 0 && employees.length > 0 && rosterView === "coverage" && (
        <CoverageView
          projects={projects} employees={employees} assigns={assigns}
          rYear={rYear} rMonth={rMonth} calDays={calDays}
          onDayClick={d => setDayEd(d)}
        />
      )}

      {/* Day editor modal */}
      {dayEd !== null && (
        <DayEditorModal
          day={dayEd} rYear={rYear} rMonth={rMonth}
          employees={employees} projects={projects}
          assigns={assigns} getA={getA} setA={setA}
          bulkAssignEmpToProj={bulkAssignEmpToProj}
          onClose={() => setDayEd(null)}
        />
      )}
    </div>
  );
}
