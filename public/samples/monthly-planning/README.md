# Monthly Planning Spreadsheet → Roster CSV

The Excel workbook **Monthly Planning Spreadsheet AUTO.xlsm** mixes several layouts:

| Sheet | In this folder | App import |
|--------|----------------|------------|
| **SitesMap** | `projects_from_sites_map.csv` | **Yes** — Settings → Import Data → **Import Projects (sites / clients)** |
| **Emails** | `client_emails_reference.csv` | **No** — reference only (client blast list) |
| **Sheet1** | — | **No** — free-form weekly cells (crew + site text), not a tabular import |
| **Weekly Roster** | — | **No** — small layout template, not a full data export |

Regenerate CSVs from your `.xlsm` after editing the workbook:

```bash
npm run import:xlsm -- "/path/to/Monthly Planning Spreadsheet AUTO.xlsm"
```

Default input is `~/Downloads/Monthly Planning Spreadsheet AUTO.xlsm` if you omit the path.

### Projects CSV columns

Matches `lib/importData.js` project import: **Name** (or Site), **Client**, optional **Budget**, **Charge-out Rate**, **Total Input**, **Unit** (`days` / `hours`), **Staff Mode** (`flexible` / `fixed`), **Notes**.

The generated file maps **SitesMap** as: **Name** = Site, **Client** = Client, **Notes** = contact name and email from the sheet.
