---
title: Comprehensive Reporting & Analytics System
description: Complete guide to the Reports & Analytics dashboard for the rostering application
---

# Comprehensive Reporting & Analytics System

## Overview

The Reports & Analytics dashboard provides six specialized report types for analyzing workforce, financial, and operational metrics. The system includes:

- **Real-time data analysis** from projects, employees, and assignments
- **6 comprehensive report types** with tailored KPIs
- **Interactive filtering** by date range, project, employee, role, and skill
- **Data caching** for performance (1-hour TTL)
- **Export capabilities** (CSV for payroll)
- **Compliance and risk tracking**
- **Forecasting** for resource planning

---

## Database Schema

### `report_snapshots` Table
Stores historical snapshots of report data for trend analysis.

| Column | Type | Description |
|--------|------|-------------|
| `id` | text | Primary key (UUID) |
| `report_type` | text | financial, utilization, headcount, projects, compliance, forecasts |
| `year` | integer | Report year |
| `month` | integer | Report month (0-11) |
| `data` | jsonb | Complete report data snapshot |
| `created_by` | uuid | User who generated report |
| `created_at` | timestamptz | Creation timestamp |

**Indices:**
- `idx_report_snapshots_type_date` on (report_type, year, month)

### `revenue_logs` Table
Tracks billable hours and revenue per project/employee for financial reporting.

| Column | Type | Description |
|--------|------|-------------|
| `id` | text | Primary key (UUID) |
| `project_id` | text | FK to projects |
| `employee_id` | text | FK to employees |
| `amount` | numeric | Revenue amount |
| `billable_hours` | numeric | Billable hours |
| `date` | date | Log date |
| `created_at` | timestamptz | Creation timestamp |

**Indices:**
- `idx_revenue_logs_project_date` on (project_id, date)
- `idx_revenue_logs_employee_date` on (employee_id, date)
- `idx_revenue_logs_date` on (date)

**RLS Policies:**
- Employees see own revenue
- Managers see team revenue
- Admins see all revenue

---

## Report Libraries

### 1. Financial Reports (`lib/reportFinancial.js`)

**Functions:**
- `getProjectProfitability()` - Project name, budget, revenue, cost, margin %
- `getRevenueByClient()` - Client name, total revenue, # projects, avg margin
- `getCostBreakdown()` - Labour, overhead, other costs
- `getRevenueProjection(months=3)` - Monthly forecast
- `getInvoiceableHours()` - By project, employee, date range
- `getMonthlyMetrics()` - KPIs: total revenue, labour cost %, utilisation

**Key Metrics:**
- Total Revenue (calculated as man-hours × charge-out rate)
- Labour Cost % (labour costs / revenue)
- Margin per project (revenue - labour cost)
- Margin % (margin / revenue)
- Budget variance (spent vs allocated)

**Sample Query Result:**
```javascript
[
  {
    id: "proj-123",
    name: "Riverside Park",
    client: "City Council",
    budget: 25000,
    revenue: 42000,
    actual_cost: 18000,
    margin: 24000,
    margin_pct: 57
  }
]
```

---

### 2. Utilization Reports (`lib/reportUtilization.js`)

**Functions:**
- `getEmployeeUtilization()` - Name, assigned hours, available, % utilization, status
- `getUtilizationBySkill()` - Skill, # employees, avg utilization, hours assigned
- `getBillableVsNonBillable()` - % time on billable projects
- `getCapacityTrends(months=6)` - Historical utilization trend
- `getUnderutilizedEmployees()` - Below 60% utilization with available capacity
- `getOverallocatedEmployees()` - Over 100% utilization

**Status Values:**
- `overallocated` - > 100%
- `healthy` - 80-100%
- `underutilized` - < 80%

**Key Metrics:**
- Billable hours percentage
- Utilization rate per employee
- Capacity gaps and headroom
- Skill-based utilization patterns

**Sample Query Result:**
```javascript
{
  billable_hours: 240,
  non_billable_hours: 40,
  total_hours: 280,
  billable_pct: 86
}
```

---

### 3. Headcount Reports (`lib/reportHeadcount.js`)

