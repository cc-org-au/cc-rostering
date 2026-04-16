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

export const cardSt  = (x={}) => ({background:"var(--bg-card)",border:"1.5px solid var(--border)",borderRadius:12,padding:"16px 18px",marginBottom:10,...x});
export const inpSt   = (x={}) => ({width:"100%",boxSizing:"border-box",padding:"10px 12px",border:"1.5px solid var(--border-input)",borderRadius:8,fontSize:14,fontFamily:"inherit",background:"var(--bg-card)",color:"var(--text-primary)",outline:"none",...x});
export const selSt   = (x={}) => ({padding:"10px 12px",border:"1.5px solid var(--border-input)",borderRadius:8,fontSize:14,fontFamily:"inherit",background:"var(--bg-card)",color:"var(--text-primary)",outline:"none",cursor:"pointer",...x});

export function ProgBar({pct,color}) {
  const c=pct>=100?"#dc2626":pct>=80?"#d97706":(color||"#059669");
  return <div style={{height:7,borderRadius:99,background:"var(--prog-track)",overflow:"hidden",marginTop:5}}><div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:c,borderRadius:99,transition:"width 0.3s"}}/></div>;
}
export function Avatar({name,color}) {
  return <div style={{width:34,height:34,borderRadius:"50%",background:color||"var(--avatar-bg)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:600,color:color?"#fff":"var(--avatar-fg)",flexShrink:0}}>{inits(name)}</div>;
}
export function Tag({children,bg,col}) {
  return <span style={{display:"inline-flex",alignItems:"center",padding:"3px 10px",borderRadius:99,fontSize:12,fontWeight:500,background:bg,color:col}}>{children}</span>;
}
export function SecTitle({children}) {
  return <div style={{fontSize:11,fontWeight:600,color:"var(--text-muted)",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8}}>{children}</div>;
}
export function Empty({icon,title,sub}) {
  return <div style={{textAlign:"center",padding:"48px 24px",border:"2px dashed var(--border)",borderRadius:12}}><div style={{fontSize:32,marginBottom:8}}>{icon}</div><div style={{fontSize:15,fontWeight:500,color:"var(--text-muted)",marginBottom:4}}>{title}</div><div style={{fontSize:13,color:"var(--text-faint)"}}>{sub}</div></div>;
}
export function BtnPri({onClick,children,style={},type="button"}) {
  return <button type={type} onClick={onClick} style={{padding:"10px 18px",background:"var(--accent)",color:"var(--on-accent)",border:"none",borderRadius:8,fontSize:14,fontFamily:"inherit",fontWeight:500,cursor:"pointer",...style}}>{children}</button>;
}
export function Btn({onClick,children,style={},type="button"}) {
  return <button type={type} onClick={onClick} style={{padding:"9px 16px",background:"var(--btn-secondary-bg)",color:"var(--btn-secondary-text)",border:"1.5px solid var(--border-input)",borderRadius:8,fontSize:13,fontFamily:"inherit",cursor:"pointer",...style}}>{children}</button>;
}
export function BtnDanger({onClick,children,style={},type="button"}) {
  return <button type={type} onClick={onClick} style={{padding:"9px 14px",background:"var(--danger-bg)",color:"var(--danger-text)",border:"1.5px solid var(--danger-border)",borderRadius:8,fontSize:13,fontFamily:"inherit",cursor:"pointer",...style}}>{children}</button>;
}

/** Confirmation dialog; uses z-index above typical overlays. */
export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  confirmDanger = true,
}) {
  if (!open) return null;
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--overlay-confirm)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        zIndex: 300,
        overflowY: "auto",
        padding: "32px 12px 48px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-card)",
          borderRadius: 16,
          padding: 24,
          width: "min(440px,100%)",
          boxShadow: "var(--shadow-modal-strong)",
          marginTop: "10vh",
        }}
      >
        <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}>{title}</h3>
        {message ? (
          <p style={{ margin: "0 0 20px", fontSize: 14, color: "var(--text-muted)", lineHeight: 1.5 }}>{message}</p>
        ) : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
          <Btn onClick={onCancel}>{cancelLabel}</Btn>
          {confirmDanger ? (
            <BtnDanger onClick={onConfirm}>{confirmLabel}</BtnDanger>
          ) : (
            <BtnPri onClick={onConfirm}>{confirmLabel}</BtnPri>
          )}
        </div>
      </div>
    </div>
  );
}
export function BtnSuccess({onClick,children,style={}}) {
  return <button onClick={onClick} style={{padding:"9px 14px",background:"var(--success-bg)",color:"var(--success-text)",border:"1.5px solid var(--success-border)",borderRadius:8,fontSize:13,fontFamily:"inherit",cursor:"pointer",...style}}>{children}</button>;
}
export function Overlay({onClose,children}) {
  return <div onClick={e=>{if(e.target===e.currentTarget)onClose();}} style={{position:"fixed",inset:0,background:"var(--overlay-scrim)",display:"flex",alignItems:"flex-start",justifyContent:"center",zIndex:200,overflowY:"auto",padding:"32px 12px 48px"}}>{children}</div>;
}
export function ModalBox({children,maxWidth=700}) {
  return <div style={{background:"var(--bg-card)",borderRadius:16,padding:24,width:`min(${maxWidth}px,100%)`,boxShadow:"var(--shadow-modal)"}}>{children}</div>;
}
export function Lbl({children}) { return <div style={{fontSize:13,fontWeight:600,color:"var(--text-secondary)",marginBottom:5}}>{children}</div>; }
export function Row2({children}) { return <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>{children}</div>; }
export function FocusInp({value,onChange,placeholder,type="text",style={},disabled=false}) {
  return <input type={type} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled}
    style={inpSt({...style,...(disabled?{background:"var(--bg-input-disabled)",color:"var(--text-faint)"}:{})})}
    onFocus={e=>{if(!disabled)e.target.style.borderColor="var(--focus-ring)";}}
    onBlur={e=>e.target.style.borderColor="var(--border-input)"}/>;
}
export function FocusTxt({value,onChange,placeholder,rows=3}) {
  return <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows}
    style={inpSt({resize:"vertical"})}
    onFocus={e=>e.target.style.borderColor="var(--focus-ring)"}
    onBlur={e=>e.target.style.borderColor="var(--border-input)"}/>;
}
export function ToggleBtn({options,value,onChange}) {
  return <div style={{display:"flex",border:"1.5px solid var(--border-input)",borderRadius:8,overflow:"hidden",width:"fit-content"}}>
    {options.map(([v,label])=>(
      <button key={v} type="button" onClick={()=>onChange(v)}
        style={{padding:"9px 16px",border:"none",fontFamily:"inherit",fontSize:13,fontWeight:500,cursor:"pointer",background:value===v?"var(--accent)":"var(--bg-card)",color:value===v?"var(--on-accent)":"var(--text-secondary)"}}>
        {label}
      </button>
    ))}
  </div>;
}
export function StrBtn({label,active,onClick}) {
  return <button type="button" onClick={onClick} style={{padding:"4px 10px",borderRadius:99,fontSize:12,fontFamily:"inherit",cursor:"pointer",border:"1.5px solid",background:active?"var(--str-active-bg)":"var(--bg-card)",color:active?"var(--str-active-text)":"var(--text-muted)",borderColor:active?"var(--str-active-border)":"var(--border-input)"}}>{label}</button>;
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

// ── Toast Notification System ──────────────────────────────────────────────

import { useState, useCallback, useEffect } from 'react';

export function useToast() {
  const [toasts, setToasts] = useState([]);

  const add = useCallback((toast) => {
    const id = toast.id || Math.random().toString(36).slice(2);
    const duration = toast.duration || 5000;

    setToasts(prev => [...prev, { ...toast, id }]);

    if (duration > 0) {
      const timeout = setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);

      return () => clearTimeout(timeout);
    }
  }, []);

  const remove = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const clear = useCallback(() => {
    setToasts([]);
  }, []);

  return { toasts, add, remove, clear };
}

