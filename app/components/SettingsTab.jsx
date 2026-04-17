"use client";
import { useState, useEffect } from "react";
import {
  ROLES,
  cardSt, inpSt, selSt,
  BtnPri, Btn, BtnDanger,
  ConfirmModal,
  Overlay, ModalBox, Lbl, Row2, FocusInp, FocusTxt,
  SecTitle, Tag, Avatar, Alert,
  StatusBadge,
} from "./shared";
import { useSettings } from "../../lib/useSettings";
import {
  exportRoster, exportEmployees, exportProjects, exportTimesheets, exportMonthlyBundle
} from "../../lib/exportData";
import {
  validateEmployeesCSV, applyEmployeeImport,
  validateProjectsCSV, applyProjectImport,
  validateHolidayCSV,
  downloadEmployeeTemplate, downloadProjectTemplate, downloadHolidayTemplate, HOLIDAY_TEMPLATES
} from "../../lib/importData";

const CERT_NAMES = [
  "First Aid Certificate","CPR Certificate","White Card (Construction Induction)",
  "Traffic Control Certificate","4WD Operation Certificate","Chainsaw Certificate",
  "Chemical Handling Licence","Heavy Vehicle Licence","Working at Heights",
  "Confined Space Entry","Forklift Licence","Elevated Work Platform",
  "Pesticide Applicator Licence","Herbicide Handling Certificate","Other",
];

const TIMEZONES = [
  'UTC', 'Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane',
  'Australia/Perth', 'Europe/London', 'America/New_York', 'America/Los_Angeles'
];

const CURRENCIES = ['AUD', 'USD', 'GBP', 'EUR', 'NZD'];

// ── Organization Section ──────────────────────────────────────────────────
function OrganizationSection({ getSetting, setSetting, showToast, supabase }) {
  const [form, setForm] = useState({ org_name: "", org_logo_url: "", color: "" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm({
      org_name: getSetting('org_name') || 'Organization',
      org_logo_url: getSetting('org_logo_url') || '',
      color: 'var(--accent)',
    });
  }, [getSetting]);

  async function save() {
    try {
      await setSetting('org_name', form.org_name);
      await setSetting('org_logo_url', form.org_logo_url);
      setSaved(true);
      showToast("Organization settings saved.");
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      showToast(err.message);
    }
  }

  return (
    <div style={cardSt()}>
      <div style={{fontWeight:600,fontSize:14,marginBottom:16,display:"flex",alignItems:"center",gap:8}}>
        <span>🏢</span> Organization
      </div>
      <Row2>
        <div>
          <Lbl>Organization Name</Lbl>
          <FocusInp value={form.org_name} onChange={e=>setForm(f=>({...f,org_name:e.target.value}))}/>
        </div>
        <div>
          <Lbl>Logo URL</Lbl>
          <FocusInp value={form.org_logo_url} onChange={e=>setForm(f=>({...f,org_logo_url:e.target.value}))} placeholder="https://..."/>
        </div>
      </Row2>
      {form.org_logo_url && (
        <div style={{marginTop:12,padding:12,background:"var(--bg-muted)",borderRadius:6}}>
          <img src={form.org_logo_url} style={{maxHeight:80,maxWidth:200}} alt="Logo preview" onError={()=>{}}/>
        </div>
      )}
      <div style={{display:"flex",gap:8,marginTop:16}}>
        <BtnPri onClick={save}>Save</BtnPri>
        {saved && <span style={{fontSize:13,color:"var(--success-text)",fontWeight:500}}>✓ Saved</span>}
      </div>
    </div>
  );
}

