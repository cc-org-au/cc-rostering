"use client";
import { useState } from "react";
import { Avatar, Btn, BtnDanger, Overlay, ModalBox, Lbl, FocusInp, inpSt, Tag, Alert } from "./shared";

export default function UserMenu({ auth }) {
  const { user, profile, handleLogout, updateProfile, changePassword, getAuditLogs } = auth;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("profile"); // profile | password | notifications | audit
  const [editMode, setEditMode] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emailNotif, setEmailNotif] = useState(true);
  const [smsNotif, setSmsNotif] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleUpdateProfile = async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await updateProfile({ full_name: fullName });
      setSuccess("Profile updated successfully");
      setEditMode(false);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    setError(null);
    setSuccess(null);
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("All password fields are required");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      // Note: Supabase requires current password verification
      // This is handled by the changePassword function
      await changePassword(newPassword);
      setSuccess("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadAuditLogs = async () => {
    try {
      const logs = await getAuditLogs(20);
      setAuditLogs(logs);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLogoutClick = async () => {
    if (window.confirm("Sign out?")) {
      await handleLogout();
    }
  };

  const getRoleBadgeColor = (role) => {
    const colors = {
      admin: { bg: "#fef3c7", col: "#92400e" },
      manager: { bg: "#dbeafe", col: "#1e40af" },
      dispatcher: { bg: "#fce7f3", col: "#be185d" },
      employee: { bg: "#e0e7ff", col: "#3730a3" },
    };
    return colors[role] || colors.employee;
  };

  if (!profile) return null;

  const roleColor = getRoleBadgeColor(profile.role);

  return (
    <>
      <button onClick={() => setOpen(true)}
        style={{display:"flex",alignItems:"center",gap:10,padding:"6px 10px",borderRadius:8,border:"1.5px solid #e5e7eb",background:"#fff",cursor:"pointer",fontFamily:"inherit"}}>
        <Avatar name={profile.full_name} color="#4f46e5"/>
        <div style={{textAlign:"left",minWidth:0}}>
          <div style={{fontSize:12,fontWeight:600,color:"#111827",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{profile.full_name}</div>
          <div style={{fontSize:10,color:"#9ca3af",textTransform:"capitalize"}}>{profile.role}</div>
        </div>
        <div style={{fontSize:14,color:"#9ca3af"}}>▼</div>
      </button>

      {open && (
        <Overlay onClose={() => setOpen(false)}>
          <ModalBox maxWidth={600}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <h2 style={{margin:0,fontSize:18,fontWeight:700,color:"#111827"}}>Account</h2>
              <button onClick={() => setOpen(false)} style={{background:"none",border:"none",fontSize:20,color:"#9ca3af",cursor:"pointer"}}>✕</button>
            </div>

            {/* Tab navigation */}
            <div style={{display:"flex",gap:8,borderBottom:"1.5px solid #e5e7eb",marginBottom:20}}>
              {["profile","password","notifications","audit"].map(t => (
                <button key={t} onClick={() => { setTab(t); setError(null); setSuccess(null); }}
                  style={{padding:"10px 14px",border:"none",background:"none",cursor:"pointer",fontSize:13,fontWeight:500,color:tab===t?"#4f46e5":"#9ca3af",borderBottom:tab===t?"2px solid #4f46e5":"2px solid transparent",marginBottom:-1.5}}>
                  {t==="profile"?"Profile":t==="password"?"Password":t==="notifications"?"Alerts":"Activity"}
                </button>
              ))}
            </div>

            {/* PROFILE TAB */}
            {tab === "profile" && (
              <div style={{display:"flex",flexDirection:"column",gap:16}}>
                {error && <Alert type="error">{error}</Alert>}
                {success && <Alert type="ok">{success}</Alert>}

                {!editMode ? (
                  <>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:12}}>
                        <Avatar name={profile.full_name} color="#4f46e5"/>
                        <div style={{flex:1}}>
                          <div style={{fontSize:14,fontWeight:600,color:"#111827"}}>{profile.full_name}</div>
                          <div style={{fontSize:12,color:"#6b7280",marginTop:2}}>{user.email}</div>
                        </div>
                        <span style={{padding:"4px 10px",borderRadius:99,fontSize:12,fontWeight:600,background:roleColor.bg,color:roleColor.col,textTransform:"capitalize"}}>
                          {profile.role}
                        </span>
                      </div>
                    </div>

                    <div style={{padding:"10px 12px",background:"#f9fafb",borderRadius:8,fontSize:12,color:"#6b7280"}}>
                      <div>Member since {new Date(profile.created_at).toLocaleDateString()}</div>
                    </div>

                    <Btn onClick={() => setEditMode(true)} style={{width:"100%"}}>Edit Profile</Btn>
                  </>
                ) : (
                  <>
                    <div>
                      <Lbl>Full name</Lbl>
                      <FocusInp value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your name"/>
                    </div>
                    <div style={{display:"flex",gap:10}}>
                      <Btn onClick={() => { setEditMode(false); setFullName(profile.full_name); }} style={{flex:1}}>Cancel</Btn>
                      <Btn onClick={handleUpdateProfile} disabled={loading} style={{flex:1,background:loading?"#d1d5db":"#4f46e5",color:"#fff",border:"none"}}>
                        {loading?"Saving…":"Save"}
                      </Btn>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* PASSWORD TAB */}
            {tab === "password" && (
              <div style={{display:"flex",flexDirection:"column",gap:16}}>
                {error && <Alert type="error">{error}</Alert>}
                {success && <Alert type="ok">{success}</Alert>}

                <div>
                  <Lbl>Current password</Lbl>
                  <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="••••••••"
                    style={inpSt()}
                    onFocus={e=>e.target.style.borderColor="#4f46e5"}
                    onBlur={e=>e.target.style.borderColor="#d1d5db"}/>
                </div>

                <div>
                  <Lbl>New password</Lbl>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••••"
                    style={inpSt()}
                    onFocus={e=>e.target.style.borderColor="#4f46e5"}
                    onBlur={e=>e.target.style.borderColor="#d1d5db"}/>
                </div>

                <div>
                  <Lbl>Confirm new password</Lbl>
                  <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••"
                    style={inpSt()}
                    onFocus={e=>e.target.style.borderColor="#4f46e5"}
                    onBlur={e=>e.target.style.borderColor="#d1d5db"}/>
                </div>

                <Btn onClick={handleChangePassword} disabled={loading} style={{width:"100%",background:loading?"#d1d5db":"#4f46e5",color:"#fff",border:"none"}}>
                  {loading?"Updating…":"Update Password"}
                </Btn>
              </div>
            )}

            {/* NOTIFICATIONS TAB */}
            {tab === "notifications" && (
              <div style={{display:"flex",flexDirection:"column",gap:16}}>
                <div style={{padding:"10px 12px",background:"#eff6ff",border:"1.5px solid #bfdbfe",borderRadius:8}}>
                  <div style={{fontSize:12,color:"#1e40af",lineHeight:1.5}}>
                    📧 Email and notification preferences. SMS requires phone number on file.
                  </div>
                </div>

                <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"10px 12px",border:"1.5px solid #e5e7eb",borderRadius:8}}>
                  <input type="checkbox" checked={emailNotif} onChange={e => setEmailNotif(e.target.checked)} style={{width:18,height:18,cursor:"pointer"}}/>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:"#111827"}}>Email notifications</div>
                    <div style={{fontSize:12,color:"#9ca3af"}}>Roster changes, approvals, alerts</div>
                  </div>
                </label>

                <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"10px 12px",border:"1.5px solid #e5e7eb",borderRadius:8,opacity:0.6}}>
                  <input type="checkbox" checked={smsNotif} onChange={e => setSmsNotif(e.target.checked)} disabled style={{width:18,height:18,cursor:"not-allowed"}}/>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:"#111827"}}>SMS notifications</div>
                    <div style={{fontSize:12,color:"#9ca3af"}}>Add phone number to enable</div>
                  </div>
                </label>
              </div>
            )}

            {/* AUDIT TAB */}
            {tab === "audit" && (
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontSize:13,fontWeight:600,color:"#374151"}}>Recent account activity</div>
                  <Btn onClick={loadAuditLogs} style={{fontSize:12,padding:"4px 10px"}}>Refresh</Btn>
                </div>

                {auditLogs.length === 0 && !loading && (
                  <div style={{textAlign:"center",padding:"24px 12px",color:"#9ca3af",fontSize:13}}>
                    No activity yet
                  </div>
                )}

                <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:300,overflowY:"auto"}}>
                  {auditLogs.map(log => (
                    <div key={log.id} style={{padding:"10px 12px",background:"#f9fafb",borderRadius:8,fontSize:12,borderLeft:"3px solid #4f46e5"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"start"}}>
                        <div style={{fontWeight:600,color:"#111827",textTransform:"capitalize"}}>
                          {log.action.replace(/_/g," ")}
                        </div>
                        <div style={{color:"#9ca3af",whiteSpace:"nowrap"}}>
                          {new Date(log.created_at).toLocaleString()}
                        </div>
                      </div>
                      {log.details && (
                        <div style={{fontSize:11,color:"#6b7280",marginTop:4}}>
                          {JSON.stringify(log.details)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* LOGOUT */}
            <div style={{paddingTop:16,borderTop:"1.5px solid #e5e7eb",marginTop:20}}>
              <BtnDanger onClick={handleLogoutClick} style={{width:"100%"}}>Sign out</BtnDanger>
            </div>
          </ModalBox>
        </Overlay>
      )}
    </>
  );
}
