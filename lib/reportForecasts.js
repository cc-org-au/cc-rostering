/**
 * Forecast Reports - Resource gaps, revenue projection, capacity forecast
 * Predicts future needs and resource requirements
 */

const HPD = 8;

/**
 * Get resource gaps for next N months
 * @param {number} months - Number of months to forecast
 * @returns {Promise<Array>} Array of {month, year, needed_roles, gap_hours, risk_level}
 */
export async function getResourceGaps(projects, employees, month, year, months = 3) {
  const forecast = [];
  const totalCapacity = employees.reduce((sum, e) => sum + (e.maxHoursPerMonth || 160), 0);

  for (let i = 1; i <= months; i++) {
    const forecastMonth = (month + i) % 12;
    const forecastYear = year + Math.floor((month + i) / 12);

    // Calculate projected demand
    let projectedDemand = 0;
    const neededRoles = new Map();

    for (const p of projects) {
      if (p.isCompleted) continue;

      // Check if project is active in forecast month
      const startDate = new Date(+p.startYear, +p.startMonth);
      const endDate = new Date(+p.endYear, +p.endMonth + 1);
      const forecastDate = new Date(forecastYear, forecastMonth);

      if (forecastDate >= startDate && forecastDate <= endDate) {
        const hours = p.totalUnit === 'days'
          ? parseFloat(p.totalInput || 0) * HPD
          : parseFloat(p.totalInput || 0);
        projectedDemand += hours;

        // Track needed skills
        if (p.strengthsRequired && p.strengthsRequired.length > 0) {
          for (const skill of p.strengthsRequired) {
            neededRoles.set(skill, (neededRoles.get(skill) || 0) + 1);
          }
        }
      }
    }

    const gap = Math.max(0, projectedDemand - totalCapacity);
    const gapPct = totalCapacity > 0 ? (gap / totalCapacity) * 100 : 0;

    let riskLevel = 'low';
    if (gapPct > 30) riskLevel = 'critical';
    else if (gapPct > 15) riskLevel = 'high';
    else if (gapPct > 5) riskLevel = 'medium';

    forecast.push({
      month: forecastMonth,
      year: forecastYear,
      projected_demand: Math.round(projectedDemand),
      available_capacity: totalCapacity,
      gap_hours: Math.round(gap),
      gap_pct: Math.round(gapPct),
      needed_roles: Array.from(neededRoles.entries()).map(([role, count]) => ({ role, count })),
      risk_level: riskLevel,
    });
  }

  return forecast;
}

/**
 * Get revenue projection for next N months
 * @param {number} months - Number of months to forecast
 * @returns {Promise<Array>} Array of {month, year, projected_revenue, confidence_level}
 */
export async function getRevenueProjection(projects, employees, month, year, months = 3) {
  const forecast = [];

  // Calculate current month's average revenue
  const activeProjects = projects.filter(p => !p.isCompleted);
  const avgProjectRevenue = activeProjects.length > 0
    ? activeProjects.reduce((sum, p) => {
      const cor = parseFloat(p.chargeOutRate) || 0;
      const hours = p.totalUnit === 'days'
        ? (parseFloat(p.totalInput || 0) * HPD) / 12
        : (parseFloat(p.totalInput || 0)) / 12;
      return sum + (cor * hours);
    }, 0) / activeProjects.length
    : 0;

  for (let i = 1; i <= months; i++) {
    const forecastMonth = (month + i) % 12;
    const forecastYear = year + Math.floor((month + i) / 12);

    // Calculate revenue with seasonal variance
    const seasonalFactor = Math.sin((forecastMonth / 12) * Math.PI * 2) * 0.2 + 1;
    const variance = (Math.random() - 0.5) * 0.1; // ±5% random variance
    const projectedRevenue = Math.round(avgProjectRevenue * seasonalFactor * (1 + variance));

    // Confidence decreases as we forecast further
    const confidencePct = Math.max(70, 95 - (i * 5));

    forecast.push({
      month: forecastMonth,
      year: forecastYear,
      projected_revenue: projectedRevenue,
      confidence_pct: confidencePct,
    });
  }

  return forecast;
}

/**
 * Get capacity forecast for next N months
 * @param {number} months - Number of months to forecast
 * @returns {Promise<Array>} Array of {month, year, projected_utilization_pct, capacity_exceeded}
 */
export async function getCapacityForecast(projects, employees, month, year, months = 3) {
  const forecast = [];
  const totalCapacity = employees.reduce((sum, e) => sum + (e.maxHoursPerMonth || 160), 0);

  for (let i = 1; i <= months; i++) {
    const forecastMonth = (month + i) % 12;
    const forecastYear = year + Math.floor((month + i) / 12);

    // Calculate projected utilization
    let projectedHours = 0;

    for (const p of projects) {
      if (p.isCompleted) continue;

      const startDate = new Date(+p.startYear, +p.startMonth);
      const endDate = new Date(+p.endYear, +p.endMonth + 1);
      const forecastDate = new Date(forecastYear, forecastMonth);

      if (forecastDate >= startDate && forecastDate <= endDate) {
        const hours = p.totalUnit === 'days'
          ? parseFloat(p.totalInput || 0) * HPD
          : parseFloat(p.totalInput || 0);
        projectedHours += hours / Math.max(1, (endDate - startDate) / (1000 * 60 * 60 * 24 * 30));
      }
    }

    const utilizationPct = totalCapacity > 0 ? Math.round((projectedHours / totalCapacity) * 100) : 0;
    const capacityExceeded = utilizationPct > 100;

    forecast.push({
      month: forecastMonth,
      year: forecastYear,
      projected_utilization_pct: utilizationPct,
      capacity_exceeded: capacityExceeded,
      headroom_pct: Math.max(0, 100 - utilizationPct),
    });
  }

  return forecast;
}

/**
 * Get attrition risk - identifies employees likely to leave
 * @returns {Promise<Array>} Array of {name, risk_score, risk_factors}
 */
export async function getAttritionRisk(employees, calDays, getA, year, month) {
  return employees.map(e => {
    let riskScore = 0;
    const riskFactors = [];

    // Factor 1: Utilization stress (over 100% = high risk)
    const hoursWorked = calDays.filter(d => getA && getA(year, month, d, e.id)).length * HPD;
    const maxHours = e.maxHoursPerMonth || 160;
    if (hoursWorked > maxHours * 1.25) {
      riskScore += 30;
      riskFactors.push('Overallocated');
    }

    // Factor 2: Low utilization (under 20% = risk of boredom)
    if (hoursWorked < maxHours * 0.2) {
      riskScore += 20;
      riskFactors.push('Underutilized');
    }

    // Factor 3: Part-time or contract (higher baseline risk)
    if (e.type && (e.type.includes('Part') || e.type.includes('Casual') || e.type.includes('Contract'))) {
      riskScore += 15;
      riskFactors.push('Non-permanent');
    }

    // Factor 4: Low rate (financial pressure)
    const rate = parseFloat(e.rate) || 0;
    if (rate < 25) {
      riskScore += 10;
      riskFactors.push('Low salary');
    }

    // Random base risk
    riskScore += Math.floor(Math.random() * 15);

    let riskLevel = 'low';
    if (riskScore > 60) riskLevel = 'critical';
    else if (riskScore > 40) riskLevel = 'high';
    else if (riskScore > 25) riskLevel = 'medium';

    return {
      id: e.id,
      name: e.name,
      role: e.role,
      risk_score: riskScore,
      risk_level: riskLevel,
      risk_factors: riskFactors,
    };
  }).sort((a, b) => b.risk_score - a.risk_score);
}
