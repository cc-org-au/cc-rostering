"use client";
import { useState, useEffect } from "react";
import {
  ROLES, STRENGTHS,
  cardSt, inpSt, selSt,
  BtnPri, Btn, BtnDanger,
  Overlay, ModalBox, Lbl, Row2, FocusInp, FocusTxt,
  SecTitle, Tag, Avatar, Alert,
  StatusBadge,
} from "./shared";

const CERT_NAMES = [
  "First Aid Certificate","CPR Certificate","White Card (Construction Induction)",
  "Traffic Control Certificate","4WD Operation Certificate","Chainsaw Certificate",
  "Chemical Handling Licence","Heavy Vehicle Licence","Working at Heights",
  "Confined Space Entry","Forklift Licence","Elevated Work Platform",
  "Pesticide Applicator Licence","Herbicide Handling Certificate","Other",
];

// ── Certifications section ─────────────────────────────────────────────────────
function CertificationsSection({ employees, certifications, setCertifications, showToast, supabase }) {
  const [filterEmp, setFilterEmp] = useState("all");
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm] = useState({ employee_id:"", name:"", issued_date:"", expiry_date:"", notes:"" });

  async function saveCert() {
    if (!form.employee_id || !form.name) return showToast("Employee and certification name required.");
    const row = { ...form };
    const { data, error } = await supabase.from("certifications").insert(row).select().single();
    if (error) return showToast(error.message);
    setCertifications(prev => [...prev, data]);
    setForm({ employee_id:"", name:"", issued_date:"", expiry_date:"", notes:"" });
    setShowForm(false);
    showToast("Certification saved.");
  }

  async function deleteCert(id) {
    if (!window.confirm("Delete this certification?")) return;
    const { error } = await supabase.from("certifications").delete().eq("id", id);
    if (error) return showToast(error.message);
    setCertifications(prev => prev.filter(c => c.id !== id));
  }

  const today = new Date().toISOString().slice(0,10);
  const filtered = filterEmp === "all" ? certifications : certifications.filter(c => c.employee_id === filterEmp);
  const empName = id => employees.find(e=>e.id===id)?.name || id;

  function expiryStatus(d) {
    if (!d) return null;
    const diff = Math.floor((new Date(d) - new Date()) / 86400000);
    if (diff < 0) return { label:"Expired", col:"#dc2626", bg:"#fee2e2" };
    if (diff < 30) return { label:`Expires in ${diff}d`, col:"#d97706", bg:"#fffbeb" };
    return { label:`Expires ${d}`, col:"#059669", bg:"#f0fdf4" };
  }

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <SecTitle>Certifications</SecTitle>
          <select value={filterEmp} onChange={e=>setFilterEmp(e.target.value)} style={selSt({fontSize:13,padding:"6px 10px"})}>
            <option value="all">All employees</option>
            {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <BtnPri onClick={()=>setShowForm(v=>!v)} style={{fontSize:13,padding:"8px 14px"}}>+ Add certification</BtnPri>
      </div>

      {showForm && (
        <div style={{...cardSt(),background:"#f9fafb",marginBottom:16}}>
          <div style={{fontWeight:600,fontSize:14,marginBottom:12}}>New certification</div>
          <Row2>
            <div><Lbl>Employee *</Lbl>
              <select style={inpSt()} value={form.employee_id} onChange={e=>setForm(f=>({...f,employee_id:e.target.value}))}>
                <option value="">Select employee…</option>
                {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div><Lbl>Certification *</Lbl>
              <select style={inpSt()} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}>
                <option value="">Select…</option>
                {CERT_NAMES.map(n=><option key={n}>{n}</option>)}
              </select>
            </div>
          </Row2>
          <Row2>
            <div><Lbl>Issued date</Lbl><FocusInp type="date" value={form.issued_date} onChange={e=>setForm(f=>({...f,issued_date:e.target.value}))}/></div>
            <div><Lbl>Expiry date</Lbl><FocusInp type="date" value={form.expiry_date} onChange={e=>setForm(f=>({...f,expiry_date:e.target.value}))}/></div>
          </Row2>
          <div><Lbl>Notes</Lbl><FocusInp value={form.notes} placeholder="Optional notes" onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <BtnPri onClick={saveCert}>Save</BtnPri>
            <Btn onClick={()=>setShowForm(false)}>Cancel</Btn>
          </div>
        </div>
      )}

      {/* Expiry alerts */}
      {certifications.filter(c=>{
        if(!c.expiry_date) return false;
        const diff=Math.floor((new Date(c.expiry_date)-new Date())/86400000);
        return diff < 30;
      }).length > 0 && (
        <Alert type="warn">
          ⚠ {certifications.filter(c=>{if(!c.expiry_date)return false;const diff=Math.floor((new Date(c.expiry_date)-new Date())/86400000);return diff<30;}).length} certification(s) expiring within 30 days
        </Alert>
      )}

      {filtered.length === 0 && (
        <div style={{textAlign:"center",padding:"32px 0",color:"#9ca3af",fontSize:14}}>No certifications recorded yet.</div>
      )}
      {filtered.map(c => {
        const es = expiryStatus(c.expiry_date);
        return (
          <div key={c.id} style={cardSt({display:"flex",justifyContent:"space-between",alignItems:"center"})}>
            <div>
              <div style={{fontWeight:600,fontSize:14,color:"#111827"}}>{c.name}</div>
              <div style={{fontSize:13,color:"#6b7280",marginTop:2}}>{empName(c.employee_id)}</div>
              <div style={{marginTop:6,display:"flex",gap:6,flexWrap:"wrap"}}>
                {c.issued_date && <span style={{fontSize:12,color:"#6b7280"}}>Issued: {c.issued_date}</span>}
                {es && <span style={{fontSize:12,fontWeight:600,padding:"2px 8px",borderRadius:99,background:es.bg,color:es.col}}>{es.label}</span>}
              </div>
              {c.notes && <div style={{fontSize:12,color:"#9ca3af",marginTop:4}}>{c.notes}</div>}
            </div>
            <BtnDanger onClick={()=>deleteCert(c.id)} style={{fontSize:12}}>Remove</BtnDanger>
          </div>
        );
      })}
    </div>
  );
}

