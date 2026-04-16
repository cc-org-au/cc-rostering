"use client";
// ── Shared UI primitives ──────────────────────────────────────────────────────
export const DAYS_SHORT  = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
export const MONTHS      = ["January","February","March","April","May","June","July","August","September","October","November","December"];
export const EMP_TYPES   = ["Full-time","Part-time","Casual","Contract","Apprentice"];
export const ROLES       = ["Project Manager","Site Supervisor","Foreman","Labourer","Electrician","Plumber","Carpenter","Concreter","Operator","Other"];
export const STRENGTHS   = ["Chainsawing","Brushcutting","Hand weeding","Herbicide application","Planting & tubestock","Seed collection","Mulching","Erosion control","Revegetation","Bush regeneration","Weed identification","Fauna surveys","Flora surveys","Ecological assessment","Riparian restoration","Coastal restoration","Grassland management","Rainforest restoration","Fencing","Track construction","Photo monitoring","Community engagement","Traffic control","First aid","4WD operation","Other"];
export const PROJ_COLORS = ["#4f46e5","#0891b2","#059669","#d97706","#dc2626","#7c3aed","#db2777","#0284c7","#16a34a","#ea580c"];
export const PTO_TYPES   = ["Annual Leave","Sick Leave","TOIL","Long Service Leave","Unpaid Leave","Other"];
export const HPD         = 8;

export const uid       = () => Math.random().toString(36).slice(2,8);
export const daysInMo  = (y,m) => new Date(y,m+1,0).getDate();
export const dowOf     = (y,m,d) => new Date(y,m,d).getDay();
export const dlabel    = (y,m,d) => DAYS_SHORT[(dowOf(y,m,d)+6)%7];
export const isWknd    = (y,m,d) => { const w=dowOf(y,m,d); return w===0||w===6; };
export const pmKey     = (y,m)   => `${y}-${m}`;
export const fmt$      = n => "$"+Math.round(n).toLocaleString();
export const fmtH      = n => Math.round(n*10)/10+"h";
export const inits     = name => name.trim().split(/\s+/).map(n=>n[0]).join("").slice(0,2).toUpperCase();
export const fmtDate   = d => d instanceof Date ? d.toISOString().slice(0,10) : d;

export const cardSt  = (x={}) => ({background:"#fff",border:"1.5px solid #e5e7eb",borderRadius:12,padding:"16px 18px",marginBottom:10,...x});
export const inpSt   = (x={}) => ({width:"100%",boxSizing:"border-box",padding:"10px 12px",border:"1.5px solid #d1d5db",borderRadius:8,fontSize:14,fontFamily:"inherit",background:"#fff",color:"#111827",outline:"none",...x});
export const selSt   = (x={}) => ({padding:"10px 12px",border:"1.5px solid #d1d5db",borderRadius:8,fontSize:14,fontFamily:"inherit",background:"#fff",color:"#111827",outline:"none",cursor:"pointer",...x});

