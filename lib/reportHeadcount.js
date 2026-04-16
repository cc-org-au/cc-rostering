/**
 * Headcount Reports - Team size, by role/type, capacity vs demand
 * Provides workforce analytics and hiring trend analysis
 */

/**
 * Get team size breakdown
 * @returns {Promise<Object>} {total, full_time, part_time, casual, contract, apprentice}
 */
export async function getTeamSize(employees) {
  const breakdown = {
    total: employees.length,
    'Full-time': 0,
    'Part-time': 0,
    'Casual': 0,
    'Contract': 0,
    'Apprentice': 0,
  };

  for (const e of employees) {
    const type = e.type || 'Full-time';
    breakdown[type] = (breakdown[type] || 0) + 1;
  }

  return breakdown;
}

/**
 * Get headcount by role
 * @returns {Promise<Array>} Array of {role, count, avg_rate, total_capacity}
 */
export async function getHeadcountByRole(employees) {
  const byRole = {};

  for (const e of employees) {
    const role = e.role || 'Unassigned';
    if (!byRole[role]) {
      byRole[role] = { count: 0, rates: [], capacities: [] };
    }
    byRole[role].count++;
    byRole[role].rates.push(parseFloat(e.rate) || 0);
    byRole[role].capacities.push(e.maxHoursPerMonth || 160);
  }

  return Object.entries(byRole).map(([role, data]) => ({
    role,
    count: data.count,
    avg_rate: Math.round((data.rates.reduce((a, b) => a + b, 0) / data.count) * 100) / 100,
    total_capacity: data.capacities.reduce((a, b) => a + b, 0),
  }));
}

/**
 * Get headcount by employment type
 * @returns {Promise<Array>} Array of {type, count, pct_of_total}
 */
export async function getHeadcountByType(employees) {
  const total = employees.length;
  const byType = {};

  for (const e of employees) {
    const type = e.type || 'Full-time';
    byType[type] = (byType[type] || 0) + 1;
  }

  return Object.entries(byType).map(([type, count]) => ({
    type,
    count,
    pct_of_total: total > 0 ? Math.round((count / total) * 100) : 0,
  }));
}

/**
 * Get capacity vs demand
 * @returns {Promise<Object>} {total_capacity, current_assigned, gap, projects_demand}
 */
export async function getCapacityVsDemand(employees, projects, calDays, getA, year, month) {
  // Total capacity
  const totalCapacity = employees.reduce((sum, e) => sum + (e.maxHoursPerMonth || 160), 0);

  // Current assigned
  let totalAssigned = 0;
  for (const e of employees) {
    const hours = calDays.filter(d => getA && getA(year, month, d, e.id)).length * 8;
    totalAssigned += hours;
  }

  // Project demand
  let projectsDemand = 0;
  for (const p of projects) {
    if (p.chargeOutRate && p.totalInput) {
      const unit = p.totalUnit || 'days';
      projectsDemand += unit === 'days' ? parseFloat(p.totalInput) * 8 : parseFloat(p.totalInput);
    }
  }

  const gap = totalCapacity - totalAssigned;

  return {
    total_capacity: totalCapacity,
    current_assigned: totalAssigned,
    gap: gap,
    gap_pct: totalCapacity > 0 ? Math.round((gap / totalCapacity) * 100) : 0,
    projects_demand: Math.round(projectsDemand),
    supply_demand_ratio: Math.round((totalCapacity / Math.max(projectsDemand, 1)) * 100) / 100,
  };
}

/**
 * Get trend analysis over 12 months
 * @returns {Promise<Array>} Array of {month, year, headcount, hiring_events, attrition_events}
 */
export async function getTrendAnalysis(employees, pastMonths = 12) {
  const trends = [];
  const now = new Date();

  for (let i = -pastMonths; i <= 0; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i);
    const month = d.getMonth();
    const year = d.getFullYear();

    // Mock trend data - would come from historical audit logs
    const baseHeadcount = employees.length;
    const variation = Math.floor(Math.random() * 5 - 2); // -2 to +2
    const headcount = Math.max(1, baseHeadcount + variation);

    trends.push({
      month,
      year,
      headcount,
      hiring_events: Math.random() > 0.8 ? 1 : 0,
      attrition_events: Math.random() > 0.9 ? 1 : 0,
    });
  }

  return trends;
}

/**
 * Get staffing vs plan
 * @returns {Promise<Array>} Array of {role, planned, actual, variance_pct}
 */
export async function getStaffingVsPlan(employees, projects) {
  const byRole = {};

  // Count actual staff by role
  for (const e of employees) {
    const role = e.role || 'Unassigned';
    byRole[role] = { actual: (byRole[role]?.actual || 0) + 1, planned: 0 };
  }

  // Count planned staff from projects (strengths_required)
  for (const p of projects) {
    if (p.strengthsRequired && p.strengthsRequired.length > 0) {
      for (const strength of p.strengthsRequired) {
        byRole[strength] = { ...byRole[strength], planned: (byRole[strength]?.planned || 0) + 1 };
      }
    }
  }

  return Object.entries(byRole).map(([role, data]) => ({
    role,
    planned: data.planned,
    actual: data.actual || 0,
    variance: (data.actual || 0) - data.planned,
    variance_pct: data.planned > 0 ? Math.round(((data.actual || 0) - data.planned) / data.planned * 100) : 0,
  }));
}
