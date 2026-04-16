"use client";

import { useState, useEffect, useCallback } from "react";
import { API_SCOPES } from "../../lib/apiScopes";
import {
  cardSt, inpSt, BtnPri, Btn, BtnDanger, Lbl, FocusInp, SecTitle, Tag,
} from "./shared";

async function getAccessToken(auth) {
  const { data } = await auth.supabase.auth.getSession();
  return data.session?.access_token || null;
}

export default function AdminTab({ auth, showToast }) {
  const [sub, setSub] = useState("users"); // users | apikeys
  const [users, setUsers] = useState([]);
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [keysLoading, setKeysLoading] = useState(false);

  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState(["read:projects", "read:employees", "read:assignments"]);
  const [revealedKey, setRevealedKey] = useState(null); // { key, warning } once
  const [revokingId, setRevokingId] = useState(null);

  const loadUsers = useCallback(async () => {
    try {
      const { data, error } = await auth.supabase.from("app_users").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      setUsers(data || []);
    } catch (e) {
      showToast(e.message || "Failed to load users");
    }
  }, [auth.supabase, showToast]);

  const loadKeys = useCallback(async () => {
    const token = await getAccessToken(auth);
    if (!token) {
      showToast("Sign in with a real account to manage API keys (session token required).");
      setKeys([]);
      return;
    }
    setKeysLoading(true);
    try {
      const res = await fetch("/api/admin/api-keys", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || res.statusText);
      setKeys(json.keys || []);
    } catch (e) {
      showToast(e.message || "Failed to load API keys");
    } finally {
      setKeysLoading(false);
    }
  }, [auth, showToast]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await loadUsers();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [loadUsers]);

  useEffect(() => {
    if (sub === "apikeys") loadKeys();
  }, [sub, loadKeys]);

  async function updateRole(userId, role) {
    try {
      await auth.updateUserRole(userId, role);
      showToast("Role updated");
      await loadUsers();
    } catch (e) {
      showToast(e.message || "Update failed");
    }
  }

  async function createApiKey(e) {
    e.preventDefault();
    const token = await getAccessToken(auth);
    if (!token) {
      showToast("Session required to create API keys.");
      return;
    }
    if (!newKeyName.trim()) {
      showToast("Enter a label for this key.");
      return;
    }
    if (newKeyScopes.length === 0) {
      showToast("Select at least one scope.");
      return;
    }
    try {
      const res = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: newKeyName.trim(), scopes: newKeyScopes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || res.statusText);
      setRevealedKey({ key: json.key, name: json.name, warning: json.warning });
      setNewKeyName("");
      showToast("Key created — copy it now (shown once).");
      await loadKeys();
    } catch (e) {
      showToast(e.message || "Create failed");
    }
  }

  async function revokeKey(id) {
    if (!window.confirm("Revoke this API key? Integrations using it will stop working.")) return;
    const token = await getAccessToken(auth);
    if (!token) return;
    setRevokingId(id);
    try {
      const res = await fetch(`/api/admin/api-keys/${id}/revoke`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || res.statusText);
      showToast("Key revoked");
      await loadKeys();
    } catch (e) {
      showToast(e.message || "Revoke failed");
    } finally {
      setRevokingId(null);
    }
  }

  function toggleScope(id) {
    setNewKeyScopes((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  if (loading) {
    return <p style={{ color: "var(--text-muted)" }}>Loading admin…</p>;
  }

  return (
    <div>
      <SecTitle>Administration</SecTitle>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
        Manage users and programmatic API access. API keys are hashed server-side; the secret is shown only once when created.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, borderBottom: "1.5px solid var(--border)", flexWrap: "wrap" }}>
        {[
          { id: "users", label: "Users" },
          { id: "apikeys", label: "API keys" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSub(t.id)}
            style={{
              padding: "10px 14px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 14,
              fontWeight: sub === t.id ? 600 : 400,
              color: sub === t.id ? "var(--accent)" : "var(--text-muted)",
              borderBottom: sub === t.id ? "2px solid var(--accent)" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sub === "users" && (
        <div style={cardSt()}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Directory</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {users.map((u) => (
              <div
                key={u.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                  padding: "12px 14px",
                  border: "1.5px solid var(--border)",
                  borderRadius: 10,
                  background: "var(--bg-surface)",
                }}
              >
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{u.full_name || u.email}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{u.email}</div>
                </div>
                <select
                  value={u.role}
                  onChange={(e) => updateRole(u.id, e.target.value)}
                  style={inpSt({ width: "auto", minWidth: 140 })}
                >
                  {["admin", "manager", "dispatcher", "employee"].map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            {users.length === 0 && (
              <p style={{ fontSize: 13, color: "var(--text-faint)" }}>No users found.</p>
            )}
          </div>
        </div>
      )}

      {sub === "apikeys" && (
        <div>
          {revealedKey && (
            <div
              style={{
                ...cardSt({ marginBottom: 20, borderLeft: "4px solid #059669", background: "var(--info-bg)" }),
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--text-primary)" }}>Save this key now</div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>{revealedKey.warning}</p>
              <Lbl>Secret (copy to a password manager)</Lbl>
              <div
                style={{
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 13,
                  padding: "12px 14px",
                  background: "var(--bg-muted)",
                  borderRadius: 8,
                  wordBreak: "break-all",
                  border: "1.5px solid var(--border)",
                }}
              >
                {revealedKey.key}
              </div>
              <Btn style={{ marginTop: 12 }} onClick={() => setRevealedKey(null)}>
                I’ve copied it — dismiss
              </Btn>
            </div>
          )}

          <form onSubmit={createApiKey} style={cardSt({ marginBottom: 20 })}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>Create API key</div>
            <Lbl>Label</Lbl>
            <FocusInp
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g. Payroll integration"
              style={{ marginBottom: 14 }}
            />
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Scopes</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
              {API_SCOPES.map((s) => (
                <label
                  key={s.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: "8px 10px",
                    border: "1.5px solid var(--border)",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 13,
                    background: newKeyScopes.includes(s.id) ? "var(--bg-muted)" : "var(--bg-surface)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={newKeyScopes.includes(s.id)}
                    onChange={() => toggleScope(s.id)}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <span style={{ fontWeight: 600 }}>{s.label}</span>
                    <span style={{ display: "block", fontSize: 11, color: "var(--text-faint)" }}>{s.id}</span>
                  </span>
                </label>
              ))}
            </div>
            <BtnPri type="submit" style={{ marginTop: 16 }}>
              Generate key
            </BtnPri>
          </form>

          <div style={cardSt()}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>Active keys</div>
            {keysLoading && <p style={{ color: "var(--text-muted)" }}>Loading…</p>}
            {!keysLoading && keys.filter((k) => !k.revoked_at).length === 0 && (
              <p style={{ fontSize: 13, color: "var(--text-faint)" }}>No keys yet.</p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {keys
                .filter((k) => !k.revoked_at)
                .map((k) => (
                  <div
                    key={k.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                      padding: "12px 14px",
                      border: "1.5px solid var(--border)",
                      borderRadius: 10,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{k.name}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "monospace" }}>
                        {k.key_prefix}
                      </div>
                      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {(k.scopes || []).map((s) => (
                          <Tag key={s}>{s}</Tag>
                        ))}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 8 }}>
                        Created {new Date(k.created_at).toLocaleString()}
                        {k.last_used_at && ` · Last used ${new Date(k.last_used_at).toLocaleString()}`}
                      </div>
                    </div>
                    <BtnDanger
                      type="button"
                      disabled={revokingId === k.id}
                      onClick={() => revokeKey(k.id)}
                    >
                      {revokingId === k.id ? "…" : "Revoke"}
                    </BtnDanger>
                  </div>
                ))}
            </div>

            <div style={{ marginTop: 16, padding: 12, background: "var(--bg-muted)", borderRadius: 8, fontSize: 12 }}>
              <strong>HTTP usage:</strong> send the key in <code>Authorization: Bearer &lt;ccr_…&gt;</code> or{" "}
              <code>X-Api-Key</code>. Endpoints: <code>/api/v1/projects</code>, <code>/employees</code>,{" "}
              <code>/assignments</code>, <code>/settings</code>, <code>/reports/summary</code> — each checks scopes.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
