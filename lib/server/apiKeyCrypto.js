import { createHash, randomBytes } from "crypto";

export function generateApiKey() {
  const raw = randomBytes(24).toString("hex");
  return `${PREFIX}${raw}`;
}

export function hashApiKey(plainKey) {
  const pepper = process.env.API_KEY_PEPPER || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!pepper) throw new Error("API_KEY_PEPPER or SUPABASE_SERVICE_ROLE_KEY must be set for API keys");
  return createHash("sha256").update(pepper + plainKey, "utf8").digest("hex");
}

export function keyPrefix(plainKey) {
  if (!plainKey || plainKey.length < 12) return "ccr_****";
  return `${plainKey.slice(0, 12)}…`;
}
