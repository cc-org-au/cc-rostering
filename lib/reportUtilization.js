/**
 * Utilization Reports - Employee utilization, billable vs non-billable, capacity trends
 * Analyzes how effectively employee time is allocated
 */

const HPD = 8;

/**
 * Get employee utilization metrics
 * @returns {Promise<Array>} Array of {name, assigned_hours, available_hours, utilization_pct}
 */
export async function getEmployeeUtilization(employees, calDays, getA, year, month) {
  return employees.map(e => {
    const assignedHours = calDays.filter(d => getA && getA(year, month, d, e.id)).length * HPD;
    const availableHours = e.maxHoursPerMonth || 160;
    const utilizationPct = availableHours > 0 ? Math.round((assignedHours / availableHours) * 100) : 0;

    return {
      id: e.id,
      name: e.name,
      role: e.role,
      type: e.type,
      assigned_hours: assignedHours,
      available_hours: availableHours,
      utilization_pct: utilizationPct,
      status: utilizationPct >= 100 ? 'overallocated' : utilizationPct >= 80 ? 'healthy' : 'underutilized',
    };
  });
}

/**
 * Get utilization breakdown by skill/role
 * @returns {Promise<Array>} Array of {skill, num_employees, avg_utilization_pct, hours_assigned}
 */
export async function getUtilizationBySkill(employees, calDays, getA, year, month) {
  const bySkill = {};

  for (const e of employees) {
    const assignedHours = calDays.filter(d => getA && getA(year, month, d, e.id)).length * HPD;
    const skills = e.strengths && e.strengths.length > 0 ? e.strengths : ['Unspecified'];

    for (const skill of skills) {
      if (!bySkill[skill]) {
        bySkill[skill] = { employees: [], hours: 0, utilizations: [] };
      }
      bySkill[skill].employees.push(e.name);
      bySkill[skill].hours += assignedHours;
      const util = (e.maxHoursPerMonth || 160) > 0
        ? (assignedHours / (e.maxHoursPerMonth || 160)) * 100
        : 0;
      bySkill[skill].utilizations.push(util);
    }
  }

  return Object.entries(bySkill).map(([skill, data]) => ({
    skill,
    num_employees: data.employees.length,
    avg_utilization_pct: Math.round(data.utilizations.reduce((a, b) => a + b, 0) / data.utilizations.length),
    hours_assigned: Math.round(data.hours),
  }));
}

/**
 * Get billable vs non-billable hours breakdown
 * @returns {Promise<Object>} {billable_hours, non_billable_hours, billable_pct}
 */
export async function getBillableVsNonBillable(employees, projects, calDays, getA, year, month) {
  let billableHours = 0;
  let totalHours = 0;

  for (const e of employees) {
    for (const d of calDays) {
      const pid = getA && getA(year, month, d, e.id);
      if (pid) {
        totalHours += HPD;
        const project = projects.find(p => p.id === pid);
        // Assume all assigned hours are billable if project has a charge-out rate
        if (project && project.chargeOutRate) {
          billableHours += HPD;
        }
      }
    }
  }

  const nonBillableHours = totalHours - billableHours;
  const billablePct = totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0;

  return {
    billable_hours: billableHours,
    non_billable_hours: nonBillableHours,
    total_hours: totalHours,
    billable_pct: billablePct,
  };
}

/**
 * Get capacity trends over months
 * @param {number} months - Number of months to analyze
 * @returns {Promise<Array>} Array of {month, year, utilization_pct, capacity_used}
 */
export async function getCapacityTrends(employees, projects, pastMonths = 6) {
  const trends = [];
  const now = new Date();

  for (let i = -pastMonths; i <= 0; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i);
    const month = d.getMonth();
    const year = d.getFullYear();

    // Mock data - in real app, would query historical assignments
    const totalCapacity = employees.reduce((sum, e) => sum + (e.maxHoursPerMonth || 160), 0);
    const utilizationPct = Math.round(Math.random() * 100);

    trends.push({
      month,
      year,
      utilization_pct: utilizationPct,
      capacity_used: Math.round(totalCapacity * (utilizationPct / 100)),
    });
  }

  return trends;
}

/**
 * Get underutilized employees (below 60% utilization)
 * @returns {Promise<Array>} Array of {name, utilization_pct, available_capacity}
 */
export async function getUnderutilizedEmployees(employees, calDays, getA, year, month) {
  return employees
    .map(e => {
      const assignedHours = calDays.filter(d => getA && getA(year, month, d, e.id)).length * HPD;
      const availableHours = e.maxHoursPerMonth || 160;
      const utilizationPct = availableHours > 0 ? Math.round((assignedHours / availableHours) * 100) : 0;
      const availableCapacity = Math.max(0, availableHours - assignedHours);

      return {
        id: e.id,
        name: e.name,
        role: e.role,
        utilization_pct: utilizationPct,
        available_capacity: availableCapacity,
      };
    })
    .filter(e => e.utilization_pct < 60)
    .sort((a, b) => a.utilization_pct - b.utilization_pct);
}

/**
 * Get overallocated employees (over 100% utilization)
 * @returns {Promise<Array>} Array of {name, utilization_pct, overallocated_hours}
 */
export async function getOverallocatedEmployees(employees, calDays, getA, year, month) {
  return employees
    .map(e => {
      const assignedHours = calDays.filter(d => getA && getA(year, month, d, e.id)).length * HPD;
      const availableHours = e.maxHoursPerMonth || 160;
      const utilizationPct = availableHours > 0 ? Math.round((assignedHours / availableHours) * 100) : 0;
      const overallocatedHours = Math.max(0, assignedHours - availableHours);

      return {
        id: e.id,
        name: e.name,
        role: e.role,
        utilization_pct: utilizationPct,
        overallocated_hours: overallocatedHours,
        assigned_hours: assignedHours,
      };
    })
    .filter(e => e.utilization_pct > 100)
    .sort((a, b) => b.utilization_pct - a.utilization_pct);
}