export function Toast({ toast, onClose }) {
  const styles = {
    success: { bg: '#dcfce7', border: '#86efac', col: '#166534', icon: '✓' },
    error:   { bg: '#fee2e2', border: '#fecaca', col: '#dc2626', icon: '✕' },
    info:    { bg: '#dbeafe', border: '#93c5fd', col: '#1e40af', icon: 'ℹ' },
    warning: { bg: '#fef3c7', border: '#fcd34d', col: '#92400e', icon: '⚠' }
  };

  const s = styles[toast.type || 'info'];

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      padding: '12px 16px',
      background: s.bg,
      border: `1.5px solid ${s.border}`,
      borderRadius: 8,
      color: s.col,
      fontSize: 14,
      marginBottom: 10,
      boxShadow: 'var(--shadow-toast)',
      animation: 'slideIn 0.3s ease-out'
    }}>
      <div style={{ fontSize: 16, fontWeight: 'bold', flexShrink: 0, marginTop: 2 }}>
        {s.icon}
      </div>
      <div style={{ flex: 1 }}>
        {toast.title && (
          <div style={{ fontWeight: 600, marginBottom: toast.message ? 2 : 0 }}>
            {toast.title}
          </div>
        )}
        {toast.message && (
          <div style={{ fontSize: 13, lineHeight: 1.4 }}>
            {toast.message}
          </div>
        )}
      </div>
      {toast.action && (
        <button
          onClick={() => {
            toast.action.onClick?.();
            onClose();
          }}
          style={{
            background: 'none',
            border: 'none',
            color: s.col,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            padding: '2px 8px',
            whiteSpace: 'nowrap',
            flexShrink: 0
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          color: s.col,
          cursor: 'pointer',
          fontSize: 16,
          padding: '0 4px',
          opacity: 0.6,
          flexShrink: 0
        }}
      >
        ✕
      </button>
      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

export function ToastContainer({ toasts, onClose }) {
  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      zIndex: 1000,
      maxWidth: 400,
      pointerEvents: 'auto'
    }}>
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          toast={toast}
          onClose={() => onClose(toast.id)}
        />
      ))}
    </div>
  );
}