// ── Shift rules section ────────────────────────────────────────────────────────
function ShiftRulesSection({ shiftRules, setShiftRules, showToast, supabase }) {
  const [form, setForm] = useState({ ...shiftRules });
  const [saved, setSaved] = useState(false);

  useEffect(() => { setForm({...shiftRules}); }, [shiftRules]);

  async function saveRules() {
    const { error } = await supabase.from("shift_rules").upsert({ id:1, ...form });
    if (error) return showToast(error.message);
    setShiftRules(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const field = (key, label, hint) => (
    <div>
      <Lbl>{label}</Lbl>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <input type="number" min={0} value={form[key]||0}
          onChange={e=>setForm(f=>({...f,[key]:parseFloat(e.target.value)||0}))}
          style={inpSt({width:100})}
          onFocus={ev=>ev.target.style.borderColor="#4f46e5"}
          onBlur={ev=>ev.target.style.borderColor="#d1d5db"}/>
        <span style={{fontSize:13,color:"#6b7280"}}>{hint}</span>
      </div>
    </div>
  );

  return (
    <div style={cardSt()}>
      <div style={{fontWeight:600,fontSize:15,color:"#111827",marginBottom:16}}>Shift compliance rules</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:16,marginBottom:16}}>
        {field("overtime_threshold_daily",  "Daily overtime threshold",    "hours/day (e.g. 8)")}
        {field("overtime_threshold_weekly", "Weekly overtime threshold",   "hours/week (e.g. 38)")}
        {field("max_hours_per_day",         "Maximum hours per day",       "hard cap (e.g. 10)")}
        {field("max_hours_per_week",        "Maximum hours per week",      "hard cap (e.g. 50)")}
        {field("min_break_minutes",         "Minimum break",               "minutes between shifts")}
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <BtnPri onClick={saveRules}>Save rules</BtnPri>
        {saved && <span style={{fontSize:13,color:"#059669",fontWeight:500}}>✓ Saved</span>}
      </div>
      <div style={{marginTop:12,fontSize:13,color:"#6b7280"}}>
        These rules drive warnings on the Roster tab. They do not block scheduling — they surface compliance issues for review.
      </div>
    </div>
  );
}

