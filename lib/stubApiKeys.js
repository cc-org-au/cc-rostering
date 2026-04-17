/**
 * Local-only “stub” API keys when there is no Supabase session (dev / demo).
 * Stored in localStorage; not enforced server-side.
 */
const LS_KEY = "cc-roster-stub-api-keys";

function readAll() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeAll(rows) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(rows));
  } catch {
    /* ignore */
  }
}

function randomSecret() {
  const bytes = new Uint8Array(24);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  const b64 = typeof btoa !== "undefined" ? btoa(s) : "";
  return `ccr_stub_${b64.replace(/\+/g, "x").replace(/\//g, "y").slice(0, 28)}_${Date.now().toString(36)}`;
}

/** Rows suitable for Admin list (no plaintext secret). */
export function listStubApiKeysForUi() {
  return readAll().filter((k) => !k.revoked_at);
}

/**
 * @returns {object} row fields + `key` plaintext (show once)
 */
export function createStubApiKey({ name, scopes }) {
  const plain = randomSecret();
  const key_prefix = `${plain.slice(0, 12)}…`;
  const row = {
    id: `stub-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name,
    key_prefix,
    scopes: [...scopes],
    created_at: new Date().toISOString(),
    last_used_at: null,
    revoked_at: null,
    created_by: null,
    _stub: true,
  };
  writeAll([...readAll(), row]);
  return { ...row, key: plain };
}

export function revokeStubApiKey(id) {
  writeAll(
    readAll().map((k) =>
      k.id === id ? { ...k, revoked_at: new Date().toISOString() } : k
    )
  );
}