// ── Business Rules Section ─────────────────────────────────────────────────
function BusinessRulesSection({ getSetting, setSetting, showToast }) {
  const [form, setForm] = useState({
    hpd: 8,
    min_shift_duration: 4,
    max_shift_duration: 12,
    weekend_days: [5, 6],
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm({
      hpd: getSetting('hpd') || 8,
      min_shift_duration: 4,
      max_shift_duration: 12,
      weekend_days: getSetting('weekend_days') || [5, 6],
    });
  }, [getSetting]);

  async function save() {
    try {
      await setSetting('hpd', form.hpd);
      await setSetting('weekend_days', form.weekend_days);
      setSaved(true);
      showToast("Business rules updated.");
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      showToast(err.message);
    }
  }

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const toggleWeekendDay = (idx) => {
    setForm(f => ({
      ...f,
      weekend_days: f.weekend_days.includes(idx)
        ? f.weekend_days.filter(d => d !== idx)
        : [...f.weekend_days, idx]
    }));
  };

  return (
    <div style={cardSt()}>
      <div style={{fontWeight:600,fontSize:14,marginBottom:16,display:"flex",alignItems:"center",gap:8}}>
        <span>⚙️</span> Business Rules
      </div>
      <Row2>
        <div>
          <Lbl>Hours per Day (HPD)</Lbl>
          <input type="number" min={1} max={24} value={form.hpd}
            onChange={e=>setForm(f=>({...f,hpd:parseInt(e.target.value)||8}))}
            style={inpSt()}/>
        </div>
        <div>
          <Lbl>Min Shift Duration (hours)</Lbl>
          <input type="number" min={1} max={24} value={form.min_shift_duration}
            onChange={e=>setForm(f=>({...f,min_shift_duration:parseInt(e.target.value)||4}))}
            style={inpSt()}/>
        </div>
      </Row2>
      <Row2>
        <div>
          <Lbl>Max Shift Duration (hours)</Lbl>
          <input type="number" min={1} max={24} value={form.max_shift_duration}
            onChange={e=>setForm(f=>({...f,max_shift_duration:parseInt(e.target.value)||12}))}
            style={inpSt()}/>
        </div>
      </Row2>
      <div style={{marginTop:16}}>
        <Lbl>Weekend Days</Lbl>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>
          {dayNames.map((day, idx) => (
            <button key={idx} type="button" onClick={()=>toggleWeekendDay(idx)}
              style={{
                padding:"8px 12px",
                borderRadius:6,
                border:"1.5px solid",
                borderColor: form.weekend_days.includes(idx) ? "var(--accent)" : "var(--border-input)",
                background: form.weekend_days.includes(idx) ? "var(--accent-soft)" : "var(--bg-card)",
                color: form.weekend_days.includes(idx) ? "var(--accent)" : "var(--text-muted)",
                fontSize:13,
                fontWeight:500,
                cursor:"pointer",
              }}>
              {day}
            </button>
          ))}
        </div>
      </div>
      <div style={{display:"flex",gap:8,marginTop:16}}>
        <BtnPri onClick={save}>Save</BtnPri>
        {saved && <span style={{fontSize:13,color:"var(--success-text)",fontWeight:500}}>✓ Saved</span>}
      </div>
    </div>
  );
}

// ── Defaults Section ───────────────────────────────────────────────────────
function DefaultsSection({ getSetting, setSetting, showToast }) {
  const [form, setForm] = useState({
    default_rate: 45,
    default_max_hours: 160,
    default_strengths: "",
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const strengths = getSetting('default_employee_strengths') || [];
    setForm({
      default_rate: getSetting('default_rate') || 45,
      default_max_hours: getSetting('default_max_hours') || 160,
      default_strengths: Array.isArray(strengths) ? strengths.join(', ') : "",
    });
  }, [getSetting]);

  async function save() {
    try {
      await setSetting('default_rate', form.default_rate);
      await setSetting('default_max_hours', form.default_max_hours);
      const strengthsList = form.default_strengths
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      await setSetting('default_employee_strengths', strengthsList);
      setSaved(true);
      showToast("Defaults updated.");
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      showToast(err.message);
    }
  }

  return (
    <div style={cardSt()}>
      <div style={{fontWeight:600,fontSize:14,marginBottom:16,display:"flex",alignItems:"center",gap:8}}>
        <span>📋</span> Defaults
      </div>
      <Row2>
        <div>
          <Lbl>Default Hourly Rate ($)</Lbl>
          <input type="number" min={0} step={0.01} value={form.default_rate}
            onChange={e=>setForm(f=>({...f,default_rate:parseFloat(e.target.value)||0}))}
            style={inpSt()}/>
        </div>
        <div>
          <Lbl>Default Max Hours/Month</Lbl>
          <input type="number" min={0} value={form.default_max_hours}
            onChange={e=>setForm(f=>({...f,default_max_hours:parseInt(e.target.value)||160}))}
            style={inpSt()}/>
        </div>
      </Row2>
      <div>
        <Lbl>Default Employee Skills (comma-separated)</Lbl>
        <FocusTxt value={form.default_strengths}
          onChange={e=>setForm(f=>({...f,default_strengths:e.target.value}))}
          placeholder="e.g. Electrical, Plumbing, Safety"/>
        <div style={{fontSize:12,color:"var(--text-muted)",marginTop:6}}>
          Separate multiple skills with commas
        </div>
      </div>
      <div style={{display:"flex",gap:8,marginTop:16}}>
        <BtnPri onClick={save}>Save</BtnPri>
        {saved && <span style={{fontSize:13,color:"var(--success-text)",fontWeight:500}}>✓ Saved</span>}
      </div>
    </div>
  );
}