// ── User management section ────────────────────────────────────────────────────
function UserManagementSection({ employees, userProfiles, setUserProfiles, showToast, supabase }) {
  async function updateRole(profileId, role) {
    const { error } = await supabase.from("user_profiles").update({ role }).eq("id", profileId);
    if (error) return showToast(error.message);
    setUserProfiles(prev => prev.map(p => p.id === profileId ? {...p, role} : p));
  }

  async function linkEmployee(profileId, employeeId) {
    const { error } = await supabase.from("user_profiles").update({ employee_id: employeeId||null }).eq("id", profileId);
    if (error) return showToast(error.message);
    setUserProfiles(prev => prev.map(p => p.id === profileId ? {...p, employee_id: employeeId||null} : p));
  }

  const empName = id => employees.find(e=>e.id===id)?.name || "—";

  return (
    <div>
      <SecTitle>User accounts</SecTitle>
      {userProfiles.length === 0 && (
        <div style={{fontSize:13,color:"#9ca3af",padding:"24px 0",textAlign:"center"}}>
          No user accounts yet. Users are created when they sign up via the login page.
        </div>
      )}
      {userProfiles.map(p => (
        <div key={p.id} style={cardSt({display:"flex",gap:12,alignItems:"center"})}>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:600,color:"#111827"}}>{p.email||p.id.slice(0,8)+"…"}</div>
            <div style={{fontSize:12,color:"#6b7280",marginTop:2}}>Linked employee: {empName(p.employee_id)}</div>
          </div>
          <select value={p.role} onChange={e=>updateRole(p.id, e.target.value)}
            style={selSt({fontSize:13,padding:"6px 10px"})}>
            <option value="employee">Employee</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
          <select value={p.employee_id||""} onChange={e=>linkEmployee(p.id, e.target.value)}
            style={selSt({fontSize:13,padding:"6px 10px"})}>
            <option value="">No employee linked</option>
            {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}

// ── Main SettingsTab ──────────────────────────────────────────────────────────
export default function SettingsTab({
  employees,
  certifications, setCertifications,
  shiftRules, setShiftRules,
  userProfiles, setUserProfiles,
  showToast,
  supabase,
}) {
  const [section, setSection] = useState("rules");
  const sections = [["rules","Shift rules"],["certs","Certifications"],["users","Users"]];

  return (
    <div>
      <div style={{display:"flex",gap:0,border:"1.5px solid #d1d5db",borderRadius:8,overflow:"hidden",width:"fit-content",marginBottom:20}}>
        {sections.map(([v,label])=>(
          <button key={v} type="button" onClick={()=>setSection(v)}
            style={{padding:"9px 18px",border:"none",fontFamily:"inherit",fontSize:13,fontWeight:500,cursor:"pointer",background:section===v?"#4f46e5":"#fff",color:section===v?"#fff":"#374151"}}>
            {label}
          </button>
        ))}
      </div>

      {section==="rules" && (
        <ShiftRulesSection shiftRules={shiftRules} setShiftRules={setShiftRules} showToast={showToast} supabase={supabase}/>
      )}
      {section==="certs" && (
        <CertificationsSection employees={employees} certifications={certifications} setCertifications={setCertifications} showToast={showToast} supabase={supabase}/>
      )}
      {section==="users" && (
        <UserManagementSection employees={employees} userProfiles={userProfiles} setUserProfiles={setUserProfiles} showToast={showToast} supabase={supabase}/>
      )}
    </div>
  );
}