**Functions:**
- `getTeamSize()` - Total, Full-time, Part-time, Casual, Contract breakdown
- `getHeadcountByRole()` - Role, count, avg rate, total capacity
- `getHeadcountByType()` - Employment type breakdown with percentages
- `getCapacityVsDemand()` - Current vs projected demand
- `getTrendAnalysis(months=12)` - Hiring/attrition trends
- `getStaffingVsPlan()` - Planned vs actual by role

**Key Metrics:**
- Team composition (FT, PT, Casual, Contract)
- Total available capacity (hours)
- Current assigned vs available
- Supply/demand ratio
- Headcount trend

**Sample Query Result:**
```javascript
{
  total: 25,
  'Full-time': 18,
  'Part-time': 4,
  'Casual': 3,
  'Contract': 0,
  'Apprentice': 0
}
```

---

### 4. Project Status Reports (`lib/reportProjects.js`)

**Functions:**
- `getProjectHealth()` - Status (on-track/at-risk/complete), days remaining, % budget spent
- `getBudgetVsActual()` - Budgeted, spent, variance %, timeline health
- `getProjectTimeline()` - Start, end dates, duration, status
- `getStaffingVsPlan()` - Planned vs actual headcount
- `getProjectRanking()` - By profitability, utilization, completion %

**Status Values:**
- `on-track` - ≤ 80% budget spent
- `at-risk` - 80-100% budget spent
- `over-budget` - > 100% budget spent
- `finishing` - < 7 days remaining
- `completed` - Project marked complete

**Key Metrics:**
- Budget consumption %
- Project timeline health
- Staffing variance
- Days remaining
- Profit margin by project

**Sample Query Result:**
```javascript
[
  {
    id: "proj-123",
    name: "Riverside Park",
    status: "on-track",
    days_remaining: 45,
    pct_budget_spent: 62,
    progress: 62
  }
]
```

---

### 5. Compliance Reports (`lib/reportCompliance.js`)

**Functions:**
- `getHoursViolations()` - Employees exceeding max hours, severity level
- `getSkillMismatches()` - Assignments without required skills
- `getAvailabilityViolations()` - Assigned on unavailable days
- `getLeaveImpact()` - Projects affected by staff on leave
- `getComplianceSummary()` - Total violations, risk level

**Severity Levels (Hours Violations):**
- `critical` - > 30 hours over limit
- `high` - 15-30 hours over
- `medium` - < 15 hours over

**Risk Levels:**
- `critical` - Any critical issue present
- `high` - > 10 total violations
- `medium` - 5-10 violations
- `low` - < 5 violations

**Key Metrics:**
- Violation count by type
- Employee hours violations
- Skill coverage %
- Availability conflicts
- Leave project impact

**Sample Query Result:**
```javascript
{
  id: "emp-456",
  name: "John Smith",
  hours_worked: 190,
  max_hours: 160,
  violation_hours: 30,
  violation_pct: 19,
  severity: "high"
}
```

---

### 6. Forecast Reports (`lib/reportForecasts.js`)

**Functions:**
- `getResourceGaps(months=3)` - Needed roles, gap hours, risk level
- `getRevenueProjection(months=3)` - Forecast with confidence level
- `getCapacityForecast(months=3)` - When capacity exceeded
- `getAttritionRisk()` - Employees likely to leave

**Risk Factors for Attrition:**
- Overallocation (> 125% utilization) - 30 points
- Underutilization (< 20%) - 20 points
- Non-permanent employment - 15 points
- Low salary (< $25/hr) - 10 points
- Random base factor - 0-15 points

**Risk Levels:**
- `critical` - Score > 60
- `high` - 40-60
- `medium` - 25-40
- `low` - < 25

**Key Metrics:**
- Resource gaps (hours and %)
- Projected demand vs capacity
- Revenue forecast with confidence %
- Attrition risk scores and factors

**Sample Query Result:**
```javascript
[
  {
    month: 1,
    year: 2024,
    projected_revenue: 145000,
    confidence_pct: 90
  },
  {
    month: 2,
    year: 2024,
    projected_revenue: 138000,
    confidence_pct: 85
  }
]
```

---

## Caching Strategy (`lib/reportCache.js`)

### Cache Implementation
- **TTL (Time To Live):** 1 hour (3,600,000 ms)
- **Scope:** In-memory client-side cache
- **Key format:** `{reportType}_{year}_{month}[_{filters}]`

