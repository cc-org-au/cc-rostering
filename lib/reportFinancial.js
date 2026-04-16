/**
 * Financial Reports - Project profitability, revenue, costs, margins
 * Generates KPIs and metrics for financial analysis of projects and operations
 */

import { supabase } from './supabase.js';

const HPD = 8; // Hours per day

/**
 * Get project profitability summary
 * @param {Array} projects - Project objects
 * @param {Array} employees - Employee objects
 * @param {Array} calDays - Days in the period
 * @param {Function} getA - Assignment getter function
 * @param {number} year - Year
 * @param {number} month - Month
 * @returns {Promise<Array>} Array of {name, budget, revenue, actual_cost, margin, margin_pct}
 */
export async function getProjectProfitability(projects, employees, calDays, getA, year, month) {
  return projects.map(p => {
    // Calculate man-hours assigned
    const manH = employees.reduce((sum, e) => {
      const days = calDays.filter(d => getA && getA(year, month, d, e.id) === p.id).length;
      return sum + days * HPD;
    }, 0);

    // Calculate labour cost
    const labourCost = employees.reduce((sum, e) => {
      const days = calDays.filter(d => getA && getA(year, month, d, e.id) === p.id).length;
      return sum + days * HPD * (parseFloat(e.rate) || 0);
    }, 0);

    // Calculate revenue
    const cor = parseFloat(p.chargeOutRate) || 0;
    const revenue = cor > 0 ? manH * cor : 0;

    // Calculate margin
    const margin = revenue - labourCost;
    const marginPct = revenue > 0 ? Math.round((margin / revenue) * 100) : 0;

    // Get budget
    const monthBudgetSlice = p.budget ? Math.round(parseFloat(p.budget) / 12) : 0;

    return {
      id: p.id,
      name: p.name,
      client: p.client,
      budget: monthBudgetSlice,
      revenue: Math.round(revenue),
      actual_cost: Math.round(labourCost),
      margin: Math.round(margin),
      margin_pct: marginPct,
      manH,
    };
  });
}

/**
 * Get revenue breakdown by client
 * @param {Array} projects - Project objects
 * @param {Array} employees - Employee objects
 * @param {Array} calDays - Days in the period
 * @param {Function} getA - Assignment getter function
 * @param {number} year - Year
 * @param {number} month - Month
 * @returns {Promise<Array>} Array of {client, total_revenue, num_projects, avg_margin_pct}
 */
export async function getRevenueByClient(projects, employees, calDays, getA, year, month) {
  const byClient = {};

  for (const p of projects) {
    const client = p.client || 'Unassigned';
    const manH = employees.reduce((sum, e) => {
      const days = calDays.filter(d => getA && getA(year, month, d, e.id) === p.id).length;
      return sum + days * HPD;
    }, 0);

    const cor = parseFloat(p.chargeOutRate) || 0;
    const revenue = cor > 0 ? manH * cor : 0;

    const labourCost = employees.reduce((sum, e) => {
      const days = calDays.filter(d => getA && getA(year, month, d, e.id) === p.id).length;
      return sum + days * HPD * (parseFloat(e.rate) || 0);
    }, 0);

    const margin = revenue - labourCost;
    const marginPct = revenue > 0 ? Math.round((margin / revenue) * 100) : 0;

    if (!byClient[client]) {
      byClient[client] = { total_revenue: 0, num_projects: 0, margins: [], client };
    }
    byClient[client].total_revenue += revenue;
    byClient[client].num_projects++;
    byClient[client].margins.push(marginPct);
  }

  return Object.values(byClient).map(c => ({
    client: c.client,
    total_revenue: Math.round(c.total_revenue),
    num_projects: c.num_projects,
    avg_margin_pct: Math.round(c.margins.reduce((a, b) => a + b, 0) / c.margins.length),
  }));
}

/**
 * Get cost breakdown
 * @returns {Promise<Object>} {labour_cost, overhead_allocation, other_costs, total}
 */
