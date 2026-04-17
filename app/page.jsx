"use client";
import AuthScreen from "./components/AuthScreen";
import RosterApp from "./RosterApp";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { AuthProvider, useAuth } from "../lib/useAuth";

function PageContent() {
  const auth = useAuth();

  // Show loading state while auth is initializing
  if (auth.loading) {
    return (
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"var(--bg-page)"}}>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:28,marginBottom:16}}>🌿</div>
          <p style={{color:"var(--text-muted)"}}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!auth.user) {
    return (
      <AuthScreen 
        auth={auth} 
        onAuth={() => { /* Auth state is handled by useAuth hook */ }}
      />
    );
  }

  return (
    <RosterApp auth={auth} />
  );
}

export default function Page() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <PageContent />
      </AuthProvider>
    </AppErrorBoundary>
  );
}