export function ProgBar({pct,color}) {
  const c=pct>=100?"#dc2626":pct>=80?"#d97706":(color||"#059669");
  return <div style={{height:7,borderRadius:99,background:"#f3f4f6",overflow:"hidden",marginTop:5}}><div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:c,borderRadius:99,transition:"width 0.3s"}}/></div>;
}
export function Avatar({name,color}) {
  return <div style={{width:34,height:34,borderRadius:"50%",background:color||"#eef2ff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:600,color:color?"#fff":"#4f46e5",flexShrink:0}}>{inits(name)}</div>;
}
export function Tag({children,bg,col}) {
  return <span style={{display:"inline-flex",alignItems:"center",padding:"3px 10px",borderRadius:99,fontSize:12,fontWeight:500,background:bg,color:col}}>{children}</span>;
}
export function SecTitle({children}) {
  return <div style={{fontSize:11,fontWeight:600,color:"#6b7280",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8}}>{children}</div>;
}
export function Empty({icon,title,sub}) {
  return <div style={{textAlign:"center",padding:"48px 24px",border:"2px dashed #e5e7eb",borderRadius:12}}><div style={{fontSize:32,marginBottom:8}}>{icon}</div><div style={{fontSize:15,fontWeight:500,color:"#6b7280",marginBottom:4}}>{title}</div><div style={{fontSize:13,color:"#9ca3af"}}>{sub}</div></div>;
}
export function BtnPri({onClick,children,style={}}) {
  return <button onClick={onClick} style={{padding:"10px 18px",background:"#4f46e5",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontFamily:"inherit",fontWeight:500,cursor:"pointer",...style}}>{children}</button>;
}
export function Btn({onClick,children,style={}}) {
  return <button onClick={onClick} style={{padding:"9px 16px",background:"#fff",color:"#374151",border:"1.5px solid #d1d5db",borderRadius:8,fontSize:13,fontFamily:"inherit",cursor:"pointer",...style}}>{children}</button>;
}
export function BtnDanger({onClick,children,style={}}) {
  return <button onClick={onClick} style={{padding:"9px 14px",background:"#fff5f5",color:"#dc2626",border:"1.5px solid #fecaca",borderRadius:8,fontSize:13,fontFamily:"inherit",cursor:"pointer",...style}}>{children}</button>;
}
export function BtnSuccess({onClick,children,style={}}) {
  return <button onClick={onClick} style={{padding:"9px 14px",background:"#f0fdf4",color:"#166534",border:"1.5px solid #86efac",borderRadius:8,fontSize:13,fontFamily:"inherit",cursor:"pointer",...style}}>{children}</button>;
}
export function Overlay({onClose,children}) {
  return <div onClick={e=>{if(e.target===e.currentTarget)onClose();}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.25)",display:"flex",alignItems:"flex-start",justifyContent:"center",zIndex:200,overflowY:"auto",padding:"32px 12px 48px"}}>{children}</div>;
}
export function ModalBox({children,maxWidth=700}) {
  return <div style={{background:"#fff",borderRadius:16,padding:24,width:`min(${maxWidth}px,100%)`,boxShadow:"0 4px 32px rgba(0,0,0,0.12)"}}>{children}</div>;
}
export function Lbl({children}) { return <div style={{fontSize:13,fontWeight:600,color:"#374151",marginBottom:5}}>{children}</div>; }
export function Row2({children}) { return <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>{children}</div>; }
export function FocusInp({value,onChange,placeholder,type="text",style={},disabled=false}) {
  return <input type={type} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled}
    style={inpSt({...style,...(disabled?{background:"#f9fafb",color:"#9ca3af"}:{})})}
    onFocus={e=>{if(!disabled)e.target.style.borderColor="#4f46e5";}}
    onBlur={e=>e.target.style.borderColor="#d1d5db"}/>;
}
export function FocusTxt({value,onChange,placeholder,rows=3}) {
  return <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows}
    style={inpSt({resize:"vertical"})}
    onFocus={e=>e.target.style.borderColor="#4f46e5"}
    onBlur={e=>e.target.style.borderColor="#d1d5db"}/>;
}
export function ToggleBtn({options,value,onChange}) {
  return <div style={{display:"flex",border:"1.5px solid #d1d5db",borderRadius:8,overflow:"hidden",width:"fit-content"}}>
    {options.map(([v,label])=>(
      <button key={v} type="button" onClick={()=>onChange(v)}
        style={{padding:"9px 16px",border:"none",fontFamily:"inherit",fontSize:13,fontWeight:500,cursor:"pointer",background:value===v?"#4f46e5":"#fff",color:value===v?"#fff":"#374151"}}>
        {label}
      </button>
    ))}
  </div>;
}
export function StrBtn({label,active,onClick}) {
  return <button type="button" onClick={onClick} style={{padding:"4px 10px",borderRadius:99,fontSize:12,fontFamily:"inherit",cursor:"pointer",border:"1.5px solid",background:active?"#ecfdf5":"#fff",color:active?"#059669":"#6b7280",borderColor:active?"#6ee7b7":"#d1d5db"}}>{label}</button>;
}

export function StatusBadge({status}) {
  const map={
    pending:  {bg:"#fef9c3",col:"#713f12",label:"Pending"},
    approved: {bg:"#dcfce7",col:"#166534",label:"Approved"},
    denied:   {bg:"#fee2e2",col:"#dc2626",label:"Denied"},
    draft:    {bg:"#f3f4f6",col:"#6b7280",label:"Draft"},
    submitted:{bg:"#eff6ff",col:"#1d4ed8",label:"Submitted"},
    open:     {bg:"#eff6ff",col:"#1d4ed8",label:"Open"},
    claimed:  {bg:"#fef9c3",col:"#713f12",label:"Claimed"},
    filled:   {bg:"#dcfce7",col:"#166534",label:"Filled"},
    accepted: {bg:"#dcfce7",col:"#166534",label:"Accepted"},
    completed:{bg:"#dcfce7",col:"#166534",label:"Completed"},
  };
  const s=map[status]||{bg:"#f3f4f6",col:"#6b7280",label:status};
  return <span style={{padding:"3px 10px",borderRadius:99,fontSize:12,fontWeight:600,background:s.bg,color:s.col}}>{s.label}</span>;
}

export function Alert({type="warn",children}) {
  const styles={
    warn:  {bg:"#fffbeb",col:"#92400e",border:"#fde68a"},
    error: {bg:"#fef2f2",col:"#991b1b",border:"#fecaca"},
    info:  {bg:"#eff6ff",col:"#1e40af",border:"#bfdbfe"},
    ok:    {bg:"#f0fdf4",col:"#166534",border:"#bbf7d0"},
  };
  const s=styles[type];
  return <div style={{padding:"10px 14px",borderRadius:8,background:s.bg,border:`1.5px solid ${s.border}`,color:s.col,fontSize:13,marginBottom:10}}>{children}</div>;
}
