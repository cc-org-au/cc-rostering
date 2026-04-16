"use client";
import { useState, useEffect, useCallback, useContext, createContext, useRef } from "react";
import { supabase } from "./supabase";

const AuthContext = createContext(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

function readTestUserFromStorage() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("testUser");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function useAuthProvider() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const inactivityTimerRef = useRef(null);
  const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  const loadUserProfile = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from("app_users")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (err) {
      console.error("Profile load error:", err);
    }
  }, []);

  // Initialize auth once: read test session synchronously before subscribing to Supabase
  useEffect(() => {
    let subscription;

    const applyTestUser = (tu) => {
      setUser({ id: tu.id, email: tu.email });
      setProfile(tu);
    };

    const handleTestLogin = (e) => {
      applyTestUser(e.detail);
    };

    if (typeof window !== "undefined") {
      window.addEventListener("testUserLogin", handleTestLogin);
    }

    const testUser = readTestUserFromStorage();
    if (testUser) {
      applyTestUser(testUser);
      setLoading(false);
    } else {
      (async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            setUser(session.user);
            await loadUserProfile(session.user.id);
          } else {
            setUser(null);
            setProfile(null);
          }
        } catch (err) {
          console.error("Auth init error:", err);
          setUser(null);
          setProfile(null);
        } finally {
          setLoading(false);
        }
      })();

      const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
          setUser(session.user);
          await loadUserProfile(session.user.id);
          return;
        }
        const tu = readTestUserFromStorage();
        if (tu) {
          applyTestUser(tu);
          return;
        }
        setUser(null);
        setProfile(null);
      });
      subscription = data.subscription;
    }

    return () => {
      subscription?.unsubscribe();
      if (typeof window !== "undefined") {
        window.removeEventListener("testUserLogin", handleTestLogin);
      }
    };
  }, [loadUserProfile]);

  const logAuditEvent = useCallback(async (action, details = null) => {
    if (!user) return;
    try {
      await supabase.from("auth_audit_logs").insert({
        user_id: user.id,
        action,
        details,
      });
    } catch (err) {
      console.error("Audit log error:", err);
    }
  }, [user]);

  const handleLogin = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    await logAuditEvent("login", { email });
    return data;
  }, [logAuditEvent]);

  const handleSignup = useCallback(async (email, password, fullName, role = "employee") => {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });
    if (authError) throw authError;

    // Create app_users profile
    const { error: profileError } = await supabase.from("app_users").insert({
      id: authData.user?.id,
      email,
      full_name: fullName,
      role,
    });
    if (profileError) throw profileError;

    await logAuditEvent("signup", { email, role });
    return authData;
  }, [logAuditEvent]);

  const handleLogout = useCallback(async () => {
    await logAuditEvent("logout");
    // Clear test user
    if (typeof window !== "undefined") {
      localStorage.removeItem("testUser");
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
    setProfile(null);
  }, [logAuditEvent]);

  // Inactivity auto-logout (disabled while using test-login — avoids effect churn on every interaction)
  useEffect(() => {
    if (!user) return;
    if (typeof window !== "undefined" && localStorage.getItem("testUser")) return;

    const resetTimer = () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = setTimeout(() => {
        handleLogout();
      }, INACTIVITY_TIMEOUT);
    };

    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, resetTimer));
    resetTimer();

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [user, handleLogout]);

  const updateProfile = useCallback(async (updates) => {
    if (!user) throw new Error("No user session");

    const { error } = await supabase
      .from("app_users")
      .update(updates)
      .eq("id", user.id);

    if (error) throw error;
    await loadUserProfile(user.id);
    await logAuditEvent("profile_update", { fields: Object.keys(updates) });
  }, [user, loadUserProfile, logAuditEvent]);

  const changePassword = useCallback(async (newPassword) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) throw error;
    await logAuditEvent("password_changed");
  }, [logAuditEvent]);

  const resetPasswordForEmail = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
    await logAuditEvent("password_reset_requested", { email });
  }, [logAuditEvent]);

  const inviteUser = useCallback(async (email, role = "employee") => {
    if (profile?.role !== "admin") {
      throw new Error("Only admins can invite users");
    }

    // For now, send a password reset link which acts as an invite
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}?mode=invite&role=${role}`,
    });
    if (error) throw error;

    await logAuditEvent("user_invited", { email, role });
  }, [profile, logAuditEvent]);

  const updateUserRole = useCallback(async (userId, newRole) => {
    if (profile?.role !== "admin") {
      throw new Error("Only admins can update user roles");
    }

    const { error } = await supabase
      .from("app_users")
      .update({ role: newRole })
      .eq("id", userId);

    if (error) throw error;
    await logAuditEvent("user_role_updated", { user_id: userId, new_role: newRole });
  }, [profile, logAuditEvent]);

  const deactivateUser = useCallback(async (userId) => {
    if (profile?.role !== "admin") {
      throw new Error("Only admins can deactivate users");
    }

    // Delete user from auth
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) throw error;

    await logAuditEvent("user_deactivated", { user_id: userId });
  }, [profile, logAuditEvent]);

  const getAuditLogs = useCallback(async (limit = 50) => {
    try {
      let query = supabase.from("auth_audit_logs").select("*");

      // Non-admins only see their own logs
      if (profile?.role !== "admin") {
        query = query.eq("user_id", user.id);
      }

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data;
    } catch (err) {
      console.error("Audit logs fetch error:", err);
      return [];
    }
  }, [user, profile]);

  // Permission checking helpers
  const canEdit = useCallback((resource) => {
    if (!profile) return false;
    if (profile.role === "admin") return true;
    if (profile.role === "manager") return true;
    if (profile.role === "dispatcher" && resource === "roster") return true;
    return false;
  }, [profile]);

  const canViewReports = useCallback(() => {
    if (!profile) return false;
    return ["admin", "manager", "dispatcher"].includes(profile.role);
  }, [profile]);

  const canManageUsers = useCallback(() => {
    return profile?.role === "admin";
  }, [profile]);

  const canSubmitAvailability = useCallback(() => {
    return profile?.role === "employee";
  }, [profile]);

  return {
    user,
    profile,
    loading,
    supabase,
    // Auth methods
    handleLogin,
    handleSignup,
    handleLogout,
    resetPasswordForEmail,
    changePassword,
    updateProfile,
    // Admin methods
    inviteUser,
    updateUserRole,
    deactivateUser,
    getAuditLogs,
    // Permission helpers
    canEdit,
    canViewReports,
    canManageUsers,
    canSubmitAvailability,
    logAuditEvent,
  };
}

export function AuthProvider({ children }) {
  const authValue = useAuthProvider();
  return (
    <AuthContext.Provider value={authValue}>
      {children}
    </AuthContext.Provider>
  );
}