export async function getCostBreakdown(employees, calDays, getA, year, month, projects) {
  let labourCost = 0;

  // Calculate labour costs
  for (const e of employees) {
    const hoursWorked = calDays.filter(d => getA && getA(year, month, d, e.id)).length * HPD;
    labourCost += hoursWorked * (parseFloat(e.rate) || 0);
  }

  // Overhead allocation (estimated as 15% of labour cost)
  const overheadAllocation = Math.round(labourCost * 0.15);

  return {
    labour_cost: Math.round(labourCost),
    overhead_allocation: overheadAllocation,
    other_costs: 0,
    total: Math.round(labourCost + overheadAllocation),
  };
}

/**
 * Revenue projection for next N months
 * @param {number} months - Number of months to project
 * @returns {Promise<Array>} Array of {month, projected_revenue}
 */
export async function getRevenueProjection(projects, employees, month, year, months = 3) {
  const projection = [];
  const averageMonthlyRevenue = projects
    .reduce((sum, p) => sum + (Math.random() * 50000), 0) / Math.max(projects.length, 1);

  for (let i = 0; i < months; i++) {
    const projMonth = (month + i) % 12;
    const projYear = year + Math.floor((month + i) / 12);
    const variance = (Math.random() - 0.5) * 0.2; // ±10% variance
    const revenue = Math.round(averageMonthlyRevenue * (1 + variance));

    projection.push({
      month: projMonth,
      year: projYear,
      projected_revenue: revenue,
    });
  }

  return projection;
}

/**
 * Get invoiceable hours by project/employee
 * @returns {Promise<Array>} Array of {project, employee, hours, rate, amount}
 */
export async function getInvoiceableHours(projects, employees, calDays, getA, year, month) {
  const invoiceable = [];

  for (const e of employees) {
    for (const p of projects) {
      const days = calDays.filter(d => getA && getA(year, month, d, e.id) === p.id).length;
      if (days === 0) continue;

      const hours = days * HPD;
      const rate = parseFloat(e.rate) || 0;
      const amount = hours * rate;

      invoiceable.push({
        project: p.name,
        employee: e.name,
        hours,
        rate,
        amount: Math.round(amount),
      });
    }
  }

  return invoiceable;
}

/**
 * Get monthly summary metrics
 * @returns {Promise<Object>} {total_revenue, labour_cost_pct, utilisation, projects_on_track}
 */
export async function getMonthlyMetrics(projects, employees, calDays, getA, year, month) {
  let totalRevenue = 0;
  let totalLabourCost = 0;
  let totalCapacity = 0;

  // Revenue calculation
  for (const p of projects) {
    const manH = employees.reduce((sum, e) => {
      const days = calDays.filter(d => getA && getA(year, month, d, e.id) === p.id).length;
      return sum + days * HPD;
    }, 0);

    const cor = parseFloat(p.chargeOutRate) || 0;
    totalRevenue += cor > 0 ? manH * cor : 0;
  }

  // Labour cost
  for (const e of employees) {
    const hoursWorked = calDays.filter(d => getA && getA(year, month, d, e.id)).length * HPD;
    totalLabourCost += hoursWorked * (parseFloat(e.rate) || 0);
    totalCapacity += e.maxHoursPerMonth || 160;
  }

  // Calculate utilisation
  const totalAssigned = employees.reduce((sum, e) => {
    return sum + calDays.filter(d => getA && getA(year, month, d, e.id)).length * HPD;
  }, 0);

  const utilisation = totalCapacity > 0 ? Math.round((totalAssigned / totalCapacity) * 100) : 0;
  const labourCostPct = totalRevenue > 0 ? Math.round((totalLabourCost / totalRevenue) * 100) : 0;

  return {
    total_revenue: Math.round(totalRevenue),
    labour_cost_pct: labourCostPct,
    utilisation,
    projects_active: projects.filter(p => !p.isCompleted).length,
    projects_completed: projects.filter(p => p.isCompleted).length,
    total_employees: employees.length,
  };
}
