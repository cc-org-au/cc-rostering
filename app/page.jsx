"use client";
import { useState } from "react";
import AuthScreen from "./components/AuthScreen";
import RosterApp from "./RosterApp";
import { AuthProvider, useAuthProvider } from "../lib/useAuth";

function PageContent() {
  const auth = useAuthProvider();
  const [demoMode, setDemoMode] = useState(false);

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