### Cache Methods
```javascript
reportCache.get(reportKey)       // Get cached data
reportCache.set(reportKey, data) // Cache data
reportCache.clear(reportKey)     // Clear specific cache
reportCache.clearAll()           // Clear all cache
reportCache.getStats()           // Get cache statistics
```

### Usage Example
```javascript
const cacheKey = generateCacheKey("financial", 2024, 0);
const cached = reportCache.get(cacheKey);

if (cached) {
  return cached; // Use cached data
} else {
  const fresh = await generateReport();
  reportCache.set(cacheKey, fresh);
  return fresh;
}
```

### Manual Refresh
- Users can click "⟳ Refresh" button to invalidate cache
- Automatic refresh on date/filter changes
- Cache statistics visible via `getStats()`

---

## Report UI Components

### ReportsTab Structure

**Report Type Selector:**
- 6 buttons with icons and labels
- Displays: Financial 💰, Utilization 📊, Headcount 👥, Projects 🎯, Compliance ✅, Forecasts 🔮

**Controls:**
- Month selector (dropdown)
- Year selector (dropdown)
- Refresh button (manual cache invalidation)

### Financial Report View
- KPI Cards: Total Revenue, Labour Cost %, Utilisation, Active Projects
- Project Profitability Table: Project, Client, Revenue, Cost, Margin, Margin %
- Payroll Summary (legacy): Total rostered, Actual worked, Variance, Utilisation %
- Overtime Alerts: Collapsible section for 38h/week violations
- Scheduled vs Actual Table: Employee breakdown by hours
- Project Financial Summary: Per-project margin and budget analysis

### Utilization Report View
- Billable vs Non-Billable KPI cards
- Overallocated Employees list (with hours over)
- Underutilized Employees list (with available capacity)
- Employee Utilization Table: Name, Role, Assigned, Available, %, Status

### Headcount Report View
- Team Size KPI cards: Total, FT, PT, Casual, Contract
- Capacity vs Demand card: Available, Assigned, Gap, Supply/Demand ratio
- Headcount by Role Table: Role, Count, Avg Rate, Total Capacity

### Projects Report View
- Project Health Cards: Status color-coded, budget %, days remaining
- Budget vs Actual details
- Project Rankings by profitability/utilization/completion

### Compliance Report View
- Risk Level summary card with violation counts
- Hours Violations list (severity-colored)
- Skill Mismatches list (coverage %)
- Availability Violations list
- Critical issues highlighted

### Forecasts Report View
- Resource Gaps (next 3 months): Month, Gap %, Risk level
- Revenue Projection (next 3 months): Month, Projected revenue, Confidence %
- Attrition Risk list: Top at-risk employees with scores and factors

---

## Chart Types Used Per Report

| Report Type | Chart Types | Metrics |
|-------------|------------|---------|
| **Financial** | Bar chart (Revenue vs Cost), Pie chart (Margin %), Line chart (Trend) | Profitability, Revenue, Costs |
| **Utilization** | Horizontal bar (Employee %), Pie chart (Billable %), Line chart (Trend) | Hours utilization, Billable % |
| **Headcount** | Donut chart (Team composition), Bar chart (By role), Line chart (Trend) | Team size, Capacity, Attrition |
| **Projects** | Progress bars (Budget %), Waterfall (Timeline), Bubble chart (Health) | Budget %, Timeline, Status |
| **Compliance** | Heat map (Violations), Bar chart (By type), Gauge (Risk level) | Violations, Risk, Issues |
| **Forecasts** | Line chart (Projections), Bar chart (Gaps), Gauge (Risk) | Revenue forecast, Resource gaps |

---

## Integration Points

### From Projects Tab
- Click project → View detailed financial/status report
- Export project costs to CSV

### From Employees Tab
- Click employee → View utilization report
- See attrition risk factors

### From Roster View
- View capacity utilization for current month
- Access compliance violations for assignments

### From Admin Settings
- Configure report preferences
- Set compliance thresholds
- Manage data retention

---

## Example Workflows

### 1. Monitor Project Profitability
1. Navigate to Reports → Financial
2. Select month/year
3. View "Project Profitability" table
4. Identify projects with margin < 20%
5. Click project for detailed drill-down
6. Export financial summary for stakeholder reporting

### 2. Identify Overallocated Employees
1. Go to Reports → Utilization
2. View "Overallocated Employees" section
3. Review hours over limit and severity
4. Adjust assignments in Roster tab
5. Monitor capacity trends over months

