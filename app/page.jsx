"use client";
import { useState } from "react";
import AuthScreen from "./components/AuthScreen";
import RosterApp from "./RosterApp";
import { AuthProvider, useAuthProvider } from "../lib/useAuth";

function PageContent() {
  const auth = useAuthProvider();
  const [demoMode, setDemoMode] = useState(false);

  // Show loading state while auth is initializing
  if (auth.loading) {
    return (
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#f9fafb"}}>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:28,marginBottom:16}}>🌿</div>
          <p style={{color:"#6b7280"}}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!auth.user && !demoMode) {
    return (
      <AuthScreen 
        auth={auth} 
        onAuth={() => { /* Auth state is handled by useAuth hook */ }}
      />
    );
  }

  return (
    <RosterApp auth={auth} demoMode={demoMode} />
  );
}

export default function Page() {
  return (
    <AuthProvider>
      <PageContent />
    </AuthProvider>
  );
}
