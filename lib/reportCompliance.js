/**
 * Compliance Reports - Hours violations, skill mismatches, availability violations
 * Tracks compliance and risk issues
 */

const HPD = 8;

/**
 * Get hours violations (exceeding max hours per month)
 * @returns {Promise<Array>} Array of {name, hours_worked, max_hours, violation_hours, severity}
 */
export async function getHoursViolations(employees, calDays, getA, year, month) {
  const violations = [];

  for (const e of employees) {
    const hoursWorked = calDays.filter(d => getA && getA(year, month, d, e.id)).length * HPD;
    const maxHours = e.maxHoursPerMonth || 160;

    if (hoursWorked > maxHours) {
      const violationHours = hoursWorked - maxHours;
      const severity = violationHours > 30 ? 'critical' : violationHours > 15 ? 'high' : 'medium';

      violations.push({
        id: e.id,
        name: e.name,
        role: e.role,
        hours_worked: hoursWorked,
        max_hours: maxHours,
        violation_hours: violationHours,
        violation_pct: Math.round((violationHours / maxHours) * 100),
        severity,
      });
    }
  }

  return violations.sort((a, b) => b.violation_hours - a.violation_hours);
}

/**
 * Get skill mismatches (assignments without required skills)
 * @returns {Promise<Array>} Array of {employee, project, missing_skills, required_skills}
 */
export async function getSkillMismatches(employees, projects, calDays, getA, year, month) {
  const mismatches = [];

  for (const e of employees) {
    const empSkills = new Set(e.strengths || []);

    for (const p of projects) {
      const requiredSkills = p.strengthsRequired || [];

      // Check if employee is assigned to this project
      const isAssigned = calDays.some(d => getA && getA(year, month, d, e.id) === p.id);
      if (!isAssigned || requiredSkills.length === 0) continue;

      // Find missing skills
      const missingSkills = requiredSkills.filter(s => !empSkills.has(s));
      if (missingSkills.length > 0) {
        mismatches.push({
          employee: e.name,
          employee_id: e.id,
          project: p.name,
          project_id: p.id,
          missing_skills: missingSkills,
          required_skills: requiredSkills,
          coverage_pct: Math.round(((requiredSkills.length - missingSkills.length) / requiredSkills.length) * 100),
        });
      }
    }
  }

  return mismatches;
}

/**
 * Get availability violations (assigned on unavailable days)
 * @returns {Promise<Array>} Array of {employee, unavailable_days, assigned_days}
 */
export async function getAvailabilityViolations(employees, calDays, getA, year, month) {
  const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dlabel = (y, m, d) => {
    const dow = new Date(y, m, d).getDay();
    return DAYS_SHORT[(dow + 6) % 7];
  };

  const violations = [];

  for (const e of employees) {
    const unavailableDays = [];

    for (const d of calDays) {
      const day = dlabel(year, month, d);
      const isAssigned = getA && getA(year, month, d, e.id);

      if (isAssigned && !e.availability[day]) {
        unavailableDays.push(d);
      }
    }

    if (unavailableDays.length > 0) {
      violations.push({
        id: e.id,
        name: e.name,
        role: e.role,
        unavailable_days: unavailableDays,
        violation_count: unavailableDays.length,
        severity: unavailableDays.length > 5 ? 'high' : 'medium',
      });
    }
  }

  return violations;
}

/**
 * Get leave impact (projects affected by staff on leave)
 * @param {Array} ptoRequests - PTO request objects
 * @returns {Promise<Array>} Array of {project, affected_staff, dates}
 */
export async function getLeaveImpact(projects, employees, ptoRequests = []) {
  const impact = [];

  for (const p of projects) {
    const affectedStaff = [];
    const dates = [];

    for (const pto of ptoRequests) {
      if (pto.status !== 'approved') continue;

      const startDate = new Date(pto.date_from);
      const endDate = new Date(pto.date_to);
      const emp = employees.find(e => e.id === pto.employee_id);

      if (emp) {
        affectedStaff.push(emp.name);
        dates.push({
          from: pto.date_from,
          to: pto.date_to,
          employee: emp.name,
        });
      }
    }

    if (affectedStaff.length > 0) {
      impact.push({
        id: p.id,
        project: p.name,
        affected_staff: [...new Set(affectedStaff)],
        num_affected: affectedStaff.length,
        leave_dates: dates,
      });
    }
  }

  return impact;
}

/**
 * Get compliance summary
 * @returns {Promise<Object>} {total_violations, hours_violations, skill_violations, availability_violations, risk_level}
 */
export async function getComplianceSummary(employees, projects, calDays, getA, year, month, ptoRequests = []) {
  const hoursViolations = await getHoursViolations(employees, calDays, getA, year, month);
  const skillMismatches = await getSkillMismatches(employees, projects, calDays, getA, year, month);
  const availabilityViolations = await getAvailabilityViolations(employees, calDays, getA, year, month);
  const leaveImpact = await getLeaveImpact(projects, employees, ptoRequests);

  const totalViolations = hoursViolations.length + skillMismatches.length + availabilityViolations.length + leaveImpact.length;
  const criticalCount = hoursViolations.filter(v => v.severity === 'critical').length;

  let riskLevel = 'low';
  if (criticalCount > 0) riskLevel = 'critical';
  else if (totalViolations > 10) riskLevel = 'high';
  else if (totalViolations > 5) riskLevel = 'medium';

  return {
    total_violations: totalViolations,
    hours_violations_count: hoursViolations.length,
    skill_mismatch_count: skillMismatches.length,
    availability_violation_count: availabilityViolations.length,
    leave_impact_count: leaveImpact.length,
    critical_issues: criticalCount,
    risk_level: riskLevel,
  };
}
