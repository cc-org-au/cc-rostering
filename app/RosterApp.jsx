"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { supabase } from '../lib/supabase.js';
import UserMenu from './components/UserMenu';
import { SchedulerDragDrop } from './components/SchedulerDragDrop';
import { DAYS_SHORT, MONTHS, EMP_TYPES, ROLES, STRENGTHS, PROJ_COLORS, HPD, ConfirmModal } from './components/shared';

const TABS        = ["Projects","Employees","Scheduler","Roster","Capacity","Summary","Admin"];
const NOW         = new Date();

// ── pure utils ────────────────────────────────────────────────────────────────
const uid       = () => Math.random().toString(36).slice(2,8);
const daysInMo  = (y,m) => new Date(y,m+1,0).getDate();
const dowOf     = (y,m,d) => new Date(y,m,d).getDay();
const dlabel    = (y,m,d) => DAYS_SHORT[(dowOf(y,m,d)+6)%7];
const isWknd    = (y,m,d) => { const w=dowOf(y,m,d); return w===0||w===6; };
const pmKey     = (y,m)   => `${y}-${m}`;
const fmt$      = n => "$"+Math.round(n).toLocaleString();
const fmtH      = n => Math.round(n*10)/10+"h";
const inits     = name => name.trim().split(/\s+/).map(n=>n[0]).join("").slice(0,2).toUpperCase();

function wdInMonth(y,m) {
  let c=0; for(let d=1;d<=daysInMo(y,m);d++) if(!isWknd(y,m,d)) c++; return c;
}
function getProjectMonths(p) {
  if (p.startMonth===""||!p.startYear||p.endMonth===""||!p.endYear) return [];
  const out=[]; let y=+p.startYear, m=+p.startMonth;
  const ey=+p.endYear, em=+p.endMonth;
  while(y<ey||(y===ey&&m<=em)){ out.push({y,m}); if(++m>11){m=0;y++;} }
  return out;
}
function totalBudgetHours(p) {
  if (!p.budget||!p.chargeOutRate) return null;
  return parseFloat(p.budget)/parseFloat(p.chargeOutRate);
}
function totalInputHours(p) {
  if (!p.totalInput||parseFloat(p.totalInput)<=0) return null;
  const v=parseFloat(p.totalInput);
  return p.totalUnit==="hours" ? v : v*HPD;
}
function spreadAcrossMonths(p) {
  const months=getProjectMonths(p);
  if (!months.length) return {};
  const totalH=totalInputHours(p)||totalBudgetHours(p);
  const totalWd=months.reduce((a,{y,m})=>a+wdInMonth(y,m),0);
  const result={};
  const hoursMode=p.totalUnit==="hours";
  if (totalH!==null&&totalWd>0) {
    if (hoursMode) {
      let rem=totalH;
      months.forEach(({y,m},i)=>{
        const k=pmKey(y,m);
        if (i===months.length-1) { result[k]=Math.max(0.5,Math.round(rem*10)/10); }
        else { const h=Math.round((totalH*(wdInMonth(y,m)/totalWd))*10)/10; result[k]=h; rem-=h; }
      });
    } else {
      let rem=Math.round(totalH/HPD)*HPD;
      months.forEach(({y,m},i)=>{
        const k=pmKey(y,m);
        if (i===months.length-1) { result[k]=Math.max(HPD,Math.round(rem/HPD)*HPD); }
        else { const days=Math.max(1,Math.round((totalH*(wdInMonth(y,m)/totalWd))/HPD)); result[k]=days*HPD; rem-=days*HPD; }
      });
    }
  } else {
    months.forEach(({y,m})=>{ result[pmKey(y,m)]=wdInMonth(y,m)*HPD; });
  }
  return result;
}
function monthAllocH(p,y,m) {
  const v=p.monthlyHours[pmKey(y,m)];
  return v!==undefined ? v : wdInMonth(y,m)*HPD;
}
function monthBudgetSlice(p,y,m) {
  const months=getProjectMonths(p);
  if (!months.length||!p.budget) return null;
  const tw=months.reduce((a,mm)=>a+wdInMonth(mm.y,mm.m),0);
  return tw>0?Math.round(parseFloat(p.budget)*wdInMonth(y,m)/tw):null;
}

