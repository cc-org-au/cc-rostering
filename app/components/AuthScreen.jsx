"use client";
import { useState } from "react";
import { inpSt, BtnPri, Btn, Alert } from "./shared";

const ROLES = [
  { id: "admin", label: "Admin", desc: "Full system access", icon: "👑" },
  { id: "manager", label: "Manager", desc: "Create/edit projects & rosters", icon: "📋" },
  { id: "dispatcher", label: "Dispatcher", desc: "View roster & allocations", icon: "📦" },
  { id: "employee", label: "Employee", desc: "View own assignments", icon: "👤" },
];

export default function AuthScreen({ auth, onAuth }) {
  const [mode, setMode]       = useState("login"); // login | signup | reset | invite
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [selectedRole, setSelectedRole] = useState("employee");
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [info, setInfo]       = useState(null);

  // Check for invite mode in URL
  const getInitialMode = () => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("mode") === "invite") {
        return "invite";
      }
    }
    return "login";
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null); setInfo(null); setLoading(true);
    try {
      // TEST MODE: Accept any input and create admin session
      if (!email) {
        setError("Please enter an email");
        setLoading(false);
        return;
      }

      // Call test login API (uses service role to bypass RLS)
      const response = await fetch('/api/auth/test-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          fullName: fullName
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Login failed');
      }

      const testUser = await response.json();

      // Set local session data
      localStorage.setItem("testUser", JSON.stringify(testUser));

      if (rememberMe) {
        localStorage.setItem("rememberMe", email);
      }
      
      // Trigger auth update via custom event and then reload
      window.dispatchEvent(new CustomEvent('testUserLogin', { detail: testUser }));
      
      // Reload after a short delay to let event propagate
      setTimeout(() => {
        window.location.reload();
      }, 200);
    } catch (err) {
      setError(err.message || "Login failed");
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError(null); setInfo(null); setLoading(true);
    try {
      // Check if first user
      const { data: existingUsers } = await auth.supabase
        .from("app_users")
        .select("id")
        .limit(1);

      const allowedRole = (!existingUsers || existingUsers.length === 0) ? "admin" : "employee";
      if (selectedRole !== "employee" && allowedRole !== "admin") {
        throw new Error("Only admins can assign roles. Sign up as employee—an admin will update your role.");
      }

      await auth.handleSignup(email, password, fullName, allowedRole);
      setInfo("Account created! Check your email to confirm, then log in.");
      setEmail("");
      setPassword("");
      setFullName("");
      setMode("login");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError(null); setInfo(null); setLoading(true);
    try {
      await auth.resetPasswordForEmail(email);
      setInfo("Password reset email sent. Check your inbox.");
      setEmail("");
      setMode("login");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    setError(null); setInfo(null); setLoading(true);
    try {
      // Complete invited signup with role
      await auth.handleSignup(email, password, fullName, selectedRole);
      setInfo("Account created! Logging you in...");
      setTimeout(() => {
        window.location.href = "/";
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const currentMode = mode || getInitialMode();

  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#f9fafb",fontFamily:"system-ui,-apple-system,sans-serif",padding:16}}>
      <div style={{background:"#fff",borderRadius:16,padding:32,width:"min(480px,100%)",boxShadow:"0 4px 32px rgba(0,0,0,0.08)"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontSize:28,marginBottom:8}}>🌿</div>
          <h1 style={{margin:0,fontSize:22,fontWeight:700,color:"#111827"}}>Roster Manager</h1>
          <p style={{margin:"6px 0 0",fontSize:14,color:"#6b7280"}}>
            {currentMode==="login"?"Sign in to your account":
             currentMode==="signup"?"Create a new account":
             currentMode==="invite"?"Complete your invitation":
             "Reset your password"}
          </p>
        </div>

        {error && <Alert type="error">{error}</Alert>}
        {info  && <Alert type="ok">{info}</Alert>}

        {/* LOGIN */}
        {currentMode === "login" && (
          <form onSubmit={handleLogin} style={{display:"flex",flexDirection:"column",gap:14}}>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:"#374151",marginBottom:5}}>Email</div>
              <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"
                style={inpSt()}
                onFocus={e=>e.target.style.borderColor="#4f46e5"}
                onBlur={e=>e.target.style.borderColor="#d1d5db"}/>
            </div>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:"#374151",marginBottom:5}}>Password</div>
              <input type="password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"
                style={inpSt()}
                onFocus={e=>e.target.style.borderColor="#4f46e5"}
                onBlur={e=>e.target.style.borderColor="#d1d5db"}/>
            </div>
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,cursor:"pointer"}}>
              <input type="checkbox" checked={rememberMe} onChange={e=>setRememberMe(e.target.checked)} style={{width:16,height:16,cursor:"pointer"}}/>
              <span style={{color:"#6b7280"}}>Remember me</span>
            </label>
            <button type="submit" disabled={loading}
              style={{padding:"12px 18px",background:loading?"#a5b4fc":"#4f46e5",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontFamily:"inherit",fontWeight:600,cursor:loading?"not-allowed":"pointer",marginTop:4}}>
              {loading?"…":"Sign in"}
            </button>
          </form>
        )}

        {/* SIGNUP */}
        {currentMode === "signup" && (
          <form onSubmit={handleSignup} style={{display:"flex",flexDirection:"column",gap:14}}>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:"#374151",marginBottom:5}}>Full name *</div>
              <input type="text" required value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Jane Smith"
                style={inpSt()}
                onFocus={e=>e.target.style.borderColor="#4f46e5"}
                onBlur={e=>e.target.style.borderColor="#d1d5db"}/>
            </div>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:"#374151",marginBottom:5}}>Email *</div>
              <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"
                style={inpSt()}
                onFocus={e=>e.target.style.borderColor="#4f46e5"}
                onBlur={e=>e.target.style.borderColor="#d1d5db"}/>
            </div>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:"#374151",marginBottom:5}}>Password *</div>
              <input type="password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"
                style={inpSt()}
                onFocus={e=>e.target.style.borderColor="#4f46e5"}
                onBlur={e=>e.target.style.borderColor="#d1d5db"}/>
              <div style={{fontSize:12,color:"#9ca3af",marginTop:4}}>Minimum 6 characters</div>
            </div>
            <div style={{padding:"10px 12px",background:"#eff6ff",border:"1.5px solid #bfdbfe",borderRadius:8}}>
              <div style={{fontSize:12,fontWeight:600,color:"#1d4ed8",marginBottom:4}}>Note</div>
              <div style={{fontSize:13,color:"#1e40af",lineHeight:1.5}}>You'll sign up as an employee. An admin will assign your role after verifying your identity.</div>
            </div>
            <button type="submit" disabled={loading}
              style={{padding:"12px 18px",background:loading?"#a5b4fc":"#4f46e5",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontFamily:"inherit",fontWeight:600,cursor:loading?"not-allowed":"pointer",marginTop:4}}>
              {loading?"…":"Create account"}
            </button>
          </form>
        )}

        {/* INVITE */}
        {currentMode === "invite" && (
          <form onSubmit={handleInvite} style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{padding:"10px 12px",background:"#dcfce7",border:"1.5px solid #86efac",borderRadius:8}}>
              <div style={{fontSize:12,fontWeight:600,color:"#166534",marginBottom:2}}>✓ You've been invited!</div>
              <div style={{fontSize:13,color:"#15803d",lineHeight:1.5}}>Complete your profile to get started.</div>
            </div>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:"#374151",marginBottom:5}}>Full name *</div>
              <input type="text" required value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Jane Smith"
                style={inpSt()}
                onFocus={e=>e.target.style.borderColor="#4f46e5"}
                onBlur={e=>e.target.style.borderColor="#d1d5db"}/>
            </div>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:"#374151",marginBottom:5}}>Email *</div>
              <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"
                style={inpSt()}
                onFocus={e=>e.target.style.borderColor="#4f46e5"}
                onBlur={e=>e.target.style.borderColor="#d1d5db"}/>
            </div>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:"#374151",marginBottom:5}}>Password *</div>
              <input type="password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"
                style={inpSt()}
                onFocus={e=>e.target.style.borderColor="#4f46e5"}
                onBlur={e=>e.target.style.borderColor="#d1d5db"}/>
            </div>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:"#374151",marginBottom:10}}>Your role</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {ROLES.map(role => (
                  <button key={role.id} type="button" onClick={()=>setSelectedRole(role.id)}
                    style={{padding:12,borderRadius:10,border:`2px solid ${selectedRole===role.id?"#4f46e5":"#e5e7eb"}`,background:selectedRole===role.id?"#eef2ff":"#fff",cursor:"pointer",textAlign:"left",transition:"all 0.2s"}}>
                    <div style={{fontSize:18,marginBottom:4}}>{role.icon}</div>
                    <div style={{fontSize:13,fontWeight:600,color:selectedRole===role.id?"#4f46e5":"#111827"}}>{role.label}</div>
                    <div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>{role.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <button type="submit" disabled={loading}
              style={{padding:"12px 18px",background:loading?"#a5b4fc":"#4f46e5",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontFamily:"inherit",fontWeight:600,cursor:loading?"not-allowed":"pointer",marginTop:4}}>
              {loading?"…":"Complete signup"}
            </button>
          </form>
        )}

        {/* PASSWORD RESET */}
        {currentMode === "reset" && (
          <form onSubmit={handleReset} style={{display:"flex",flexDirection:"column",gap:14}}>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:"#374151",marginBottom:5}}>Email</div>
              <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"
                style={inpSt()}
                onFocus={e=>e.target.style.borderColor="#4f46e5"}
                onBlur={e=>e.target.style.borderColor="#d1d5db"}/>
              <div style={{fontSize:12,color:"#9ca3af",marginTop:4}}>We'll send you a link to reset your password.</div>
            </div>
            <button type="submit" disabled={loading}
              style={{padding:"12px 18px",background:loading?"#a5b4fc":"#4f46e5",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontFamily:"inherit",fontWeight:600,cursor:loading?"not-allowed":"pointer",marginTop:4}}>
              {loading?"…":"Send reset link"}
            </button>
          </form>
        )}

        <div style={{marginTop:20,display:"flex",flexDirection:"column",gap:10,alignItems:"center"}}>
          {currentMode === "login" && <>
            <button type="button" onClick={()=>{setMode("signup");setError(null);setInfo(null);setEmail("");setPassword("");}} style={{background:"none",border:"none",color:"#4f46e5",fontSize:13,cursor:"pointer",fontFamily:"inherit",textDecoration:"underline"}}>Don't have an account? Sign up</button>
            <button type="button" onClick={()=>{setMode("reset");setError(null);setInfo(null);setEmail("");}} style={{background:"none",border:"none",color:"#9ca3af",fontSize:13,cursor:"pointer",fontFamily:"inherit",textDecoration:"underline"}}>Forgot password?</button>
          </>}
          {currentMode !== "login" && (
            <button type="button" onClick={()=>{setMode("login");setError(null);setInfo(null);setEmail("");setPassword("");setFullName("");}} style={{background:"none",border:"none",color:"#4f46e5",fontSize:13,cursor:"pointer",fontFamily:"inherit",textDecoration:"underline"}}>Back to sign in</button>
          )}
        </div>
      </div>
    </div>
  );
}
