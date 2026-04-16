"use client";
import { useState, useEffect } from "react";
import { Avatar, Btn, BtnDanger, BtnPri, Lbl, FocusInp, selSt, Alert, ModalBox, Overlay } from "./shared";

export default function AdminPanel({ auth }) {
  const { supabase, profile, canManageUsers, inviteUser, updateUserRole, deactivateUser, getAuditLogs } = auth;
  const [users, setUsers] = useState([]);
  const [tab, setTab] = useState("users"); // users | audit
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("manager");
  const [auditLogs, setAuditLogs] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [newRole, setNewRole] = useState("");

  if (!profile || !canManageUsers()) {
    return (
      <div style={{padding:16,background:"#fef2f2",border:"1.5px solid #fecaca",borderRadius:8,color:"#dc2626"}}>
        You don't have permission to access this panel.
      </div>
    );
  }

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from("app_users")
        .select("*")
        .order("created_at", { ascending: false });

      if (err) throw err;
      setUsers(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!inviteEmail) {
      setError("Email is required");
      return;
    }

    setLoading(true);
    try {
      await inviteUser(inviteEmail, inviteRole);
      setSuccess(`Invitation sent to ${inviteEmail}`);
      setInviteEmail("");
      setInviteRole("manager");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!editingUser || !newRole) return;
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      await updateUserRole(editingUser.id, newRole);
      setSuccess(`${editingUser.full_name}'s role updated to ${newRole}`);
      await loadUsers();
      setEditingUser(null);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async (user) => {
    if (!window.confirm(`Deactivate ${user.full_name}? They will no longer be able to log in.`)) {
      return;
    }

    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      await deactivateUser(user.id);
      setSuccess(`${user.full_name} has been deactivated`);
      await loadUsers();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadAuditLogs = async () => {
    try {
      const logs = await getAuditLogs(100);
      setAuditLogs(logs);
    } catch (err) {
      setError(err.message);
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

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="ok">{success}</Alert>}

      <div style={{display:"flex",borderBottom:"1.5px solid #e5e7eb",gap:8}}>
        {["users","audit"].map(t => (
          <button key={t} onClick={() => { setTab(t); if (t === "audit") loadAuditLogs(); }}
            style={{padding:"10px 14px",border:"none",background:"none",cursor:"pointer",fontSize:13,fontWeight:500,color:tab===t?"#4f46e5":"#9ca3af",borderBottom:tab===t?"2px solid #4f46e5":"2px solid transparent",marginBottom:-1.5}}>
            {t==="users"?`Users (${users.length})":"Activity"}
          </button>
        ))}
      </div>

      {tab === "users" && (
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          {/* INVITE FORM */}
          <div style={{padding:16,background:"#f9fafb",borderRadius:12,border:"1.5px solid #e5e7eb"}}>
            <h3 style={{margin:"0 0 12px",fontSize:14,fontWeight:600,color:"#111827"}}>Invite new user</h3>
            <form onSubmit={handleInvite} style={{display:"flex",gap:10}}>
              <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="user@example.com"
                style={{flex:1,...inpSt(),padding:"8px 10px",fontSize:12}}
                onFocus={e=>e.target.style.borderColor="#4f46e5"}
                onBlur={e=>e.target.style.borderColor="#d1d5db"}/>
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={{...selSt(),padding:"8px 10px",fontSize:12,width:120}}>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="dispatcher">Dispatcher</option>
                <option value="employee">Employee</option>
              </select>
              <BtnPri onClick={handleInvite} style={{fontSize:12,padding:"8px 14px",whiteSpace:"nowrap",opacity:loading?0.6:1,cursor:loading?"not-allowed":"pointer"}}>
                {loading?"…":"Send Invite"}
              </BtnPri>
            </form>
          </div>

          {/* USERS TABLE */}
          <div style={{overflowX:"auto"}}>
            <table style={{borderCollapse:"collapse",fontSize:12,width:"100%"}}>
              <thead>
                <tr style={{borderBottom:"1.5px solid #e5e7eb"}}>
                  <th style={{textAlign:"left",padding:"8px 12px",fontWeight:600,color:"#6b7280"}}>User</th>
                  <th style={{textAlign:"left",padding:"8px 12px",fontWeight:600,color:"#6b7280"}}>Email</th>
                  <th style={{textAlign:"left",padding:"8px 12px",fontWeight:600,color:"#6b7280"}}>Role</th>
                  <th style={{textAlign:"left",padding:"8px 12px",fontWeight:600,color:"#6b7280"}}>Joined</th>
                  <th style={{textAlign:"right",padding:"8px 12px",fontWeight:600,color:"#6b7280"}}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => {
                  const roleColor = getRoleBadgeColor(user.role);
                  return (
                    <tr key={user.id} style={{borderBottom:"1px solid #f3f4f6"}}>
                      <td style={{padding:"10px 12px",whiteSpace:"nowrap"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <Avatar name={user.full_name} color="#4f46e5"/>
                          <div style={{fontWeight:500,color:"#111827"}}>{user.full_name}</div>
                        </div>
                      </td>
                      <td style={{padding:"10px 12px",color:"#6b7280",fontSize:11}}>{user.email}</td>
                      <td style={{padding:"10px 12px"}}>
                        <span style={{padding:"3px 8px",borderRadius:99,fontSize:11,fontWeight:600,background:roleColor.bg,color:roleColor.col,textTransform:"capitalize"}}>
                          {user.role}
                        </span>
                      </td>
                      <td style={{padding:"10px 12px",color:"#9ca3af"}}>
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td style={{padding:"10px 12px",textAlign:"right"}}>
                        <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
                          <Btn onClick={() => { setEditingUser(user); setNewRole(user.role); }} style={{fontSize:11,padding:"4px 8px"}}>
                            Change role
                          </Btn>
                          {user.id !== profile.id && (
                            <BtnDanger onClick={() => handleDeactivate(user)} style={{fontSize:11,padding:"4px 8px"}}>
                              Deactivate
                            </BtnDanger>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {users.length === 0 && !loading && (
            <div style={{textAlign:"center",padding:"32px 16px",color:"#9ca3af"}}>
              No users yet. Invite one above.
            </div>
          )}
        </div>
      )}

      {tab === "audit" && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{fontSize:13,color:"#6b7280"}}>All user actions across the system</div>

          {auditLogs.length === 0 && !loading && (
            <div style={{textAlign:"center",padding:"24px 12px",color:"#9ca3af"}}>
              No activity logged
            </div>
          )}

          <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:500,overflowY:"auto"}}>
            {auditLogs.map(log => (
              <div key={log.id} style={{padding:"10px 12px",background:"#f9fafb",borderRadius:8,fontSize:11,borderLeft:"3px solid #4f46e5"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"start",marginBottom:4}}>
                  <div style={{fontWeight:600,color:"#111827",textTransform:"capitalize"}}>
                    {log.action.replace(/_/g," ")}
                  </div>
                  <div style={{color:"#9ca3af",whiteSpace:"nowrap"}}>
                    {new Date(log.created_at).toLocaleString()}
                  </div>
                </div>
                {log.details && (
                  <div style={{color:"#6b7280",fontSize:10}}>
                    {typeof log.details === "string" ? log.details : JSON.stringify(log.details)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ROLE CHANGE MODAL */}
      {editingUser && (
        <Overlay onClose={() => setEditingUser(null)}>
          <ModalBox maxWidth={400}>
            <h3 style={{margin:"0 0 16px",fontSize:16,fontWeight:600,color:"#111827"}}>Change role for {editingUser.full_name}</h3>

            <div style={{marginBottom:20}}>
              <Lbl>New role</Lbl>
              <select value={newRole} onChange={e => setNewRole(e.target.value)} style={selSt({width:"100%"})}>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="dispatcher">Dispatcher</option>
                <option value="employee">Employee</option>
              </select>
            </div>

            <div style={{display:"flex",gap:10}}>
              <Btn onClick={() => setEditingUser(null)} style={{flex:1}}>Cancel</Btn>
              <BtnPri onClick={handleUpdateRole} disabled={loading} style={{flex:1,opacity:loading?0.6:1}}>
                {loading?"Updating…":"Update"}
              </BtnPri>
            </div>
          </ModalBox>
        </Overlay>
      )}
    </div>
  );
}

// Helper function for input styles
const inpSt = (x={}) => ({width:"100%",boxSizing:"border-box",padding:"10px 12px",border:"1.5px solid #d1d5db",borderRadius:8,fontSize:14,fontFamily:"inherit",background:"#fff",color:"#111827",outline:"none",...x});
