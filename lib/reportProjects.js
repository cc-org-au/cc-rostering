/**
 * Project Status Reports - Budget vs actual, timelines, staffing
 * Monitors project health and delivery metrics
 */

const HPD = 8;

/**
 * Get project health status
 * @returns {Promise<Array>} Array of {name, status, days_remaining, pct_budget_spent, progress}
 */
export async function getProjectHealth(projects, employees, calDays, getA, year, month) {
  return projects.map(p => {
    if (p.isCompleted) {
      return {
        id: p.id,
        name: p.name,
        client: p.client,
        status: 'completed',
        days_remaining: 0,
        pct_budget_spent: 100,
        progress: 100,
      };
    }

    // Calculate days remaining
    const startDate = new Date(+p.startYear, +p.startMonth, 1);
    const endDate = new Date(+p.endYear, +p.endMonth + 1, 0);
    const today = new Date(year, month, 1);
    const daysRemaining = Math.max(0, Math.floor((endDate - today) / (1000 * 60 * 60 * 24)));

    // Calculate budget spent
    const labourCost = employees.reduce((sum, e) => {
      const days = calDays.filter(d => getA && getA(year, month, d, e.id) === p.id).length;
      return sum + days * HPD * (parseFloat(e.rate) || 0);
    }, 0);

    const budget = parseFloat(p.budget) || 0;
    const pctBudgetSpent = budget > 0 ? Math.round((labourCost / budget) * 100) : 0;

    // Status determination
    let status = 'on-track';
    if (pctBudgetSpent > 100) status = 'over-budget';
    else if (pctBudgetSpent >= 90) status = 'at-risk';
    else if (daysRemaining < 7) status = 'finishing';

    return {
      id: p.id,
      name: p.name,
      client: p.client,
      status,
      days_remaining: daysRemaining,
      pct_budget_spent: pctBudgetSpent,
      progress: Math.min(100, pctBudgetSpent),
    };
  });
}

/**
 * Get budget vs actual comparison
 * @returns {Promise<Array>} Array of {project, budgeted, spent, variance_pct, timeline_health}
 */
export async function getBudgetVsActual(projects, employees, calDays, getA, year, month) {
  return projects.map(p => {
    const budget = parseFloat(p.budget) || 0;

    const labourCost = employees.reduce((sum, e) => {
      const days = calDays.filter(d => getA && getA(year, month, d, e.id) === p.id).length;
      return sum + days * HPD * (parseFloat(e.rate) || 0);
    }, 0);

    const variance = budget > 0 ? labourCost - budget : 0;
    const variancePct = budget > 0 ? Math.round((variance / budget) * 100) : 0;

    // Timeline health (based on project dates)
    const startDate = new Date(+p.startYear, +p.startMonth);
    const endDate = new Date(+p.endYear, +p.endMonth + 1);
    const today = new Date(year, month);
    const totalDays = (endDate - startDate) / (1000 * 60 * 60 * 24);
    const elapsedDays = (today - startDate) / (1000 * 60 * 60 * 24);
    const timelineHealthPct = totalDays > 0 ? Math.round((elapsedDays / totalDays) * 100) : 0;

    return {
      id: p.id,
      project: p.name,
      budgeted: Math.round(budget),
      spent: Math.round(labourCost),
      variance: Math.round(variance),
      variance_pct: variancePct,
      timeline_health_pct: timelineHealthPct,
    };
  });
}

/**
 * Get project timeline milestones
 * @returns {Promise<Array>} Array of {project, start_date, end_date, duration_days, status}
 */
export async function getProjectTimeline(projects) {
  return projects.map(p => ({
    id: p.id,
    project: p.name,
    client: p.client,
    start_date: `${p.startYear}-${String(+p.startMonth + 1).padStart(2, '0')}-01`,
    end_date: `${p.endYear}-${String(+p.endMonth + 1).padStart(2, '0')}-${new Date(+p.endYear, +p.endMonth + 1, 0).getDate()}`,
    duration_days: Math.floor((new Date(+p.endYear, +p.endMonth + 1) - new Date(+p.startYear, +p.startMonth)) / (1000 * 60 * 60 * 24)),
    status: p.isCompleted ? 'completed' : 'active',
  }));
}

/**
 * Get staffing vs plan
 * @returns {Promise<Array>} Array of {project, planned_headcount, actual_headcount, variance}
 */
export async function getStaffingVsPlan(projects, employees, calDays, getA, year, month) {
  return projects.map(p => {
    // Planned headcount from fixedStaff or estimated from strengths_required
    let plannedHeadcount = 1;
    if (p.staffMode === 'fixed' && p.fixedStaff) {
      plannedHeadcount = parseInt(p.fixedStaff);
    } else if (p.strengthsRequired && p.strengthsRequired.length > 0) {
      plannedHeadcount = p.strengthsRequired.length;
    }

    // Actual headcount
    const actualHeadcount = new Set(
      employees.filter(e => calDays.some(d => getA && getA(year, month, d, e.id) === p.id)).map(e => e.id)
    ).size;

    return {
      id: p.id,
      project: p.name,
      planned_headcount: plannedHeadcount,
      actual_headcount: actualHeadcount,
      variance: actualHeadcount - plannedHeadcount,
    };
  });
}

/**
 * Rank projects by different metrics
 * @returns {Promise<Object>} {by_profitability, by_utilization, by_completion}
 */
export async function getProjectRanking(projects, employees, calDays, getA, year, month) {
  const projectMetrics = projects.map(p => {
    const manH = employees.reduce((sum, e) => {
      const days = calDays.filter(d => getA && getA(year, month, d, e.id) === p.id).length;
      return sum + days * HPD;
    }, 0);

    const labourCost = employees.reduce((sum, e) => {
      const days = calDays.filter(d => getA && getA(year, month, d, e.id) === p.id).length;
      return sum + days * HPD * (parseFloat(e.rate) || 0);
    }, 0);

    const cor = parseFloat(p.chargeOutRate) || 0;
    const revenue = cor > 0 ? manH * cor : 0;
    const profit = revenue - labourCost;
    const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;

    const budget = parseFloat(p.budget) || 0;
    const completionPct = budget > 0 ? (labourCost / budget) * 100 : 0;

    return {
      id: p.id,
      name: p.name,
      profit: Math.round(profit),
      profit_margin: Math.round(profitMargin),
      utilization: Math.round((manH / (employees.reduce((s, e) => s + (e.maxHoursPerMonth || 160), 0) / employees.length)) * 100),
      completion_pct: Math.round(completionPct),
    };
  });

  return {
    by_profitability: [...projectMetrics].sort((a, b) => b.profit - a.profit).slice(0, 5),
    by_utilization: [...projectMetrics].sort((a, b) => b.utilization - a.utilization).slice(0, 5),
    by_completion: [...projectMetrics].sort((a, b) => b.completion_pct - a.completion_pct).slice(0, 5),
  };
}
