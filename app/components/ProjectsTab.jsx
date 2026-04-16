"use client";
import { useState, useRef, useCallback } from "react";
import {
  MONTHS, PROJ_COLORS, STRENGTHS, ROLES, EMP_TYPES, YEARS,
  HPD, uid, daysInMo, isWknd, pmKey,
  fmt$, fmtH,
  cardSt, inpSt, selSt,
  BtnPri, Btn, BtnDanger,
  Overlay, ModalBox, Lbl, Row2,
  FocusInp, FocusTxt, ToggleBtn, StrBtn,
  Tag, Empty,
} from "./shared";

const NOW = new Date();
const YEARS_LIST = Array.from({length:6},(_,i)=>NOW.getFullYear()-1+i);

function wdInMonth(y,m){let c=0;for(let d=1;d<=daysInMo(y,m);d++)if(!isWknd(y,m,d))c++;return c;}

function getProjectMonths(p) {
  if(p.startMonth===""||!p.startYear||p.endMonth===""||!p.endYear) return [];
  const out=[]; let y=+p.startYear, m=+p.startMonth;
  const ey=+p.endYear, em=+p.endMonth;
  while(y<ey||(y===ey&&m<=em)){ out.push({y,m}); if(++m>11){m=0;y++;} }
  return out;
}
function totalBudgetHours(p){if(!p.budget||!p.chargeOutRate)return null;return parseFloat(p.budget)/parseFloat(p.chargeOutRate);}
function totalInputHours(p){if(!p.totalInput||parseFloat(p.totalInput)<=0)return null;const v=parseFloat(p.totalInput);return p.totalUnit==="hours"?v:v*HPD;}
function spreadAcrossMonths(p){
  const months=getProjectMonths(p); if(!months.length)return {};
  const totalH=totalInputHours(p)||totalBudgetHours(p);
  const totalWd=months.reduce((a,{y,m})=>a+wdInMonth(y,m),0);
  const result={};
  const hoursMode=p.totalUnit==="hours";
  if(totalH!==null&&totalWd>0){
    if(hoursMode){let rem=totalH;months.forEach(({y,m},i)=>{const k=pmKey(y,m);if(i===months.length-1){result[k]=Math.max(0.5,Math.round(rem*10)/10);}else{const h=Math.round((totalH*(wdInMonth(y,m)/totalWd))*10)/10;result[k]=h;rem-=h;}});}
    else{let rem=Math.round(totalH/HPD)*HPD;months.forEach(({y,m},i)=>{const k=pmKey(y,m);if(i===months.length-1){result[k]=Math.max(HPD,Math.round(rem/HPD)*HPD);}else{const days=Math.max(1,Math.round((totalH*(wdInMonth(y,m)/totalWd))/HPD));result[k]=days*HPD;rem-=days*HPD;}});}
  } else { months.forEach(({y,m})=>{result[pmKey(y,m)]=wdInMonth(y,m)*HPD;}); }
  return result;
}
function monthAllocH(p,y,m){const v=p.monthlyHours[pmKey(y,m)];return v!==undefined?v:wdInMonth(y,m)*HPD;}
function monthBudgetSlice(p,y,m){const months=getProjectMonths(p);if(!months.length||!p.budget)return null;const tw=months.reduce((a,mm)=>a+wdInMonth(mm.y,mm.m),0);return tw>0?Math.round(parseFloat(p.budget)*wdInMonth(y,m)/tw):null;}

const projToRow = p => ({
  id:p.id, name:p.name, client:p.client, color:p.color, notes:p.notes,
  budget:p.budget, charge_out_rate:p.chargeOutRate, total_input:p.totalInput,
  total_unit:p.totalUnit, staff_mode:p.staffMode, fixed_staff:p.fixedStaff,
  start_month:p.startMonth, start_year:p.startYear, end_month:p.endMonth,
  end_year:p.endYear, monthly_hours:p.monthlyHours, strengths_required:p.strengthsRequired||[],
});

