"use client";
import { useState } from "react";
import { inpSt, BtnPri, Btn, Alert } from "./shared";

export default function AuthScreen({ supabase, onAuth }) {
  const [mode, setMode]       = useState("login"); // login | signup | reset
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [info, setInfo]       = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null); setInfo(null); setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onAuth();
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setInfo("Account created! Check your email to confirm, then log in.");
        setMode("login");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
        setInfo("Password reset email sent. Check your inbox.");
        setMode("login");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#f9fafb",fontFamily:"system-ui,-apple-system,sans-serif",padding:16}}>
      <div style={{background:"#fff",borderRadius:16,padding:32,width:"min(420px,100%)",boxShadow:"0 4px 32px rgba(0,0,0,0.08)"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontSize:28,marginBottom:8}}>🌿</div>
          <h1 style={{margin:0,fontSize:22,fontWeight:700,color:"#111827"}}>Roster Manager</h1>
          <p style={{margin:"6px 0 0",fontSize:14,color:"#6b7280"}}>
            {mode==="login"?"Sign in to your account":mode==="signup"?"Create a new account":"Reset your password"}
          </p>
        </div>

        {error && <Alert type="error">{error}</Alert>}
        {info  && <Alert type="ok">{info}</Alert>}

        <form onSubmit={handleSubmit} style={{display:"flex",flexDirection:"column",gap:14}}>
          <div>
            <div style={{fontSize:13,fontWeight:600,color:"#374151",marginBottom:5}}>Email</div>
            <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"
              style={inpSt()}
              onFocus={e=>e.target.style.borderColor="#4f46e5"}
              onBlur={e=>e.target.style.borderColor="#d1d5db"}/>
          </div>
          {mode !== "reset" && (
            <div>
              <div style={{fontSize:13,fontWeight:600,color:"#374151",marginBottom:5}}>Password</div>
              <input type="password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"
                style={inpSt()}
                onFocus={e=>e.target.style.borderColor="#4f46e5"}
                onBlur={e=>e.target.style.borderColor="#d1d5db"}/>
            </div>
          )}
          <button type="submit" disabled={loading}
            style={{padding:"12px 18px",background:loading?"#a5b4fc":"#4f46e5",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontFamily:"inherit",fontWeight:600,cursor:loading?"not-allowed":"pointer",marginTop:4}}>
            {loading?"…":mode==="login"?"Sign in":mode==="signup"?"Create account":"Send reset email"}
          </button>
        </form>

        <div style={{marginTop:20,display:"flex",flexDirection:"column",gap:10,alignItems:"center"}}>
          {mode==="login" && <>
            <button type="button" onClick={()=>{setMode("signup");setError(null);setInfo(null);}} style={{background:"none",border:"none",color:"#4f46e5",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Don't have an account? Sign up</button>
            <button type="button" onClick={()=>{setMode("reset");setError(null);setInfo(null);}} style={{background:"none",border:"none",color:"#9ca3af",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Forgot password?</button>
          </>}
          {mode!=="login" && (
            <button type="button" onClick={()=>{setMode("login");setError(null);setInfo(null);}} style={{background:"none",border:"none",color:"#4f46e5",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Back to sign in</button>
          )}
        </div>

        {/* Dev bypass */}
        <div style={{marginTop:24,paddingTop:16,borderTop:"1px solid #e5e7eb",textAlign:"center"}}>
          <button type="button" onClick={onAuth} style={{background:"none",border:"none",color:"#9ca3af",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
            Continue without account (demo mode)
          </button>
        </div>
      </div>
    </div>
  );
}
