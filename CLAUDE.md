# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (localhost:3000)
npm run build    # Production build
npm run start    # Start production server
```

No linting, type-checking, or test setup exists. The project uses plain JavaScript (JSX), not TypeScript.

## Architecture

A Next.js 15 / React 19 workforce rostering app with Supabase as the backend.

**Source files:** Only 4 JS files in the entire app:
- `app/RosterApp.jsx` — the entire application (~987 lines), a single large component
- `app/page.jsx` — renders `RosterApp`
- `app/layout.jsx` — root layout with metadata
- `lib/supabase.js` — Supabase client initialised from `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**RosterApp tabs and responsibilities:**
1. **Projects** — create/edit projects with budget, timeline, charge-out rate, staffing mode, required strengths
2. **Employees** — manage staff with roles, rates, availability (per-day-of-week), skills, max monthly hours
3. **Roster** — monthly calendar assigning employees to projects by day
4. **Capacity** — utilisation analysis across employees and projects
5. **Summary** — financial/allocation summary view

**Key domain constants:**
- `HPD = 8` — hours per day assumption throughout all calculations
- Budget-to-hours: `budget ÷ charge_out_rate`
- Monthly hours auto-spread across project timeline from `total_input` (days or hours)
- Staff modes: `flexible` (auto-assign) vs. `fixed` (set headcount)

## Database (Supabase)

Project ref: `macarnrvvxkmqrpdjyja`  
Schema is in `supabase/schema.sql`.

Three tables with RLS enabled (permissive public_access policies — no auth yet):

| Table | Key columns |
|-------|-------------|
| `projects` | id, name, client, color, budget, charge_out_rate, total_input, total_unit (days/hours), monthly_hours (JSONB), staff_mode, fixed_staff, start/end month/year, strengths_required (text[]) |
| `employees` | id, name, role, type, rate, availability (JSONB day-of-week flags), max_hours_per_month, strengths (text[]) |
| `assignments` | composite PK (year, month, day, employee_id), FK to employees and projects with cascade delete |

**Data flow:** all state lives in React (`useState`). On mount, data loads from Supabase. Mutations call `upsert`/`delete` on the relevant table then update local state.

## MCP / Tooling

- `.mcp.json` — Supabase MCP server config (HTTP endpoint, project ref)
- `.claude/settings.local.json` — enables MCP servers for Claude Code
- `skills-lock.json` — pins agent skills (`supabase`, `supabase-postgres-best-practices`)

The Supabase MCP server can be used to run queries, inspect schema, and manage the database directly from Claude Code.