function ProjectModal({ proj, isNew, onSave, onClose }) {
  const ref = useRef({...proj, monthlyHours:{...proj.monthlyHours}});
  const [name,setName]     = useState(proj.name);
  const [client,setClient] = useState(proj.client);
  const [budget,setBudget] = useState(proj.budget);
  const [cor,setCor]       = useState(proj.chargeOutRate||"");
  const [totalInput,setTI] = useState(proj.totalInput||"");
  const [totalUnit,setTU]  = useState(proj.totalUnit||"days");
  const [staffMode,setSM]  = useState(proj.staffMode||"flexible");
  const [fixedStaff,setFS] = useState(proj.fixedStaff||"");
  const [color,setColor]   = useState(proj.color);
  const [strengths,setStr] = useState([...(proj.strengthsRequired||[])]);
  const [sm,setSm]         = useState(proj.startMonth);
  const [sy,setSy]         = useState(proj.startYear);
  const [em,setEm]         = useState(proj.endMonth);
  const [ey,setEy]         = useState(proj.endYear);
  const [hours,setHours]   = useState({...proj.monthlyHours});
  const [notes,setNotes]   = useState(proj.notes);
  const [,rerender]        = useState(0);
  const sync = patch => Object.assign(ref.current, patch);
  const localMonths = getProjectMonths({startMonth:sm,startYear:sy,endMonth:em,endYear:ey});
  const budH = totalBudgetHours({budget,chargeOutRate:cor});
  const totalAllocH = localMonths.reduce((a,{y,m})=>{const k=pmKey(y,m);return a+(hours[k]!==undefined?hours[k]:wdInMonth(y,m)*HPD);},0);
  const tH = totalInputHours({totalInput,totalUnit});
  const diff = tH!==null?totalAllocH-tH:null;
  function doSpread(){const s=spreadAcrossMonths({...ref.current,totalInput,totalUnit});setHours(s);sync({monthlyHours:s});rerender(r=>r+1);}
  function setMonthVal(key,raw){const v=parseFloat(raw)||0;const stored=totalUnit==="hours"?v:v*HPD;const next={...hours,[key]:stored};setHours(next);sync({monthlyHours:next});}
  function clearMonthVal(key){const next={...hours};delete next[key];setHours(next);sync({monthlyHours:next});}
  function switchUnit(u){setTU(u);sync({totalUnit:u});const s=spreadAcrossMonths({...ref.current,totalUnit:u});if(Object.keys(s).length){setHours(s);sync({monthlyHours:s});}rerender(r=>r+1);}

  return (
    <Overlay onClose={onClose}>
      <ModalBox>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h3 style={{margin:0,fontSize:18,fontWeight:700,color:"#111827"}}>{isNew?"New project":"Edit project"}</h3>
          <Btn onClick={onClose}>Cancel</Btn>
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
              <FocusInp type="number" value={totalInput} placeholder={totalUnit==="days"?"e.g. 45":"e.g. 360"} style={{flex:1,width:"auto"}} onChange={e=>{setTI(e.target.value);sync({totalInput:e.target.value});rerender(r=>r+1);}}/>
              <ToggleBtn options={[["days","Days"],["hours","Hours"]]} value={totalUnit} onChange={switchUnit}/>
            </div>
            {totalInput&&parseFloat(totalInput)>0&&(
              <div style={{marginTop:5,fontSize:12,color:"#6b7280"}}>{totalUnit==="days"?<>= <b style={{color:"#111827"}}>{parseFloat(totalInput)*HPD}h</b> total</>:<>= <b style={{color:"#111827"}}>{(parseFloat(totalInput)/HPD).toFixed(1)} days</b> equiv</>}</div>
            )}
            {budget&&cor&&parseFloat(budget)>0&&parseFloat(cor)>0&&(
              <div style={{marginTop:4,fontSize:12,color:"#6b7280"}}>💡 Budget implies <b style={{color:"#111827"}}>{Math.round(parseFloat(budget)/parseFloat(cor)/HPD)} days</b> ({Math.round(parseFloat(budget)/parseFloat(cor))}h) at ${cor}/hr</div>
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
              {STRENGTHS.map(st=><StrBtn key={st} label={st} active={strengths.includes(st)} onClick={()=>{const n=strengths.includes(st)?strengths.filter(x=>x!==st):[...strengths,st];setStr(n);sync({strengthsRequired:n});}}/>)}
            </div>
          </div>
          <div>
            <Lbl>Project dates</Lbl>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 20px 1fr 1fr",gap:8,alignItems:"center"}}>
              <select style={selSt({width:"100%"})} value={sm} onChange={e=>{setSm(e.target.value);sync({startMonth:e.target.value});rerender(r=>r+1);}}>{MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}</select>
              <select style={selSt({width:"100%"})} value={sy} onChange={e=>{setSy(e.target.value);sync({startYear:e.target.value});rerender(r=>r+1);}}>{YEARS_LIST.map(y=><option key={y}>{y}</option>)}</select>
              <span style={{textAlign:"center",color:"#9ca3af"}}>→</span>
              <select style={selSt({width:"100%"})} value={em} onChange={e=>{setEm(e.target.value);sync({endMonth:e.target.value});rerender(r=>r+1);}}>{MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}</select>
              <select style={selSt({width:"100%"})} value={ey} onChange={e=>{setEy(e.target.value);sync({endYear:e.target.value});rerender(r=>r+1);}}>{YEARS_LIST.map(y=><option key={y}>{y}</option>)}</select>
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
                  const key=pmKey(y,m); const wd=wdInMonth(y,m); const hasOv=hours[key]!==undefined;
                  const stored=hasOv?hours[key]:wd*HPD; const isH=totalUnit==="hours";
                  const displayVal=isH?Math.round(stored*10)/10:Math.round(stored/HPD);
                  const mb=monthBudgetSlice({...ref.current,startMonth:sm,startYear:sy,endMonth:em,endYear:ey},y,m);
                  const mRev=cor&&parseFloat(cor)>0?stored*parseFloat(cor):null;
                  return (
                    <div key={key} style={{background:hasOv?"#fffbeb":"#f9fafb",border:`1.5px solid ${hasOv?"#fcd34d":"#e5e7eb"}`,borderRadius:8,padding:"10px 12px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
                        <span style={{fontSize:12,fontWeight:600,color:"#374151"}}>{MONTHS[m].slice(0,3)} {y}</span>
                        {hasOv&&<span style={{fontSize:10,color:"#b45309"}}>edited</span>}
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                        <input type="number" min={0} value={displayVal} style={inpSt({width:64,padding:"6px 8px",textAlign:"center"})}
                          onChange={e=>setMonthVal(key,e.target.value)} onFocus={e=>e.target.style.borderColor="#4f46e5"} onBlur={e=>e.target.style.borderColor="#d1d5db"}/>
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
        </div>
        <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:20,paddingTop:16,borderTop:"1px solid #e5e7eb"}}>
          <Btn onClick={onClose}>Cancel</Btn>
          <BtnPri onClick={()=>onSave(ref.current)}>Save project</BtnPri>
        </div>
      </ModalBox>
    </Overlay>
  );
}

export default function ProjectsTab({ projects, setProj, showToast, supabase }) {
  const [modal, setModal] = useState(null); // null | {proj, isNew}

  const mkProj = () => ({
    id:"", name:"", client:"", color:PROJ_COLORS[0], notes:"",
    budget:"", chargeOutRate:"",
    totalInput:"", totalUnit:"days",
    staffMode:"flexible", fixedStaff:"",
    startMonth:String(NOW.getMonth()), startYear:String(NOW.getFullYear()),
    endMonth:String(NOW.getMonth()), endYear:String(NOW.getFullYear()),
    monthlyHours:{}, strengthsRequired:[],
  });

  function openNew()  { setModal({proj:mkProj(), isNew:true}); }
  function openEdit(p){ setModal({proj:{...p,monthlyHours:{...p.monthlyHours}}, isNew:false}); }

  function handleSave(data) {
    const s = {...data, id:data.id||uid()};
    setProj(prev => data.id ? prev.map(x=>x.id===s.id?s:x) : [...prev,s]);
    setModal(null);
    supabase.from("projects").upsert({
      id:s.id, name:s.name, client:s.client, color:s.color, notes:s.notes,
      budget:s.budget, charge_out_rate:s.chargeOutRate, total_input:s.totalInput,
      total_unit:s.totalUnit, staff_mode:s.staffMode, fixed_staff:s.fixedStaff,
      start_month:s.startMonth, start_year:s.startYear, end_month:s.endMonth,
      end_year:s.endYear, monthly_hours:s.monthlyHours, strengths_required:s.strengthsRequired||[],
    }).then(({error})=>{if(error)showToast(error.message);});
  }

  function deleteProj(p) {
    if(!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    setProj(prev=>prev.filter(x=>x.id!==p.id));
    supabase.from("projects").delete().eq("id",p.id).then(({error})=>{if(error)showToast(error.message);});
  }

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h3 style={{margin:0,fontSize:16,fontWeight:600,color:"#111827"}}>Projects <span style={{fontWeight:400,color:"#6b7280"}}>({projects.length})</span></h3>
        <BtnPri onClick={openNew}>+ Add project</BtnPri>
      </div>
      {projects.length===0&&<Empty icon="🌿" title="No projects yet" sub='Click "Add project" to get started'/>}
      {projects.map(p=>{
        const months=getProjectMonths(p);
        const tH=totalInputHours(p); const budH=totalBudgetHours(p);
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
                {months.length>0&&tH&&(
                  <div style={{marginTop:6,fontSize:12,fontWeight:500,color:totalAllocH>tH+0.5?"#dc2626":totalAllocH<tH-0.5?"#d97706":"#059669"}}>
                    Allocated: {p.totalUnit==="hours"?fmtH(totalAllocH):`${Math.round(totalAllocH/HPD)}d`} / {p.totalUnit==="hours"?fmtH(tH):`${Math.round(tH/HPD)}d`} target{totalAllocH>tH+0.5?" — over":totalAllocH<tH-0.5?" — under":" ✓"}
                  </div>
                )}
                {p.notes&&<div style={{fontSize:13,color:"#6b7280",marginTop:8}}>{p.notes}</div>}
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                <Btn onClick={()=>openEdit(p)}>Edit</Btn>
                <BtnDanger onClick={()=>deleteProj(p)}>Delete</BtnDanger>
              </div>
            </div>
          </div>
        );
      })}
      {modal && <ProjectModal proj={modal.proj} isNew={modal.isNew} onSave={handleSave} onClose={()=>setModal(null)}/>}
    </div>
  );
}
