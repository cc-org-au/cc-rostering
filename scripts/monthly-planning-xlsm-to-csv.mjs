#!/usr/bin/env node
/**
 * Converts "Monthly Planning Spreadsheet AUTO.xlsm" structured sheets to roster CSVs.
 *
 * - SitesMap → projects_import.csv (matches Settings → Import → Projects)
 * - Emails   → client_emails_reference.csv (reference only; not imported by the app)
 *
 * Sheet1 / Weekly Roster are free-form calendar text — not converted (see README).
 *
 * Usage:
 *   node scripts/monthly-planning-xlsm-to-csv.mjs [path/to/file.xlsm]
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "public", "samples", "monthly-planning");

function escCell(v) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows) {
  return rows.map((r) => r.map(escCell).join(",")).join("\n") + "\n";
}

const defaultInput =
  process.argv[2] || path.join(process.env.HOME || "", "Downloads", "Monthly Planning Spreadsheet AUTO.xlsm");

const inputPath = path.resolve(defaultInput);
if (!fs.existsSync(inputPath)) {
  console.error("File not found:", inputPath);
  process.exit(1);
}

const wb = XLSX.readFile(inputPath, { cellDates: true, raw: false });

fs.mkdirSync(outDir, { recursive: true });

// ── SitesMap → projects ─────────────────────────────────────────────────────
const sitesName = wb.SheetNames.includes("SitesMap") ? "SitesMap" : null;
if (sitesName) {
  const ws = wb.Sheets[sitesName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "", header: 1 });
  const header = [
    "Name",
    "Client",
    "Budget",
    "Charge-out Rate",
    "Total Input",
    "Unit",
    "Staff Mode",
    "Notes",
  ];
  const out = [header];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const site = String(r[0] ?? "").trim();
    const client = String(r[1] ?? "").trim();
    const email = String(r[2] ?? "").trim();
    const contact = String(r[3] ?? "").trim();
    if (!site && !client) continue;
    const notes = [contact && `Contact: ${contact}`, email && `Email: ${email}`].filter(Boolean).join(" | ");
    out.push([site, client, "", "", "", "days", "flexible", notes]);
  }
  const csvPath = path.join(outDir, "projects_from_sites_map.csv");
  fs.writeFileSync(csvPath, toCsv(out), "utf8");
  console.log("Wrote", csvPath, `(${out.length - 1} projects)`);
} else {
  console.warn("No SitesMap sheet found — skipped projects CSV.");
}

// ── Emails → reference CSV ──────────────────────────────────────────────────
const emailsName = wb.SheetNames.includes("Emails") ? "Emails" : null;
if (emailsName) {
  const ws = wb.Sheets[emailsName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "", header: 1 });
  const out = [["Client", "Email", "Contact Name", "Subject"]];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const client = String(r[0] ?? "").trim();
    const email = String(r[1] ?? "").trim();
    const contact = String(r[2] ?? "").trim();
    const subject = String(r[3] ?? "").trim();
    if (!client && !email) continue;
    out.push([client, email, contact, subject]);
  }
  const csvPath = path.join(outDir, "client_emails_reference.csv");
  fs.writeFileSync(csvPath, toCsv(out), "utf8");
  console.log("Wrote", csvPath, `(${out.length - 1} rows, reference only)`);
}

console.log("\nDone. Import in the app: Settings → Import Data → Import Projects (sites / clients) → choose projects_from_sites_map.csv");