// ── DB ↔ app mapping ─────────────────────────────────────────────────────────
const projToRow = p => ({
  id: p.id, name: p.name, client: p.client, color: p.color, notes: p.notes,
  budget: p.budget, charge_out_rate: p.chargeOutRate, total_input: p.totalInput,
  total_unit: p.totalUnit, staff_mode: p.staffMode, fixed_staff: p.fixedStaff,
  start_month: p.startMonth, start_year: p.startYear, end_month: p.endMonth,
  end_year: p.endYear, monthly_hours: p.monthlyHours, strengths_required: p.strengthsRequired||[],
  is_completed: p.isCompleted||false,
});
const rowToProj = r => ({
  id: r.id, name: r.name, client: r.client||'', color: r.color||PROJ_COLORS[0],
  notes: r.notes||'', budget: r.budget||'', chargeOutRate: r.charge_out_rate||'',
  totalInput: r.total_input||'', totalUnit: r.total_unit||'days',
  staffMode: r.staff_mode||'flexible', fixedStaff: r.fixed_staff||'',
  startMonth: r.start_month||String(NOW.getMonth()), startYear: r.start_year||String(NOW.getFullYear()),
  endMonth: r.end_month||String(NOW.getMonth()), endYear: r.end_year||String(NOW.getFullYear()),
  monthlyHours: r.monthly_hours||{}, strengthsRequired: r.strengths_required||[], isCompleted: r.is_completed||false,
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

// ── stable primitives (outside App) ──────────────────────────────────────────
const cardSt  = (x={}) => ({background:"#fff",border:"1.5px solid #e5e7eb",borderRadius:12,padding:"16px 18px",marginBottom:10,...x});
const inpSt   = (x={}) => ({width:"100%",boxSizing:"border-box",padding:"10px 12px",border:"1.5px solid #d1d5db",borderRadius:8,fontSize:14,fontFamily:"inherit",background:"#fff",color:"#111827",outline:"none",...x});
const selSt   = (x={}) => ({padding:"10px 12px",border:"1.5px solid #d1d5db",borderRadius:8,fontSize:14,fontFamily:"inherit",background:"#fff",color:"#111827",outline:"none",cursor:"pointer",...x});

function ProgBar({pct,color}) {
  const c=pct>=100?"#dc2626":pct>=80?"#d97706":(color||"#059669");
  return <div style={{height:7,borderRadius:99,background:"#f3f4f6",overflow:"hidden",marginTop:5}}><div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:c,borderRadius:99,transition:"width 0.3s"}}/></div>;
}
function Avatar({name,color}) {
  return <div style={{width:34,height:34,borderRadius:"50%",background:color||"#eef2ff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:600,color:color?"#fff":"#4f46e5",flexShrink:0}}>{inits(name)}</div>;
}
function Tag({children,bg,col}) {
  return <span style={{display:"inline-flex",alignItems:"center",padding:"3px 10px",borderRadius:99,fontSize:12,fontWeight:500,background:bg,color:col}}>{children}</span>;
}
function SecTitle({children}) {
  return <div style={{fontSize:11,fontWeight:600,color:"#6b7280",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8}}>{children}</div>;
}
function Empty({icon,title,sub}) {
  return <div style={{textAlign:"center",padding:"48px 24px",border:"2px dashed #e5e7eb",borderRadius:12}}><div style={{fontSize:32,marginBottom:8}}>{icon}</div><div style={{fontSize:15,fontWeight:500,color:"#6b7280",marginBottom:4}}>{title}</div><div style={{fontSize:13,color:"#9ca3af"}}>{sub}</div></div>;
}
function BtnPri({onClick,children,style={}}) {
  return <button onClick={onClick} style={{padding:"10px 18px",background:"#4f46e5",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontFamily:"inherit",fontWeight:500,cursor:"pointer",...style}}>{children}</button>;
}
function Btn({onClick,children,style={}}) {
  return <button onClick={onClick} style={{padding:"9px 16px",background:"#fff",color:"#374151",border:"1.5px solid #d1d5db",borderRadius:8,fontSize:13,fontFamily:"inherit",cursor:"pointer",...style}}>{children}</button>;
}
function BtnDanger({onClick,children}) {
  return <button onClick={onClick} style={{padding:"9px 14px",background:"#fff5f5",color:"#dc2626",border:"1.5px solid #fecaca",borderRadius:8,fontSize:13,fontFamily:"inherit",cursor:"pointer"}}>{children}</button>;
}
function Overlay({onClose,children}) {
  return <div onClick={e=>{if(e.target===e.currentTarget)onClose();}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.25)",display:"flex",alignItems:"flex-start",justifyContent:"center",zIndex:200,overflowY:"auto",padding:"32px 12px 48px"}}>{children}</div>;
}
function ModalBox({children,maxWidth=700}) {
  return <div style={{background:"#fff",borderRadius:16,padding:24,width:`min(${maxWidth}px,100%)`,boxShadow:"0 4px 32px rgba(0,0,0,0.12)"}}>{children}</div>;
}
function Lbl({children}) { return <div style={{fontSize:13,fontWeight:600,color:"#374151",marginBottom:5}}>{children}</div>; }
function Row2({children}) { return <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>{children}</div>; }
function FocusInp({value,onChange,placeholder,type="text",style={}}) {
  return <input type={type} value={value} onChange={onChange} placeholder={placeholder}
    style={inpSt(style)}
    onFocus={e=>e.target.style.borderColor="#4f46e5"}
    onBlur={e=>e.target.style.borderColor="#d1d5db"}/>;
}
function FocusTxt({value,onChange,placeholder}) {
  return <textarea value={value} onChange={onChange} placeholder={placeholder} rows={3}
    style={inpSt({resize:"vertical"})}
    onFocus={e=>e.target.style.borderColor="#4f46e5"}
    onBlur={e=>e.target.style.borderColor="#d1d5db"}/>;
}
function ToggleBtn({options,value,onChange}) {
  return <div style={{display:"flex",border:"1.5px solid #d1d5db",borderRadius:8,overflow:"hidden",width:"fit-content"}}>
    {options.map(([v,label])=>(
      <button key={v} type="button" onClick={()=>onChange(v)}
        style={{padding:"9px 16px",border:"none",fontFamily:"inherit",fontSize:13,fontWeight:500,cursor:"pointer",background:value===v?"#4f46e5":"#fff",color:value===v?"#fff":"#374151"}}>
        {label}
      </button>
    ))}
  </div>;
}
function StrBtn({label,active,onClick}) {
  return <button type="button" onClick={onClick} style={{padding:"4px 10px",borderRadius:99,fontSize:12,fontFamily:"inherit",cursor:"pointer",border:"1.5px solid",background:active?"#ecfdf5":"#fff",color:active?"#059669":"#6b7280",borderColor:active?"#6ee7b7":"#d1d5db"}}>{label}</button>;
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App({ auth, demoMode }) {
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
  const [loading,setLoading]  = useState(true);
  const [toast,setToast]      = useState(null);
  const [rosterView,setRView] = useState("calendar");
  const pRef = useRef(null);
  const eRef = useRef(null);

  useEffect(()=>{
    (async()=>{
      const [{data:pd},{data:ed},{data:ad}] = await Promise.all([
        supabase.from('projects').select('*'),
        supabase.from('employees').select('*'),
        supabase.from('assignments').select('*'),
      ]);
      if(pd) setProj(pd.map(rowToProj));
      if(ed) setEmps(ed.map(rowToEmp));
      if(ad){
        const a={};
        ad.forEach(r=>{a[`${r.year}-${r.month}-${r.day}-${r.employee_id}`]=r.project_id;});
        setAssigns(a);
      }
      setLoading(false);
    })();
  },[]);

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(null),4000); }

  const mkProj = useCallback(()=>({
    id:"", name:"", client:"", color:PROJ_COLORS[0], notes:"",
    budget:"", chargeOutRate:"",
    totalInput:"", totalUnit:"days",
    staffMode:"flexible", fixedStaff:"",
    startMonth:String(NOW.getMonth()), startYear:String(NOW.getFullYear()),
    endMonth:String(NOW.getMonth()),   endYear:String(NOW.getFullYear()),
    monthlyHours:{}, isCompleted:false,
  }),[]);

  const mkEmp = useCallback(()=>({
    id:"", name:"", role:ROLES[3], type:EMP_TYPES[0],
    rate:"", phone:"", email:"", notes:"",
    availability:{Mon:true,Tue:true,Wed:true,Thu:true,Fri:true,Sat:false,Sun:false},
    maxHoursPerMonth:160, strengths:[],
  }),[]);

  function openProjMod(p) { pRef.current=p?{...p,monthlyHours:{...p.monthlyHours}}:mkProj(); setProjMod(p?p.id:"new"); setPTick(t=>t+1); }
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
    setAssigns(prev=>{const n={...prev};if(pid===null)delete n[aKey(y,m,d,eId)];else n[aKey(y,m,d,eId)]=pid;return n;});
    if(pid===null) supabase.from('assignments').delete().match({year:y,month:m,day:d,employee_id:eId}).then(({error})=>{if(error)showToast(error.message);});
    else supabase.from('assignments').upsert({year:y,month:m,day:d,employee_id:eId,project_id:pid}).then(({error})=>{if(error)showToast(error.message);});
  }

  const calDays=useMemo(()=>Array.from({length:daysInMo(rYear,rMonth)},(_,i)=>i+1),[rYear,rMonth]);
  const assignedOnDay=(y,m,d)=>employees.filter(e=>getA(y,m,d,e.id));
  const empMonthH=eId=>calDays.reduce((h,d)=>h+(getA(rYear,rMonth,d,eId)?HPD:0),0);
  const projManH=pId=>calDays.reduce((h,d)=>h+employees.filter(e=>getA(rYear,rMonth,d,e.id)===pId).length*HPD,0);
  const totalCapH=()=>employees.reduce((a,e)=>a+e.maxHoursPerMonth,0);
  const scheduledH=()=>calDays.reduce((h,d)=>h+employees.filter(e=>getA(rYear,rMonth,d,e.id)).length*HPD,0);
  const labourCostM=pId=>employees.reduce((acc,e)=>{const days=calDays.filter(d=>getA(rYear,rMonth,d,e.id)===pId).length;return acc+days*HPD*(parseFloat(e.rate)||0);},0);
  const revenueM=p=>p.chargeOutRate?projManH(p.id)*parseFloat(p.chargeOutRate):null;
  const projColor=id=>projects.find(p=>p.id===id)?.color||"#888";
  const projNameOf=id=>projects.find(p=>p.id===id)?.name||"";

  function clearMonth() {
    const pre=`${rYear}-${rMonth}-`;
    setAssigns(p=>{const n={...p};Object.keys(n).forEach(k=>{if(k.startsWith(pre))delete n[k];});return n;});
    supabase.from('assignments').delete().eq('year',rYear).eq('month',rMonth).then(({error})=>{if(error)showToast(error.message);});
  }

  // Bulk-assign one employee to one project for all their available unscheduled weekdays this month
  function bulkAssignEmpToProj(eId,pid) {
    const e=employees.find(x=>x.id===eId); if(!e) return;
    const newKeys=[],rows=[];
    calDays.forEach(d=>{
      if(isWknd(rYear,rMonth,d)) return;
      const dl=dlabel(rYear,rMonth,d);
      if(!e.availability[dl]||getA(rYear,rMonth,d,eId)) return;
      newKeys.push([aKey(rYear,rMonth,d,eId),pid]);
      rows.push({year:rYear,month:rMonth,day:d,employee_id:eId,project_id:pid});
    });
    if(!newKeys.length) return;
    setAssigns(prev=>{const n={...prev};newKeys.forEach(([k,p])=>{n[k]=p;});return n;});
    supabase.from('assignments').upsert(rows).then(({error})=>{if(error)showToast(error.message);});
  }

  function autoGenerate() {
    const pre=`${rYear}-${rMonth}-`;
    const newA={};
    Object.keys(assigns).forEach(k=>{if(!k.startsWith(pre))newA[k]=assigns[k];});
    const targets={},filled={},empH={};
    projects.forEach(p=>{targets[p.id]=monthAllocH(p,rYear,rMonth);filled[p.id]=0;});
    employees.forEach(e=>{empH[e.id]=0;});
    // skill overlap count between employee and project
    const skillMatch=(e,p)=>p.strengthsRequired?.length
      ?e.strengths.filter(s=>p.strengthsRequired.includes(s)).length:0;
    calDays.forEach(d=>{
      if(isWknd(rYear,rMonth,d)) return;
      const dl=dlabel(rYear,rMonth,d);
      // fixed-headcount projects first, skill-sorted, capacity-capped
      projects.filter(p=>p.staffMode==="fixed"&&p.fixedStaff).forEach(p=>{
        const need=parseInt(p.fixedStaff);
        const avail=employees
          .filter(e=>e.availability[dl]&&!newA[aKey(rYear,rMonth,d,e.id)]&&empH[e.id]+HPD<=e.maxHoursPerMonth)
          .sort((a,b)=>skillMatch(b,p)-skillMatch(a,p));
        avail.slice(0,need).forEach(e=>{newA[aKey(rYear,rMonth,d,e.id)]=p.id;filled[p.id]+=HPD;empH[e.id]+=HPD;});
      });
      // flexible projects: skill match is primary signal, gap is tiebreaker
      employees
        .filter(e=>e.availability[dl]&&!newA[aKey(rYear,rMonth,d,e.id)]&&empH[e.id]+HPD<=e.maxHoursPerMonth)
        .forEach(e=>{
          let bestP=null,bestScore=-Infinity;
          projects.filter(p=>p.staffMode!=="fixed").forEach(p=>{
            const gap=targets[p.id]-filled[p.id];
            if(gap<=0) return;
            const score=skillMatch(e,p)*1000+gap;
            if(score>bestScore){bestScore=score;bestP=p;}
          });
          if(bestP){newA[aKey(rYear,rMonth,d,e.id)]=bestP.id;filled[bestP.id]+=HPD;empH[e.id]+=HPD;}
        });
    });
    setAssigns(newA);
    const rows=Object.entries(newA)
      .filter(([k])=>k.startsWith(`${rYear}-${rMonth}-`))
      .map(([k,pid])=>{const[y,m,d,eId]=k.split('-');return{year:+y,month:+m,day:+d,employee_id:eId,project_id:pid};});
    supabase.from('assignments').delete().eq('year',rYear).eq('month',rMonth)
      .then(()=>rows.length&&supabase.from('assignments').insert(rows).then(({error})=>{if(error)showToast(error.message);}));
  }

  const YEARS = Array.from({length:6},(_,i)=>NOW.getFullYear()-1+i);
  const MonthSel=({val,set})=><select value={val} onChange={e=>set(+e.target.value)} style={selSt({width:"auto"})}>{MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}</select>;
  const YearSel=({val,set})=><select value={val} onChange={e=>set(+e.target.value)} style={selSt({width:"auto"})}>{YEARS.map(y=><option key={y}>{y}</option>)}</select>;

  // ── PROJECT MODAL ────────────────────────────────────────────────────────────
  function ProjectModal() {
    const p=pRef.current; if(!p) return null;
    const [name,setName]     = useState(p.name);
    const [client,setClient] = useState(p.client);
    const [budget,setBudget] = useState(p.budget);
    const [cor,setCor]       = useState(p.chargeOutRate||"");
    const [totalInput,setTI] = useState(p.totalInput||"");
    const [totalUnit,setTU]  = useState(p.totalUnit||"days");
    const [staffMode,setSM]  = useState(p.staffMode||"flexible");
    const [fixedStaff,setFS] = useState(p.fixedStaff||"");
    const [color,setColor]   = useState(p.color);
    const [strengths,setStr] = useState([...(p.strengthsRequired||[])]);
    const [sm,setSm]         = useState(p.startMonth);
    const [sy,setSy]         = useState(p.startYear);
    const [em,setEm]         = useState(p.endMonth);
    const [ey,setEy]         = useState(p.endYear);
    const [hours,setHours]   = useState({...p.monthlyHours});
    const [notes,setNotes]   = useState(p.notes);
    const [isCompleted,setIsCompleted] = useState(p.isCompleted||false);
    const [,rerender]        = useState(0);
    const sync=patch=>Object.assign(pRef.current,patch);
    const localMonths=getProjectMonths({startMonth:sm,startYear:sy,endMonth:em,endYear:ey});
    const budH=totalBudgetHours({budget,chargeOutRate:cor});
    const totalAllocH=localMonths.reduce((a,{y,m})=>{const k=pmKey(y,m);return a+(hours[k]!==undefined?hours[k]:wdInMonth(y,m)*HPD);},0);
    const tH=totalInputHours({totalInput,totalUnit});
    const diff=tH!==null?totalAllocH-tH:null;
    function doSpread() { const s=spreadAcrossMonths({...pRef.current,totalInput,totalUnit});setHours(s);sync({monthlyHours:s});rerender(r=>r+1); }
    function setMonthVal(key,raw) { const v=parseFloat(raw)||0;const stored=totalUnit==="hours"?v:v*HPD;const next={...hours,[key]:stored};setHours(next);sync({monthlyHours:next}); }
    function clearMonthVal(key) { const next={...hours};delete next[key];setHours(next);sync({monthlyHours:next}); }
    function switchUnit(u) { setTU(u);sync({totalUnit:u});const s=spreadAcrossMonths({...pRef.current,totalUnit:u});if(Object.keys(s).length){setHours(s);sync({monthlyHours:s});}rerender(r=>r+1); }
    const close=()=>{setProjMod(null);pRef.current=null;};
    return (
      <Overlay onClose={close}>
        <ModalBox>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <h3 style={{margin:0,fontSize:18,fontWeight:700,color:"#111827"}}>{projMod==="new"?"New project":"Edit project"}</h3>
            <Btn onClick={close}>Cancel</Btn>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <Row2>
              <div><Lbl>Project name *</Lbl><FocusInp value={name} placeholder="e.g. Riverside Park" onChange={e=>{setName(e.target.value);sync({name:e.target.value});}}/></div>
              <div><Lbl>Client</Lbl><FocusInp value={client} placeholder="e.g. City Council" onChange={e=>{setClient(e.target.value);sync({client:e.target.value});}}/></div>
            </Row2>
            <Row2>
              <div><Lbl>Total budget ($)</Lbl><FocusInp type="number" value={budget} placeholder="e.g. 250000" onChange={e=>{setBudget(e.target.value);sync({budget:e.target.value});rerender(r=>r+1);}}/></div>
              <div><Lbl>Charge-out rate ($/hr)</Lbl><FocusInp type="number" value={cor} placeholder="e.g. 85" onChange={e=>{setCor(e.target.value);sync({chargeOutRate:e.target.value});rerender(r=>r+1);}}/></div>
            </Row2>
            <div>
              <Lbl>Total project allocation</Lbl>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <FocusInp type="number" value={totalInput} placeholder={totalUnit==="days"?"e.g. 45":"e.g. 360"} style={{flex:1,width:"auto"}}
                  onChange={e=>{setTI(e.target.value);sync({totalInput:e.target.value});rerender(r=>r+1);}}/>
                <ToggleBtn options={[["days","Days"],["hours","Hours"]]} value={totalUnit} onChange={switchUnit}/>
              </div>
              {totalInput&&parseFloat(totalInput)>0&&(
                <div style={{marginTop:5,fontSize:12,color:"#6b7280"}}>
                  {totalUnit==="days"?<>= <b style={{color:"#111827"}}>{parseFloat(totalInput)*HPD}h</b> total</>:<>= <b style={{color:"#111827"}}>{(parseFloat(totalInput)/HPD).toFixed(1)} days</b> equiv</>}
                </div>
              )}
              {budget&&cor&&parseFloat(budget)>0&&parseFloat(cor)>0&&(
                <div style={{marginTop:4,fontSize:12,color:"#6b7280"}}>
                  💡 Budget implies <b style={{color:"#111827"}}>{Math.round(parseFloat(budget)/parseFloat(cor)/HPD)} days</b> ({Math.round(parseFloat(budget)/parseFloat(cor))}h) at ${cor}/hr
                </div>
              )}
            </div>
            <div>
              <Lbl>Daily staff requirement</Lbl>
              <ToggleBtn options={[["flexible","Flexible"],["fixed","Fixed team size"]]} value={staffMode} onChange={v=>{setSM(v);sync({staffMode:v});}}/>
              <div style={{marginTop:10}}>
                {staffMode==="flexible"
                  ?<div style={{fontSize:13,color:"#6b7280",padding:"10px 14px",background:"#f9fafb",border:"1.5px solid #e5e7eb",borderRadius:8}}>Staff can vary day to day — assign whoever is needed when building the roster.</div>
                  :<div style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:"#eff6ff",border:"1.5px solid #bfdbfe",borderRadius:8}}>
                    <span style={{fontSize:13,color:"#1d4ed8",whiteSpace:"nowrap"}}>Exactly</span>
                    <FocusInp type="number" value={fixedStaff} placeholder="e.g. 4" style={{width:80,textAlign:"center"}} onChange={e=>{setFS(e.target.value);sync({fixedStaff:e.target.value});}}/>
                    <span style={{fontSize:13,color:"#1d4ed8"}}>staff required on site every day.</span>
                  </div>}
              </div>
            </div>
            <div>
              <Lbl>Project colour</Lbl>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {PROJ_COLORS.map(c=><button key={c} type="button" onClick={()=>{setColor(c);sync({color:c});}} style={{width:28,height:28,borderRadius:"50%",background:c,border:color===c?"3px solid #111827":"2px solid transparent",cursor:"pointer"}}/>)}
              </div>
            </div>
            <div>
              <Lbl>Strengths required</Lbl>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,padding:10,border:"1.5px solid #e5e7eb",borderRadius:8,background:"#fafafa"}}>
                {STRENGTHS.map(st=>(
                  <StrBtn key={st} label={st} active={strengths.includes(st)}
                    onClick={()=>{const n=strengths.includes(st)?strengths.filter(x=>x!==st):[...strengths,st];setStr(n);sync({strengthsRequired:n});}}/>
                ))}
              </div>
            </div>
            <div>
              <Lbl>Project dates</Lbl>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 20px 1fr 1fr",gap:8,alignItems:"center"}}>
                <select style={selSt({width:"100%"})} value={sm} onChange={e=>{setSm(e.target.value);sync({startMonth:e.target.value});rerender(r=>r+1);}}>{MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}</select>
                <select style={selSt({width:"100%"})} value={sy} onChange={e=>{setSy(e.target.value);sync({startYear:e.target.value});rerender(r=>r+1);}}>{YEARS.map(y=><option key={y}>{y}</option>)}</select>
                <span style={{textAlign:"center",color:"#9ca3af"}}>→</span>
                <select style={selSt({width:"100%"})} value={em} onChange={e=>{setEm(e.target.value);sync({endMonth:e.target.value});rerender(r=>r+1);}}>{MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}</select>
                <select style={selSt({width:"100%"})} value={ey} onChange={e=>{setEy(e.target.value);sync({endYear:e.target.value});rerender(r=>r+1);}}>{YEARS.map(y=><option key={y}>{y}</option>)}</select>
              </div>
            </div>
            {localMonths.length===0
              ?<p style={{fontSize:13,color:"#9ca3af",margin:0}}>Set project dates above to configure monthly allocations.</p>
              :<div>
                <Lbl>Monthly allocation ({totalUnit})</Lbl>
                <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"center",marginBottom:10,padding:"10px 14px",background:"#f9fafb",border:"1.5px solid #e5e7eb",borderRadius:8}}>
                  {tH&&<span style={{fontSize:13,color:"#374151"}}>Target: <b style={{color:"#111827"}}>{totalUnit==="hours"?fmtH(tH):`${Math.round(tH/HPD)}d`}</b></span>}
                  <span style={{fontSize:13,color:"#374151"}}>Allocated: <b style={{color:"#111827"}}>{totalUnit==="hours"?fmtH(totalAllocH):`${Math.round(totalAllocH/HPD)}d`}</b></span>
                  {diff!==null&&<span style={{fontSize:13,fontWeight:600,color:diff>0.5?"#dc2626":diff<-0.5?"#d97706":"#059669"}}>
                    {diff>0.5?`+${totalUnit==="hours"?fmtH(diff):`${Math.round(diff/HPD)}d`} over`:diff<-0.5?`${totalUnit==="hours"?fmtH(Math.abs(diff)):`${Math.round(Math.abs(diff)/HPD)}d`} unallocated`:"✓ Fully allocated"}
                  </span>}
                </div>
                <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
                  <Btn style={{fontSize:12,padding:"6px 12px"}} onClick={doSpread}>{tH?`Spread ${totalUnit==="hours"?fmtH(tH):`${Math.round(tH/HPD)}d`} across months`:"Auto-fill working "+totalUnit}</Btn>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(148px,1fr))",gap:8}}>
                  {localMonths.map(({y,m})=>{
                    const key=pmKey(y,m);
                    const wd=wdInMonth(y,m);
                    const hasOv=hours[key]!==undefined;
                    const stored=hasOv?hours[key]:wd*HPD;
                    const isH=totalUnit==="hours";
                    const displayVal=isH?Math.round(stored*10)/10:Math.round(stored/HPD);
                    const mb=monthBudgetSlice({...pRef.current,startMonth:sm,startYear:sy,endMonth:em,endYear:ey},y,m);
                    const mRev=cor&&parseFloat(cor)>0?stored*parseFloat(cor):null;
                    return (
                      <div key={key} style={{background:hasOv?"#fffbeb":"#f9fafb",border:`1.5px solid ${hasOv?"#fcd34d":"#e5e7eb"}`,borderRadius:8,padding:"10px 12px"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
                          <span style={{fontSize:12,fontWeight:600,color:"#374151"}}>{MONTHS[m].slice(0,3)} {y}</span>
                          {hasOv&&<span style={{fontSize:10,color:"#b45309"}}>edited</span>}
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                          <input type="number" min={0} value={displayVal}
                            style={inpSt({width:64,padding:"6px 8px",textAlign:"center"})}
                            onChange={e=>setMonthVal(key,e.target.value)}
                            onFocus={e=>e.target.style.borderColor="#4f46e5"}
                            onBlur={e=>e.target.style.borderColor="#d1d5db"}/>
                          <span style={{fontSize:11,color:"#9ca3af"}}>{isH?`h / ${wd*HPD}h`:`d / ${wd}d`}</span>
                        </div>
                        <div style={{fontSize:11,color:"#6b7280",lineHeight:1.6}}>
                          {isH?<div>{(stored/HPD).toFixed(1)}d equiv</div>:<div>{stored}h total</div>}
                          {mb&&<div>Budget: {fmt$(mb)}</div>}
                          {mRev&&<div>Revenue: {fmt$(mRev)}</div>}
                        </div>
                        {hasOv&&<button type="button" onClick={()=>clearMonthVal(key)} style={{marginTop:5,fontSize:10,color:"#9ca3af",background:"none",border:"none",cursor:"pointer",padding:0}}>↩ reset</button>}
                      </div>
                    );
                  })}
                </div>
              </div>
            }
            <div><Lbl>Notes</Lbl><FocusTxt value={notes} placeholder="Any additional notes..." onChange={e=>{setNotes(e.target.value);sync({notes:e.target.value});}}/></div>
            <div style={{paddingTop:12,borderTop:"1.5px solid #e5e7eb"}}>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13}}>
                <input type="checkbox" checked={isCompleted} onChange={e=>{setIsCompleted(e.target.checked);sync({isCompleted:e.target.checked});}} style={{width:18,height:18,cursor:"pointer"}}/>
                <span style={{color:isCompleted?"#059669":"#6b7280",fontWeight:500}}>Mark project as completed</span>
              </label>
              {isCompleted&&<p style={{fontSize:11,color:"#059669",margin:"6px 0 0 26px"}}>✓ This project will not appear in active scheduling.</p>}
            </div>
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:20,paddingTop:16,borderTop:"1px solid #e5e7eb"}}>
            <Btn onClick={close}>Cancel</Btn>
            <BtnPri onClick={saveProj}>Save project</BtnPri>
          </div>
        </ModalBox>
      </Overlay>
    );
  }

  // ── EMPLOYEE MODAL ───────────────────────────────────────────────────────────
  function EmployeeModal() {
    const e0=eRef.current; if(!e0) return null;
    const [name,setName]   = useState(e0.name);
    const [role,setRole]   = useState(e0.role);
    const [type,setType]   = useState(e0.type);
    const [rate,setRate]   = useState(e0.rate);
    const [phone,setPhone] = useState(e0.phone);
    const [email,setEmail] = useState(e0.email);
    const [maxH,setMaxH]   = useState(e0.maxHoursPerMonth);
    const [str,setStr]     = useState([...e0.strengths]);
    const [avail,setAvail] = useState({...e0.availability});
    const [notes,setNotes] = useState(e0.notes);
    const sync=patch=>Object.assign(eRef.current,patch);
    const close=()=>{setEmpMod(null);eRef.current=null;};
    return (
      <Overlay onClose={close}>
        <ModalBox>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <h3 style={{margin:0,fontSize:18,fontWeight:700,color:"#111827"}}>{empMod==="new"?"New employee":"Edit employee"}</h3>
            <Btn onClick={close}>Cancel</Btn>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <Row2>
              <div><Lbl>Full name *</Lbl><FocusInp value={name} placeholder="e.g. Jane Smith" onChange={e=>{setName(e.target.value);sync({name:e.target.value});}}/></div>
              <div><Lbl>Role</Lbl><select style={selSt({width:"100%"})} value={role} onChange={e=>{setRole(e.target.value);sync({role:e.target.value});}}>{ROLES.map(r=><option key={r}>{r}</option>)}</select></div>
            </Row2>
            <Row2>
              <div><Lbl>Employment type</Lbl><select style={selSt({width:"100%"})} value={type} onChange={e=>{setType(e.target.value);sync({type:e.target.value});}}>{EMP_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
              <div><Lbl>Hourly rate ($)</Lbl><FocusInp type="number" value={rate} placeholder="e.g. 35" onChange={e=>{setRate(e.target.value);sync({rate:e.target.value});}}/></div>
            </Row2>
            <Row2>
              <div><Lbl>Phone</Lbl><FocusInp value={phone} placeholder="04xx xxx xxx" onChange={e=>{setPhone(e.target.value);sync({phone:e.target.value});}}/></div>
              <div><Lbl>Email</Lbl><FocusInp value={email} placeholder="jane@company.com" onChange={e=>{setEmail(e.target.value);sync({email:e.target.value});}}/></div>
            </Row2>
            <div>
              <Lbl>Max hours per month</Lbl>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <FocusInp type="number" value={maxH} style={{width:110}} onChange={e=>{const v=parseInt(e.target.value)||160;setMaxH(v);sync({maxHoursPerMonth:v});}}/>
                <span style={{fontSize:13,color:"#6b7280"}}>{Math.round(maxH/HPD)} days</span>
              </div>
            </div>
            <div>
              <Lbl>Strengths</Lbl>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,padding:10,border:"1.5px solid #e5e7eb",borderRadius:8,background:"#fafafa"}}>
                {STRENGTHS.map(s=><StrBtn key={s} label={s} active={str.includes(s)} onClick={()=>{const n=str.includes(s)?str.filter(x=>x!==s):[...str,s];setStr(n);sync({strengths:n});}}/>)}
              </div>
            </div>
            <div>
              <Lbl>Weekly availability</Lbl>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {DAYS_SHORT.map(d=>(
                  <button key={d} type="button" onClick={()=>{const n={...avail,[d]:!avail[d]};setAvail(n);sync({availability:n});}}
                    style={{padding:"8px 12px",borderRadius:8,border:"1.5px solid",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:500,background:avail[d]?"#dcfce7":"#f9fafb",color:avail[d]?"#166534":"#6b7280",borderColor:avail[d]?"#86efac":"#e5e7eb"}}>{d}</button>
                ))}
              </div>
            </div>
            <div><Lbl>Notes</Lbl><FocusTxt value={notes} placeholder="Any additional notes..." onChange={e=>{setNotes(e.target.value);sync({notes:e.target.value});}}/></div>
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:20,paddingTop:16,borderTop:"1px solid #e5e7eb"}}>
            <Btn onClick={close}>Cancel</Btn>
            <BtnPri onClick={saveEmp}>Save employee</BtnPri>
          </div>
        </ModalBox>
      </Overlay>
    );
  }

  // ── DAY EDITOR ───────────────────────────────────────────────────────────────
  function DayEditorModal({day}) {
    const dl=dlabel(rYear,rMonth,day);
    const assigned =employees.filter(e=> getA(rYear,rMonth,day,e.id));
    const available=employees.filter(e=>!getA(rYear,rMonth,day,e.id)&& e.availability[dl]);
    const unavail  =employees.filter(e=>!getA(rYear,rMonth,day,e.id)&&!e.availability[dl]);
    // Returns {n, total} if project has requirements, null otherwise
    const skillMatch=(e,p)=>{
      const total=p.strengthsRequired?.length||0;
      if(!total) return null;
      return {n:e.strengths.filter(s=>p.strengthsRequired.includes(s)).length,total};
    };
    return (
      <Overlay onClose={()=>setDayEd(null)}>
        <ModalBox maxWidth={540}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div>
              <div style={{fontSize:18,fontWeight:700,color:"#111827"}}>{dl} {day} {MONTHS[rMonth]} {rYear}</div>
              <div style={{fontSize:13,color:"#6b7280",marginTop:2}}>{assigned.length} staff on site</div>
            </div>
            <Btn onClick={()=>setDayEd(null)}>Close</Btn>
          </div>
          {projects.length>0&&(
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
              {projects.map(p=>{
                const count=assigned.filter(e=>getA(rYear,rMonth,day,e.id)===p.id).length;
                const fixed=p.staffMode==="fixed"&&p.fixedStaff?parseInt(p.fixedStaff):null;
                const ok=fixed===null||count===fixed;
                const bg=fixed===null?"#f3f4f6":ok?"#dcfce7":"#fee2e2";
                const col=fixed===null?"#6b7280":ok?"#166534":"#dc2626";
                const border=ok?(fixed===null?"#e5e7eb":"#86efac"):"#fca5a5";
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
          <SecTitle>On site ({assigned.length})</SecTitle>
          {assigned.length===0&&<p style={{fontSize:13,color:"#9ca3af",marginBottom:12}}>No one assigned — add staff below.</p>}
          {assigned.map(e=>{
            const pid=getA(rYear,rMonth,day,e.id);
            return (
              <div key={e.id} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",border:"1.5px solid #e5e7eb",borderRadius:10,background:"#fafafa",marginBottom:6}}>
                <Avatar name={e.name} color={projColor(pid)}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:500,color:"#111827"}}>{e.name}</div>
                  <div style={{fontSize:12,color:"#6b7280"}}>{e.role}</div>
                </div>
                <select value={pid} onChange={ev=>setA(rYear,rMonth,day,e.id,ev.target.value)} style={selSt({fontSize:13,padding:"6px 10px"})}>
                  {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button onClick={()=>setA(rYear,rMonth,day,e.id,null)} style={{border:"none",background:"none",cursor:"pointer",color:"#9ca3af",fontSize:20,lineHeight:1,padding:"0 4px"}}>✕</button>
              </div>
            );
          })}
          {available.length>0&&(
            <div style={{marginTop:16}}>
              <SecTitle>Available to add ({available.length})</SecTitle>
              {available.map(e=>(
                <div key={e.id} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",border:"1.5px solid #e5e7eb",borderRadius:10,background:"#fff",marginBottom:6}}>
                  <Avatar name={e.name}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:500,color:"#111827"}}>{e.name}</div>
                    <div style={{fontSize:12,color:"#6b7280"}}>
                      {e.role}
                      {e.rate&&<span style={{marginLeft:8,color:"#6b7280"}}>· ${e.rate}/hr</span>}
                      {e.strengths?.length?` · ${e.strengths.slice(0,3).join(", ")}${e.strengths.length>3?` +${e.strengths.length-3}`:""}`:""}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"flex-end"}}>
                    {projects.map(p=>{
                      const sm=skillMatch(e,p);
                      const badgeCol=sm?(sm.n===sm.total?"#059669":sm.n>0?"#d97706":"#dc2626"):null;
                      return (
                        <div key={p.id} style={{display:"flex",gap:0}}>
                          <button
                            title={`Assign ${e.name} to ${p.name} today`}
                            onClick={()=>setA(rYear,rMonth,day,e.id,p.id)}
                            style={{padding:"5px 10px",borderRadius:"8px 0 0 8px",border:`1.5px solid ${p.color}`,borderRight:"none",background:`${p.color}14`,color:badgeCol||p.color,fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                            + {p.name}{sm?` ${sm.n}/${sm.total}★`:""}
                          </button>
                          <button
                            title={`Assign ${e.name} to ${p.name} for all available weekdays this month`}
                            onClick={()=>bulkAssignEmpToProj(e.id,p.id)}
                            style={{padding:"5px 8px",borderRadius:"0 8px 8px 0",border:`1.5px solid ${p.color}`,background:`${p.color}22`,color:p.color,fontSize:11,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",fontWeight:500}}>
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
          {unavail.length>0&&(
            <div style={{marginTop:16}}>
              <SecTitle>Unavailable today ({unavail.length})</SecTitle>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {unavail.map(e=><span key={e.id} style={{fontSize:12,padding:"4px 10px",borderRadius:99,background:"#fee2e2",color:"#991b1b",border:"1px solid #fecaca",fontWeight:500}}>⊘ {e.name}</span>)}
              </div>
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
          <h3 style={{margin:0,fontSize:16,fontWeight:600,color:"#111827"}}>Projects <span style={{fontWeight:400,color:"#6b7280"}}>({active.length}{completed.length>0?`+${completed.length} completed`:""})</span></h3>
          <BtnPri onClick={()=>openProjMod(null)}>+ Add project</BtnPri>
        </div>
        {projects.length===0&&<Empty icon="🌿" title="No projects yet" sub='Click "Add project" to get started'/>}
        {active.length===0&&completed.length>0&&<p style={{fontSize:13,color:"#9ca3af",marginBottom:16}}>All projects completed! 🎉</p>}
        {active.map(p=>{
          const months=getProjectMonths(p);
          const budH=totalBudgetHours(p);
          const tH=totalInputHours(p);
          const totalAllocH=months.reduce((a,{y,m})=>a+monthAllocH(p,y,m),0);
          return (
            <div key={p.id} style={cardSt({borderLeft:`4px solid ${p.color}`})}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:16,fontWeight:600,color:"#111827"}}>{p.name}</div>
                  {p.client&&<div style={{fontSize:13,color:"#6b7280",marginTop:2}}>{p.client}</div>}
                  <div style={{marginTop:8,display:"flex",gap:6,flexWrap:"wrap"}}>
                    {p.budget&&<Tag bg="#eff6ff" col="#1d4ed8">Budget: {fmt$(p.budget)}</Tag>}
                    {p.chargeOutRate&&<Tag bg="#fef9c3" col="#713f12">Charge-out: ${p.chargeOutRate}/hr</Tag>}
                    {tH&&<Tag bg="#ecfdf5" col="#065f46">Allocation: {p.totalUnit==="hours"?fmtH(tH):`${Math.round(tH/HPD)}d`}</Tag>}
                    {budH&&!tH&&<Tag bg="#ecfdf5" col="#065f46">Budget: {Math.round(budH/HPD)}d ({Math.round(budH)}h)</Tag>}
                    {months.length>0&&<Tag bg="#fef3c7" col="#92400e">{MONTHS[+p.startMonth].slice(0,3)} {p.startYear} – {MONTHS[+p.endMonth].slice(0,3)} {p.endYear}</Tag>}
                    {p.staffMode==="fixed"&&p.fixedStaff?<Tag bg="#eff6ff" col="#1d4ed8">Fixed: {p.fixedStaff} staff/day</Tag>:<Tag bg="#f3f4f6" col="#6b7280">Flexible staffing</Tag>}
                  </div>
                  {p.strengthsRequired?.length>0&&<div style={{marginTop:6,display:"flex",gap:4,flexWrap:"wrap"}}>{p.strengthsRequired.map(s=><Tag key={s} bg="#ecfdf5" col="#065f46">{s}</Tag>)}</div>}
                  {months.length>0&&(
                    <div style={{marginTop:8,display:"flex",gap:4,flexWrap:"wrap"}}>
                      {months.map(({y,m})=>{
                        const h=monthAllocH(p,y,m);
                        const mb=monthBudgetSlice(p,y,m);
                        const display=p.totalUnit==="hours"?fmtH(h):`${Math.round(h/HPD)}d`;
                        return <span key={pmKey(y,m)} style={{fontSize:12,padding:"3px 8px",borderRadius:6,background:"#f9fafb",border:"1px solid #e5e7eb",color:"#374151"}}>{MONTHS[m].slice(0,3)} {y}: <b style={{color:"#111827"}}>{display}</b>{mb?` · ${fmt$(mb)}`:""}</span>;
                      })}
                    </div>
                  )}
                  {months.length>0&&tH&&(
                    <div style={{marginTop:6,fontSize:12,fontWeight:500,color:totalAllocH>tH+0.5?"#dc2626":totalAllocH<tH-0.5?"#d97706":"#059669"}}>
                      Allocated: {p.totalUnit==="hours"?fmtH(totalAllocH):`${Math.round(totalAllocH/HPD)}d`} / {p.totalUnit==="hours"?fmtH(tH):`${Math.round(tH/HPD)}d`} target
                      {totalAllocH>tH+0.5?" — over":totalAllocH<tH-0.5?" — under":" ✓"}
                    </div>
                  )}
                  {p.notes&&<div style={{fontSize:13,color:"#6b7280",marginTop:8}}>{p.notes}</div>}
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
          <div style={{marginTop:20,paddingTop:16,borderTop:"2px solid #e5e7eb"}}>
            <h4 style={{margin:"0 0 12px",fontSize:14,fontWeight:600,color:"#6b7280"}}>✓ Completed ({completed.length})</h4>
            {completed.map(p=>(
              <div key={p.id} style={cardSt({opacity:0.7,borderLeft:`4px solid ${p.color}`})}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:15,fontWeight:600,color:"#6b7280",textDecoration:"line-through"}}>{p.name}</div>
                    {p.client&&<div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>{p.client}</div>}
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
          <h3 style={{margin:0,fontSize:16,fontWeight:600,color:"#111827"}}>Employees <span style={{fontWeight:400,color:"#6b7280"}}>({employees.length})</span></h3>
          <BtnPri onClick={()=>openEmpMod(null)}>+ Add employee</BtnPri>
        </div>
        {employees.length===0&&<Empty icon="👷" title="No employees yet" sub='Click "Add employee" to get started'/>}
        {employees.map(e=>(
          <div key={e.id} style={cardSt()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
              <div style={{display:"flex",gap:12,alignItems:"flex-start",flex:1}}>
                <Avatar name={e.name} color="#4f46e5"/>
                <div>
                  <div style={{fontSize:15,fontWeight:600,color:"#111827"}}>{e.name}</div>
                  <div style={{marginTop:5,display:"flex",gap:5,flexWrap:"wrap"}}>
                    <Tag bg="#eef2ff" col="#3730a3">{e.type}</Tag>
                    <Tag bg="#f0f9ff" col="#075985">{e.role}</Tag>
                    {e.rate&&<Tag bg="#ecfdf5" col="#065f46">${e.rate}/hr</Tag>}
                    <Tag bg="#fef9c3" col="#713f12">{e.maxHoursPerMonth}h/mo · {Math.round(e.maxHoursPerMonth/HPD)}d</Tag>
                  </div>
                  {e.strengths?.length>0&&<div style={{marginTop:6,display:"flex",gap:4,flexWrap:"wrap"}}>{e.strengths.map(s=><Tag key={s} bg="#ecfdf5" col="#065f46">{s}</Tag>)}</div>}
                  <div style={{marginTop:7,display:"flex",gap:4,flexWrap:"wrap"}}>
                    {DAYS_SHORT.map(d=><span key={d} style={{fontSize:11,padding:"2px 6px",borderRadius:4,background:e.availability[d]?"#dcfce7":"#f3f4f6",color:e.availability[d]?"#166534":"#9ca3af",fontWeight:e.availability[d]?500:400}}>{d}</span>)}
                  </div>
                  {e.notes&&<div style={{fontSize:13,color:"#6b7280",marginTop:6}}>{e.notes}</div>}
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
          <div style={{marginLeft:"auto",display:"flex",border:"1.5px solid #d1d5db",borderRadius:8,overflow:"hidden"}}>
            {[["calendar","Calendar"],["employees","By employee"]].map(([v,label])=>(
              <button key={v} type="button" onClick={()=>setRView(v)}
                style={{padding:"8px 14px",border:"none",fontFamily:"inherit",fontSize:13,fontWeight:500,cursor:"pointer",background:rosterView===v?"#4f46e5":"#fff",color:rosterView===v?"#fff":"#374151",whiteSpace:"nowrap"}}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {activeProjects.length>0&&(
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
            {activeProjects.map(p=>{
              const target=monthAllocH(p,rYear,rMonth);
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
        {(activeProjects.length===0||employees.length===0)&&<div style={{textAlign:"center",padding:32,border:"2px dashed #e5e7eb",borderRadius:12,color:"#9ca3af",fontSize:14}}>Add projects and employees first to start building the roster.</div>}
        {activeProjects.length>0&&employees.length>0&&rosterView==="calendar"&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:4}}>
              {DAYS_SHORT.map(d=><div key={d} style={{fontSize:12,fontWeight:600,textAlign:"center",color:"#6b7280",padding:"4px 0"}}>{d}</div>)}
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
                      onClick={()=>{ if(!wknd) setDayEd(day); }}
                      onMouseEnter={e=>{if(!wknd){e.currentTarget.style.borderColor="#a5b4fc";e.currentTarget.style.boxShadow="0 0 0 3px #eef2ff";}}}
                      onMouseLeave={e=>{e.currentTarget.style.borderColor="#e5e7eb";e.currentTarget.style.boxShadow="none";}}
                      style={{border:"1.5px solid #e5e7eb",borderRadius:10,padding:"6px 7px",minHeight:72,background:wknd?"#f9fafb":"#fff",cursor:wknd?"default":"pointer",transition:"border-color 0.12s,box-shadow 0.12s"}}>
                      <div style={{fontSize:12,fontWeight:600,color:wknd?"#9ca3af":"#374151",marginBottom:4}}>{day}</div>
                      {!wknd&&Object.entries(byProj).map(([pid,count])=>(
                        <div key={pid} style={{display:"flex",alignItems:"center",gap:3,marginBottom:2}}>
                          <span style={{width:7,height:7,borderRadius:"50%",background:projColor(pid),flexShrink:0}}/>
                          <span style={{fontSize:10,color:"#374151",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{count} · {projNameOf(pid).slice(0,9)}{projNameOf(pid).length>9?"…":""}</span>
                        </div>
                      ))}
                      {!wknd&&Object.keys(byProj).length===0&&<span style={{fontSize:10,color:"#d1d5db"}}>Tap to add</span>}
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
                  <th style={{textAlign:"left",padding:"6px 12px",fontWeight:600,color:"#6b7280",borderBottom:"1.5px solid #e5e7eb",minWidth:140,position:"sticky",left:0,background:"#fff",zIndex:1}}>Employee</th>
                  {calDays.map(d=>{
                    const wknd=isWknd(rYear,rMonth,d);
                    return (
                      <th key={d} style={{padding:"3px 1px",textAlign:"center",color:wknd?"#d1d5db":"#6b7280",fontWeight:500,borderBottom:"1.5px solid #e5e7eb",minWidth:28}}>
                        <div style={{fontSize:11}}>{d}</div>
                        <div style={{fontSize:9,marginTop:1}}>{dlabel(rYear,rMonth,d).slice(0,1)}</div>
                      </th>
                    );
                  })}
                  <th style={{padding:"6px 10px",textAlign:"right",fontWeight:600,color:"#6b7280",borderBottom:"1.5px solid #e5e7eb",whiteSpace:"nowrap",minWidth:80}}>Scheduled</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(e=>{
                  const sch=empMonthH(e.id);
                  const pct=e.maxHoursPerMonth>0?Math.round(sch/e.maxHoursPerMonth*100):0;
                  return (
                    <tr key={e.id} style={{borderBottom:"1px solid #f3f4f6"}}>
                      <td style={{padding:"8px 12px",fontWeight:500,color:"#111827",fontSize:13,whiteSpace:"nowrap",position:"sticky",left:0,background:"#fff",zIndex:1}}>
                        <div>{e.name}</div>
                        <div style={{fontSize:11,color:"#9ca3af",fontWeight:400}}>{e.role}</div>
                      </td>
                      {calDays.map(d=>{
                        const wknd=isWknd(rYear,rMonth,d);
                        const pid=getA(rYear,rMonth,d,e.id);
                        const dl2=dlabel(rYear,rMonth,d);
                        const avail=e.availability[dl2];
                        return (
                          <td key={d}
                            onClick={()=>{ if(!wknd) setDayEd(d); }}
                            title={pid?`${e.name} → ${projNameOf(pid)}`:undefined}
                            style={{padding:"3px 1px",textAlign:"center",background:wknd?"#f9fafb":pid?projColor(pid)+"28":"#fff",cursor:wknd?"default":"pointer",borderLeft:"1px solid #f3f4f6"}}>
                            {pid&&<span style={{display:"block",width:10,height:10,borderRadius:"50%",background:projColor(pid),margin:"0 auto"}}/>}
                            {!pid&&!wknd&&!avail&&<span style={{color:"#e5e7eb",fontSize:9}}>–</span>}
                          </td>
                        );
                      })}
                      <td style={{padding:"8px 10px",textAlign:"right",whiteSpace:"nowrap"}}>
                        <span style={{fontSize:12,fontWeight:600,color:pct>=100?"#dc2626":pct>=80?"#d97706":"#374151"}}>{Math.round(sch/HPD)}d</span>
                        <span style={{fontSize:11,color:"#9ca3af"}}> / {Math.round(e.maxHoursPerMonth/HPD)}d</span>
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
          <div style={{fontSize:16,fontWeight:600,color:"#111827",marginBottom:14}}>Overall — {MONTHS[rMonth]} {rYear}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:14}}>
            {[
              {l:"Total capacity",v:fmtH(cap),s:`${employees.length} staff`,danger:false},
              {l:"Scheduled",v:fmtH(sched),s:`${pct}% utilised`,danger:false},
              {l:"Remaining",v:fmtH(Math.max(rem,0)),s:rem<0?"Over capacity":"Available",danger:rem<0},
              {l:"Working days",v:wdInMonth(rYear,rMonth)+"d",s:"this month",danger:false},
            ].map(x=>(
              <div key={x.l} style={{background:x.danger?"#fef2f2":"#f9fafb",borderRadius:10,padding:"12px 14px",border:`1.5px solid ${x.danger?"#fecaca":"#e5e7eb"}`}}>
                <div style={{fontSize:12,color:"#6b7280",marginBottom:2}}>{x.l}</div>
                <div style={{fontSize:22,fontWeight:700,color:x.danger?"#dc2626":"#111827"}}>{x.v}</div>
                <div style={{fontSize:11,color:x.danger?"#dc2626":"#9ca3af"}}>{x.s}</div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#6b7280",marginBottom:4}}><span>Utilisation</span><span style={{fontWeight:500}}>{pct}%</span></div>
          <ProgBar pct={pct} color="#4f46e5"/>
        </div>
        <div style={{fontSize:14,fontWeight:600,color:"#111827",marginBottom:10}}>By project</div>
        {activeProjects.length===0&&<p style={{fontSize:13,color:"#9ca3af"}}>No active projects.</p>}
        {activeProjects.map(p=>{
          const manH=projManH(p.id),target=monthAllocH(p,rYear,rMonth),pct2=target>0?Math.round(manH/target*100):0;
          const mb=monthBudgetSlice(p,rYear,rMonth),lc=labourCostM(p.id),rev=revenueM(p),margin=rev!==null&&lc>0?rev-lc:null;
          const isH=p.totalUnit==="hours";
          const metrics=[
            {l:"Scheduled",v:isH?`${fmtH(manH)} / ${fmtH(target)}`:`${Math.round(manH/HPD)}d / ${Math.round(target/HPD)}d`},
            mb?{l:"Monthly budget",v:fmt$(mb)}:null,
            lc>0?{l:"Labour cost",v:fmt$(lc)}:null,
            rev?{l:"Revenue",v:fmt$(rev)}:null,
            margin!==null?{l:"Margin",v:fmt$(margin),danger:margin<0}:null,
            mb&&lc>0?{l:"Budget left",v:fmt$(mb-lc),danger:lc>mb}:null,
          ].filter(Boolean);
          return (
            <div key={p.id} style={cardSt({borderLeft:`4px solid ${p.color}`})}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:10,alignItems:"baseline"}}>
                <span style={{fontSize:15,fontWeight:600,color:"#111827"}}>{p.name}</span>
                {p.client&&<span style={{fontSize:12,color:"#6b7280"}}>{p.client}</span>}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8,marginBottom:10}}>
                {metrics.map(x=>(
                  <div key={x.l} style={{background:x.danger?"#fef2f2":"#f9fafb",borderRadius:8,padding:"10px 12px",border:`1px solid ${x.danger?"#fecaca":"#e5e7eb"}`}}>
                    <div style={{fontSize:11,color:"#6b7280"}}>{x.l}</div>
                    <div style={{fontSize:17,fontWeight:700,color:x.danger?"#dc2626":"#111827"}}>{x.v}</div>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#6b7280",marginBottom:3}}><span>Progress</span><span style={{fontWeight:500}}>{pct2}%</span></div>
              <ProgBar pct={pct2} color={p.color}/>
            </div>
          );
        })}
        <div style={{fontSize:14,fontWeight:600,color:"#111827",margin:"20px 0 10px"}}>By employee</div>
        {employees.length===0&&<p style={{fontSize:13,color:"#9ca3af"}}>No employees yet.</p>}
        {employees.map(e=>{
          const sch=empMonthH(e.id),pct3=e.maxHoursPerMonth>0?Math.round(sch/e.maxHoursPerMonth*100):0;
          return (
            <div key={e.id} style={cardSt({display:"flex",gap:12,alignItems:"center",padding:"12px 16px"})}>
              <Avatar name={e.name} color="#4f46e5"/>
              <div style={{flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:2}}>
                  <span style={{fontWeight:600,fontSize:14,color:"#111827"}}>{e.name} <span style={{fontSize:12,color:"#6b7280",fontWeight:400}}>{e.role}</span></span>
                  <span style={{fontSize:13,color:pct3>=100?"#dc2626":"#6b7280",fontWeight:500}}>{Math.round(sch/HPD)}d / {Math.round(e.maxHoursPerMonth/HPD)}d · {pct3}%</span>
                </div>
                <ProgBar pct={pct3} color="#4f46e5"/>
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
        {activeProjects.length===0&&<p style={{fontSize:13,color:"#9ca3af"}}>No active projects to summarise.</p>}
        {activeProjects.map(p=>{
          const manH=projManH(p.id),target=monthAllocH(p,rYear,rMonth),pct=target>0?Math.round(manH/target*100):0;
          const staff=employees.filter(e=>calDays.some(d=>getA(rYear,rMonth,d,e.id)===p.id));
          const isH=p.totalUnit==="hours";
          return (
            <div key={p.id} style={cardSt({borderLeft:`4px solid ${p.color}`})}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                <span style={{fontSize:15,fontWeight:600,color:"#111827"}}>{p.name}</span>
                {p.client&&<span style={{fontSize:13,color:"#6b7280"}}>{p.client}</span>}
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                {staff.map(e=>{ const days=calDays.filter(d=>getA(rYear,rMonth,d,e.id)===p.id).length; return <span key={e.id} style={{fontSize:13,padding:"4px 10px",borderRadius:99,background:"#f3f4f6",color:"#374151",border:"1px solid #e5e7eb"}}>{e.name} · {days}d · {days*HPD}h</span>; })}
                {staff.length===0&&<span style={{fontSize:13,color:"#9ca3af"}}>No staff assigned this month</span>}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#6b7280",marginBottom:3}}>
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
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"system-ui",fontSize:14,color:"#6b7280"}}>
      Loading…
    </div>
  );

  // Role-based tab visibility
  const visibleTabs = TABS.filter(t => {
    if (!auth || !auth.profile) return false;
    const role = auth.profile.role;
    if (t === "Admin") return role === "admin";
    if (t === "Capacity") return ["admin", "manager"].includes(role);
    if (t === "Summary") return ["admin", "manager", "dispatcher"].includes(role);
    if (t === "Roster") return ["admin", "manager", "dispatcher"].includes(role);
    return true;
  });

  const effectiveTab = visibleTabs.includes(tab) ? tab : visibleTabs[0] || "Projects";

  return (
    <div style={{fontFamily:"system-ui,-apple-system,sans-serif",padding:"1rem",maxWidth:1100,margin:"0 auto",color:"#111827"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <h2 style={{fontSize:24,fontWeight:700,margin:"0 0 4px",color:"#111827"}}>Roster manager</h2>
          <p style={{fontSize:13,color:"#6b7280",margin:0}}>7:00 am – 3:30 pm · 8h days</p>
        </div>
        {auth && <UserMenu auth={auth}/>}
      </div>

      <div style={{display:"flex",borderBottom:"1.5px solid #e5e7eb",marginBottom:20,overflowX:"auto"}}>
        {visibleTabs.map(t=><button key={t} onClick={()=>setTab(t)} style={{padding:"10px 16px",border:"none",background:"transparent",cursor:"pointer",fontFamily:"inherit",fontSize:14,color:effectiveTab===t?"#111827":"#6b7280",borderBottom:effectiveTab===t?"2px solid #4f46e5":"2px solid transparent",marginBottom:-1,fontWeight:effectiveTab===t?600:400,whiteSpace:"nowrap"}}>{t}</button>)}
      </div>

      {effectiveTab==="Projects"  && <ProjectsTab/>}
      {effectiveTab==="Employees" && <EmployeesTab/>}
      {effectiveTab==="Scheduler"  && <SchedulerDragDrop/>}
      {effectiveTab==="Roster"    && <RosterTab/>}
      {effectiveTab==="Capacity"  && <CapacityTab/>}
      {effectiveTab==="Summary"   && <SummaryTab/>}
      {dayEd   !== null && <DayEditorModal day={dayEd}/>}
      {projMod !== null && <ProjectModal key={pTick}/>}
      {empMod  !== null && <EmployeeModal key={eTick}/>}
      {toast&&(
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"#1f2937",color:"#fff",padding:"12px 20px",borderRadius:10,fontSize:13,zIndex:1000,boxShadow:"0 4px 16px rgba(0,0,0,0.2)",maxWidth:400,textAlign:"center",pointerEvents:"none"}}>
          {toast}
        </div>
      )}
    </div>
  );
}