// ── Calendar Section ──────────────────────────────────────────────────────
function CalendarSection({ getSetting, setSetting, showToast }) {
  const [form, setForm] = useState({
    timezone: 'Australia/Sydney',
    fiscal_year_start: 6,
    currency: 'AUD',
  });
  const [holidays, setHolidays] = useState([]);
  const [showHolidayForm, setShowHolidayForm] = useState(false);
  const [newHoliday, setNewHoliday] = useState({ date: "", name: "" });
  const [saved, setSaved] = useState(false);
  const [holidayRemoveIdx, setHolidayRemoveIdx] = useState(null);
  const [templateLoadCountry, setTemplateLoadCountry] = useState(null);

  useEffect(() => {
    setForm({
      timezone: getSetting('timezone') || 'Australia/Sydney',
      fiscal_year_start: getSetting('fiscal_year_start_month') || 6,
      currency: getSetting('currency') || 'AUD',
    });
    const hols = getSetting('holidays');
    setHolidays(Array.isArray(hols) ? hols : []);
  }, [getSetting]);

  async function save() {
    try {
      await setSetting('timezone', form.timezone);
      await setSetting('fiscal_year_start_month', form.fiscal_year_start);
      await setSetting('currency', form.currency);
      await setSetting('holidays', holidays);
      setSaved(true);
      showToast("Calendar settings saved.");
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      showToast(err.message);
    }
  }

  async function addHoliday() {
    if (!newHoliday.date || !newHoliday.name) {
      showToast("Date and name required");
      return;
    }
    setHolidays([...holidays, newHoliday]);
    setNewHoliday({ date: "", name: "" });
    setShowHolidayForm(false);
  }

  function removeHoliday(idx) {
    setHolidays(holidays.filter((_, i) => i !== idx));
  }

  function loadTemplate(country) {
    setTemplateLoadCountry(country);
  }

  return (
    <div style={cardSt()}>
      <div style={{fontWeight:600,fontSize:14,marginBottom:16,display:"flex",alignItems:"center",gap:8}}>
        <span>📅</span> Calendar & Regional
      </div>
      <Row2>
        <div>
          <Lbl>Timezone</Lbl>
          <select value={form.timezone} onChange={e=>setForm(f=>({...f,timezone:e.target.value}))}
            style={selSt()}>
            {TIMEZONES.map(tz => <option key={tz}>{tz}</option>)}
          </select>
        </div>
        <div>
          <Lbl>Fiscal Year Start Month</Lbl>
          <select value={form.fiscal_year_start} onChange={e=>setForm(f=>({...f,fiscal_year_start:parseInt(e.target.value)}))}
            style={selSt()}>
            {['January','February','March','April','May','June','July','August','September','October','November','December']
              .map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>
        <div>
          <Lbl>Currency</Lbl>
          <select value={form.currency} onChange={e=>setForm(f=>({...f,currency:e.target.value}))}
            style={selSt()}>
            {CURRENCIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </Row2>

      <div style={{marginTop:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <Lbl>Public Holidays ({holidays.length})</Lbl>
          <BtnPri onClick={()=>setShowHolidayForm(v=>!v)} style={{fontSize:13,padding:"6px 12px"}}>+ Add holiday</BtnPri>
        </div>

        {showHolidayForm && (
          <div style={{...cardSt({background:"var(--bg-muted)"}),marginBottom:12}}>
            <Row2>
              <div>
                <Lbl>Date</Lbl>
                <input type="date" value={newHoliday.date} onChange={e=>setNewHoliday(h=>({...h,date:e.target.value}))}
                  style={inpSt()}/>
              </div>
              <div>
                <Lbl>Holiday Name</Lbl>
                <FocusInp value={newHoliday.name} onChange={e=>setNewHoliday(h=>({...h,name:e.target.value}))}/>
              </div>
            </Row2>
            <div style={{display:"flex",gap:8,marginTop:12}}>
              <BtnPri onClick={addHoliday}>Add</BtnPri>
              <Btn onClick={()=>setShowHolidayForm(false)}>Cancel</Btn>
            </div>
          </div>
        )}

        {holidays.length > 0 && (
          <div style={{marginBottom:12,maxHeight:300,overflowY:"auto"}}>
            {holidays.map((h, idx) => (
              <div key={idx} style={{...cardSt({display:"flex",justifyContent:"space-between",alignItems:"center"}),fontSize:13}}>
                <div>
                  <div style={{fontWeight:600}}>{h.name}</div>
                  <div style={{color:"var(--text-muted)",marginTop:2}}>{h.date}</div>
                </div>
                <BtnDanger onClick={()=>setHolidayRemoveIdx(idx)} style={{fontSize:12,padding:"4px 8px"}}>Remove</BtnDanger>
              </div>
            ))}
          </div>
        )}

        <div style={{display:"flex",gap:4,flexWrap:"wrap",fontSize:12}}>
          <span style={{color:"var(--text-muted)"}}>Quick load:</span>
          {Object.keys(HOLIDAY_TEMPLATES).map(country => (
            <button key={country} type="button" onClick={()=>loadTemplate(country)}
              style={{padding:"4px 10px",background:"var(--bg-muted)",border:"1px solid var(--border)",borderRadius:4,cursor:"pointer",fontSize:12,color:"var(--text-secondary)"}}>
              {country}
            </button>
          ))}
        </div>
      </div>

      <div style={{display:"flex",gap:8,marginTop:16}}>
        <BtnPri onClick={save}>Save</BtnPri>
        {saved && <span style={{fontSize:13,color:"var(--success-text)",fontWeight:500}}>✓ Saved</span>}
      </div>

      <ConfirmModal
        open={holidayRemoveIdx !== null}
        title="Remove holiday?"
        message={holidayRemoveIdx !== null && holidays[holidayRemoveIdx]
          ? `Remove "${holidays[holidayRemoveIdx].name}" (${holidays[holidayRemoveIdx].date}) from the list?`
          : ""}
        confirmLabel="Remove"
        onCancel={()=>setHolidayRemoveIdx(null)}
        onConfirm={()=>{
          if (holidayRemoveIdx !== null) removeHoliday(holidayRemoveIdx);
          setHolidayRemoveIdx(null);
        }}
      />
      <ConfirmModal
        open={!!templateLoadCountry}
        title="Replace holidays?"
        message={templateLoadCountry ? `Replace all holidays with ${templateLoadCountry} public holidays? Your current list will be replaced.` : ""}
        confirmLabel="Replace all"
        onCancel={()=>setTemplateLoadCountry(null)}
        onConfirm={()=>{
          if (templateLoadCountry) {
            const template = HOLIDAY_TEMPLATES[templateLoadCountry] || [];
            setHolidays(template);
          }
          setTemplateLoadCountry(null);
        }}
      />
    </div>
  );
}

// ── Export Section ─────────────────────────────────────────────────────────
function ExportSection({ employees, projects, assignments, year, month, showToast }) {
  const [exporting, setExporting] = useState(null);

  async function handleExport(type) {
    try {
      setExporting(type);
      let result;
      switch(type) {
        case 'roster':
          result = exportRoster(assignments, employees, projects, year, month);
          showToast(`✓ Exported ${result.rows} roster entries`);
          break;
        case 'employees':
          result = exportEmployees(employees);
          showToast(`✓ Exported ${result.rows} employees`);
          break;
        case 'projects':
          result = exportProjects(projects);
          showToast(`✓ Exported ${result.rows} projects`);
          break;
        case 'timesheets':
          result = exportTimesheets(assignments, employees, year, month);
          showToast(`✓ Exported ${result.rows} timesheets`);
          break;
        case 'bundle':
          result = exportMonthlyBundle(assignments, employees, projects, year, month);
          showToast(`✓ Exported bundle with ${result.rosterRows} roster and ${result.timesheetRows} timesheets`);
          break;
      }
    } catch (err) {
      showToast(err.message || "Export failed");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div style={cardSt()}>
      <div style={{fontWeight:600,fontSize:14,marginBottom:16,display:"flex",alignItems:"center",gap:8}}>
        <span>📥</span> Export Data
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}>
        <BtnPri onClick={()=>handleExport('roster')} disabled={exporting==='roster'} style={{fontSize:13}}>
          {exporting==='roster' ? "Exporting..." : "📋 Roster"}
        </BtnPri>
        <BtnPri onClick={()=>handleExport('employees')} disabled={exporting==='employees'} style={{fontSize:13}}>
          {exporting==='employees' ? "Exporting..." : "👥 Employees"}
        </BtnPri>
        <BtnPri onClick={()=>handleExport('projects')} disabled={exporting==='projects'} style={{fontSize:13}}>
          {exporting==='projects' ? "Exporting..." : "🎯 Projects"}
        </BtnPri>
        <BtnPri onClick={()=>handleExport('timesheets')} disabled={exporting==='timesheets'} style={{fontSize:13}}>
          {exporting==='timesheets' ? "Exporting..." : "⏱️ Timesheets"}
        </BtnPri>
        <BtnPri onClick={()=>handleExport('bundle')} disabled={exporting==='bundle'} style={{fontSize:13}}>
          {exporting==='bundle' ? "Exporting..." : "📦 Bundle"}
        </BtnPri>
      </div>
      <div style={{fontSize:12,color:"var(--text-muted)",marginTop:12}}>
        Downloads are timestamped and include all data for selected scope.
      </div>
    </div>
  );
}

// ── Import Section ─────────────────────────────────────────────────────────
function ImportSection({ employees, projects, refreshProjects, showToast, supabase }) {
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importType, setImportType] = useState('employees');
  const [preview, setPreview] = useState(null);
  const [action, setAction] = useState('skip');
  const [importing, setImporting] = useState(false);

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const text = await file.text();
    setImportFile(text);

    if (importType === 'employees') {
      setPreview(validateEmployeesCSV(text, employees));
    } else if (importType === 'projects') {
      setPreview(validateProjectsCSV(text, projects));
    } else {
      setPreview(validateHolidayCSV(text));
    }
  }

  async function handleImport() {
    if (!preview) return;
    setImporting(true);
    try {
      if (importType === 'employees') {
        const result = await applyEmployeeImport(preview.valid, preview.duplicates, supabase, action);
        if (result.imported > 0) {
          showToast(`✓ Imported ${result.imported} employees`);
          if (result.skipped > 0) showToast(`⚠ Skipped ${result.skipped} duplicates`);
        } else {
          showToast("No employees imported");
        }
        if (result.errors.length > 0) {
          showToast(`✗ ${result.errors[0]}`);
        }
      } else if (importType === 'projects') {
        const result = await applyProjectImport(preview.valid, preview.duplicates, supabase, action);
        if (result.imported > 0) {
          showToast(`✓ Imported or updated ${result.imported} projects`);
          if (result.skipped > 0) showToast(`⚠ Skipped ${result.skipped} existing (use Overwrite to replace)`);
        } else {
          showToast("No projects imported");
        }
        if (result.errors.length > 0) {
          showToast(`✗ ${result.errors[0]}`);
        }
        await refreshProjects?.();
      } else {
        showToast("Holiday import is not applied to the database yet — use the template to validate dates only.");
      }
      setShowImport(false);
      setPreview(null);
    } catch (err) {
      showToast(err.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div style={cardSt()}>
      <div style={{fontWeight:600,fontSize:14,marginBottom:16,display:"flex",alignItems:"center",gap:8}}>
        <span>📤</span> Import Data
      </div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:16}}>
        <select value={importType} onChange={e=>setImportType(e.target.value)} style={selSt({fontSize:13})}>
          <option value="employees">Import Employees</option>
          <option value="projects">Import Projects (sites / clients)</option>
          <option value="holidays">Import Holidays</option>
        </select>
        <BtnPri onClick={()=>setShowImport(true)} style={{fontSize:13}}>Choose file…</BtnPri>
        <Btn onClick={()=>{
          if (importType === 'employees') downloadEmployeeTemplate();
          else if (importType === 'projects') downloadProjectTemplate();
          else downloadHolidayTemplate();
        }} style={{fontSize:13}}>📋 Template</Btn>
      </div>

      {showImport && (
        <Overlay onClick={()=>setShowImport(false)}>
          <ModalBox onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:16,fontWeight:600,marginBottom:16}}>Import {importType}</div>
            
            <input type="file" accept=".csv" onChange={handleFileSelect} style={{marginBottom:16,display:"block"}}/>

            {preview && (
              <div style={{marginBottom:16}}>
                <Alert type={preview.errors?.length === 0 ? 'info' : 'error'}>
                  Valid: {preview.summary?.valid} | Errors: {preview.summary?.errors} | Duplicates: {preview.summary?.duplicates ?? 0}
                </Alert>

                {preview.valid?.length > 0 && importType !== 'holidays' && (
                  <div style={{marginTop:12}}>
                    <Lbl>Duplicate handling</Lbl>
                    <select value={action} onChange={e=>setAction(e.target.value)} style={selSt({fontSize:13})}>
                      <option value="skip">Skip duplicates</option>
                      <option value="overwrite">Overwrite duplicates</option>
                    </select>
                  </div>
                )}

                {preview.errors?.length > 0 && (
                  <div style={{maxHeight:150,overflowY:"auto",marginTop:12,padding:10,background:"var(--danger-bg)",borderRadius:6,border:"1px solid var(--danger-border)"}}>
                    {preview.errors.map((err, idx) => (
                      <div key={idx} style={{fontSize:12,color:"var(--danger-text)",marginBottom:6}}>
                        Line {err.row}: {err.message}
                      </div>
                    ))}
                  </div>
                )}

                {preview.duplicates?.length > 0 && (
                  <div style={{maxHeight:100,overflowY:"auto",marginTop:12,padding:10,background:"var(--surface-warn)",borderRadius:6,border:"1px solid var(--surface-warn-border)"}}>
                    {preview.duplicates.map((dup, idx) => (
                      <div key={idx} style={{fontSize:12,color:"var(--surface-warn-text)"}}>
                        {dup.name} (line {dup.row})
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{display:"flex",gap:8,marginTop:16}}>
              <BtnPri onClick={handleImport} disabled={!preview || importing}>
                {importing ? "Importing..." : "Import"}
              </BtnPri>
              <Btn onClick={()=>setShowImport(false)}>Cancel</Btn>
            </div>
          </ModalBox>
        </Overlay>
      )}
    </div>
  );
}

// ── Certifications section (from original) ─────────────────────────────────
function CertificationsSection({ employees, certifications, setCertifications, showToast, supabase }) {
  const [filterEmp, setFilterEmp] = useState("all");
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm] = useState({ employee_id:"", name:"", issued_date:"", expiry_date:"", notes:"" });
  const [certToDelete, setCertToDelete] = useState(null);

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

  async function runDeleteCert() {
    if (!certToDelete) return;
    const id = certToDelete;
    setCertToDelete(null);
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
    if (diff < 0) return { label:"Expired", col:"var(--danger-text)", bg:"var(--danger-bg)" };
    if (diff < 30) return { label:`Expires in ${diff}d`, col:"var(--surface-warn-text)", bg:"var(--surface-warn)" };
    return { label:`Expires ${d}`, col:"var(--success-text)", bg:"var(--success-bg)" };
  }

  return (
    <div style={cardSt()}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <SecTitle>🎓 Certifications</SecTitle>
          <select value={filterEmp} onChange={e=>setFilterEmp(e.target.value)} style={selSt({fontSize:13,padding:"6px 10px"})}>
            <option value="all">All employees</option>
            {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <BtnPri onClick={()=>setShowForm(v=>!v)} style={{fontSize:13,padding:"8px 14px"}}>+ Add certification</BtnPri>
      </div>

      {showForm && (
        <div style={{...cardSt(),background:"var(--bg-muted)",marginBottom:16}}>
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

      {certifications.filter(c=>{if(!c.expiry_date)return false;const diff=Math.floor((new Date(c.expiry_date)-new Date())/86400000);return diff<30;}).length > 0 && (
        <Alert type="warn">
          ⚠ {certifications.filter(c=>{if(!c.expiry_date)return false;const diff=Math.floor((new Date(c.expiry_date)-new Date())/86400000);return diff<30;}).length} certification(s) expiring within 30 days
        </Alert>
      )}

      {filtered.length === 0 && (
        <div style={{textAlign:"center",padding:"32px 0",color:"var(--text-faint)",fontSize:14}}>No certifications recorded yet.</div>
      )}
      {filtered.map(c => {
        const es = expiryStatus(c.expiry_date);
        return (
          <div key={c.id} style={cardSt({display:"flex",justifyContent:"space-between",alignItems:"center"})}>
            <div>
              <div style={{fontWeight:600,fontSize:14,color:"var(--text-primary)"}}>{c.name}</div>
              <div style={{fontSize:13,color:"var(--text-muted)",marginTop:2}}>{empName(c.employee_id)}</div>
              <div style={{marginTop:6,display:"flex",gap:6,flexWrap:"wrap"}}>
                {c.issued_date && <span style={{fontSize:12,color:"var(--text-muted)"}}>Issued: {c.issued_date}</span>}
                {es && <span style={{fontSize:12,fontWeight:600,padding:"2px 8px",borderRadius:99,background:es.bg,color:es.col}}>{es.label}</span>}
              </div>
              {c.notes && <div style={{fontSize:12,color:"var(--text-faint)",marginTop:4}}>{c.notes}</div>}
            </div>
            <BtnDanger onClick={()=>setCertToDelete(c.id)} style={{fontSize:12}}>Remove</BtnDanger>
          </div>
        );
      })}
      <ConfirmModal
        open={!!certToDelete}
        title="Delete certification?"
        message={(() => {
          if (!certToDelete) return "";
          const row = certifications.find((x) => x.id === certToDelete);
          return row
            ? `Remove "${row.name}" for ${empName(row.employee_id)}? This cannot be undone.`
            : "Remove this certification? This cannot be undone.";
        })()}
        onCancel={()=>setCertToDelete(null)}
        onConfirm={runDeleteCert}
      />
    </div>
  );
}

// ── Main Settings Tab ──────────────────────────────────────────────────────
export default function SettingsTab({
  employees, setEmployees,
  certifications, setCertifications,
  shiftRules, setShiftRules,
  userProfiles, setUserProfiles,
  assignments,
  projects,
  refreshProjects,
  showToast,
  supabase,
  year, month,
}) {
  const { getSetting, setSetting, updateBulk } = useSettings();
  const [expandedSections, setExpandedSections] = useState({
    organization: true,
    business: true,
    defaults: true,
    calendar: true,
    export: false,
    import: false,
    certifications: false,
  });

  const toggleSection = (key) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const CollapsibleSection = ({ title, icon, sectionKey, children }) => (
    <div style={{marginBottom:20}}>
      <button type="button" onClick={()=>toggleSection(sectionKey)}
        style={{
          width:"100%",
          padding:"14px 16px",
          background:"var(--bg-muted)",
          border:"1px solid var(--border)",
          borderRadius:8,
          display:"flex",
          justifyContent:"space-between",
          alignItems:"center",
          cursor:"pointer",
          fontSize:14,
          fontWeight:600,
          color:"var(--text-primary)",
        }}>
        <span style={{display:"flex",alignItems:"center",gap:8}}>
          <span>{icon}</span> {title}
        </span>
        <span style={{fontSize:18,transform: expandedSections[sectionKey] ? "rotate(0deg)" : "rotate(-90deg)",transition:"transform 0.2s"}}>⌄</span>
      </button>
      {expandedSections[sectionKey] && (
        <div style={{marginTop:12}}>
          {children}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <CollapsibleSection title="Organization" icon="🏢" sectionKey="organization">
        <OrganizationSection getSetting={getSetting} setSetting={setSetting} showToast={showToast} supabase={supabase}/>
      </CollapsibleSection>

      <CollapsibleSection title="Business Rules" icon="⚙️" sectionKey="business">
        <BusinessRulesSection getSetting={getSetting} setSetting={setSetting} showToast={showToast}/>
      </CollapsibleSection>

      <CollapsibleSection title="Defaults" icon="📋" sectionKey="defaults">
        <DefaultsSection getSetting={getSetting} setSetting={setSetting} showToast={showToast}/>
      </CollapsibleSection>

      <CollapsibleSection title="Calendar & Regional" icon="📅" sectionKey="calendar">
        <CalendarSection getSetting={getSetting} setSetting={setSetting} showToast={showToast}/>
      </CollapsibleSection>

      <CollapsibleSection title="Export Data" icon="📥" sectionKey="export">
        <ExportSection employees={employees} projects={projects} assignments={assignments} year={year} month={month} showToast={showToast}/>
      </CollapsibleSection>

      <CollapsibleSection title="Import Data" icon="📤" sectionKey="import">
        <ImportSection
          employees={employees}
          projects={projects}
          refreshProjects={refreshProjects}
          showToast={showToast}
          supabase={supabase}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Certifications" icon="🎓" sectionKey="certifications">
        <CertificationsSection employees={employees} certifications={certifications} setCertifications={setCertifications} showToast={showToast} supabase={supabase}/>
      </CollapsibleSection>
    </div>
  );
}