### 3. Plan Hiring/Attrition
1. Open Reports → Headcount
2. Review "Capacity vs Demand" metric
3. Check "Staffing vs Plan" by role
4. View Reports → Forecasts
5. Review "Attrition Risk" for key personnel
6. Plan recruitment based on gaps

### 4. Ensure Compliance
1. Go to Reports → Compliance
2. Review "Risk Level" summary
3. Address critical hours violations
4. Fix skill mismatches for assignments
5. Resolve availability conflicts
6. Track compliance trend over time

### 5. Forecast Resource Needs
1. Open Reports → Forecasts
2. Review "Resource Gaps" for next 3 months
3. Identify needed skills/roles
4. Check "Revenue Projection"
5. Assess "Capacity Forecast"
6. Plan resource acquisition

---

## Data Import/Export

### Export Formats

**CSV Export (Payroll):**
- Employee, Role, Date, Project, Rostered Hours, Actual Hours, Rate, Cost
- Includes timesheet reconciliation
- File: `payroll_YYYY_MM.csv`

**Report Snapshots (Future):**
- Save entire report as JSON snapshot
- Store in `report_snapshots` table
- Enable historical trend analysis

### Sample Payroll Export
```csv
Employee,Role,Date,Project,Rostered Hours,Actual Hours,Hourly Rate,Rostered Cost,Actual Cost,Status
John Smith,Labourer,2024-01-15,Riverside Park,8,8,35,280,280,approved
Jane Doe,Electrician,2024-01-15,Riverside Park,8,7.5,50,400,375,submitted
```

---

## Testing & Validation

### Sample Queries & Expected Results

**Query 1: Project Profitability for Month**
```javascript
const results = await getProjectProfitability(
  projects, employees, calDays, getA, 2024, 0
);
// Expected: Array of projects with revenue > 0, margins calculated
```

**Query 2: Hours Violations**
```javascript
const violations = await getHoursViolations(
  employees, calDays, getA, 2024, 0
);
// Expected: Array of employees with hours > max_hours, severity categorized
```

**Query 3: Resource Gaps**
```javascript
const gaps = await getResourceGaps(
  projects, employees, 0, 2024, 3
);
// Expected: Array of 3 months with gap_hours and risk_level
```

### Validation Rules

- **Profitability:** margin = revenue - cost (should always be calculated)
- **Utilization:** util_pct = (assigned_hours / available_hours) × 100 (0-∞%)
- **Headcount:** total = sum of all employment types
- **Compliance:** violations >= 0 for all violation types
- **Forecasts:** projected values should be reasonable estimates

---

## Performance Considerations

### Query Optimization
- Use indices on `project_id`, `employee_id`, `date`
- Filter by month/year early in processing
- Cache results for 1 hour minimum
- Lazy-load detailed reports on demand

### Scalability
- Client-side in-memory caching
- Server-side caching (future): Redis or similar
- Batch calculations by period
- Archive old report snapshots annually

### Limitations
- Current month data is most accurate
- Historical data dependent on audit logs
- Forecasts use linear extrapolation (basic model)
- Attrition risk is algorithmic estimate

---

## Future Enhancements

1. **Advanced Forecasting**
   - ML-based demand prediction
   - Seasonal trend analysis
   - Multiple forecast models

2. **Predictive Analytics**
   - Churn prediction with ML
   - Resource optimization recommendations
   - Anomaly detection

3. **Data Warehouse Integration**
   - Historical data persistence
   - Complex aggregations
   - Multi-dimensional analysis (OLAP)

4. **Report Scheduling**
   - Automated report generation
   - Email delivery
   - Scheduled data snapshots

5. **Advanced Exports**
   - PDF with charts and branding
   - Excel with multiple sheets
   - Power BI/Tableau integration

6. **Real-time Dashboards**
   - Live KPI updates
   - Streaming data
   - Alert notifications

---

## API Reference

All functions are async and accept `(projects, employees, calDays, getA, year, month)` parameters unless noted otherwise.

**Return types:**
- Functions return Arrays or Objects (plain JS)
- Data is JSON-serializable
- No complex class instances
- All numeric values are rounded appropriately

See individual library files for detailed JSDoc comments on each function.

