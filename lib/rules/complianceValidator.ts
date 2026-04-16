export interface ShiftRule {
  id: string;
  name: string;
  rule_type: string;
  constraint_data: Record<string, any>;
  threshold: number;
  enabled_projects: string[];
  enabled: boolean;
}

export interface ComplianceViolation {
  rule_id: string;
  rule_name: string;
  violation_type: string;
  employee_id?: string;
  shift_id?: string;
  message: string;
  severity: 'warning' | 'error';
}

export const RULE_TYPES = {
  MAX_CONSECUTIVE_DAYS: 'max_consecutive_days',
  MIN_REST_BETWEEN_SHIFTS: 'min_rest_between_shifts',
  BREAK_REQUIREMENT: 'break_requirement',
  OVERTIME_THRESHOLD: 'overtime_threshold',
  CERTIFICATION_REQUIRED: 'certification_required',
  BUDGET_LIMIT: 'budget_limit',
  MAX_HOURS_PER_WEEK: 'max_hours_per_week',
} as const;

export async function validateRoster(
  shifts: Array<{ id: string; date: string; start_time: string; end_time: string; project_id: string }>,
  assignments: Array<{ shift_id: string; employee_id: string }>,
  employees: Array<{ id: string; certifications: string[] }>,
  rules: ShiftRule[]
): Promise<ComplianceViolation[]> {
  const violations: ComplianceViolation[] = [];

  // Enable rules filter
  const enabledRules = rules.filter((r) => r.enabled);

  for (const rule of enabledRules) {
    switch (rule.rule_type) {
      case RULE_TYPES.MAX_CONSECUTIVE_DAYS:
        violations.push(...checkMaxConsecutiveDays(shifts, assignments, rule));
        break;
      case RULE_TYPES.MIN_REST_BETWEEN_SHIFTS:
        violations.push(...checkMinRestBetweenShifts(shifts, assignments, rule));
        break;
      case RULE_TYPES.BREAK_REQUIREMENT:
        violations.push(...checkBreakRequirements(shifts, assignments, rule));
        break;
      case RULE_TYPES.OVERTIME_THRESHOLD:
        violations.push(...checkOvertimeThreshold(shifts, assignments, rule));
        break;
      case RULE_TYPES.CERTIFICATION_REQUIRED:
        violations.push(...checkCertifications(assignments, employees, rule));
        break;
      case RULE_TYPES.BUDGET_LIMIT:
        violations.push(...checkBudgetLimit(shifts, rule));
        break;
      case RULE_TYPES.MAX_HOURS_PER_WEEK:
        violations.push(...checkMaxHoursPerWeek(shifts, assignments, rule));
        break;
    }
  }

  return violations;
}

function checkMaxConsecutiveDays(
  shifts: any[],
  assignments: any[],
  rule: ShiftRule
): ComplianceViolation[] {
  const violations: ComplianceViolation[] = [];
  const maxDays = rule.threshold || 6;

  const employeeShifts: Record<string, any[]> = {};
  assignments.forEach((a) => {
    if (!employeeShifts[a.employee_id]) employeeShifts[a.employee_id] = [];
    const shift = shifts.find((s) => s.id === a.shift_id);
    if (shift) employeeShifts[a.employee_id].push(shift);
  });

  Object.entries(employeeShifts).forEach(([empId, empShifts]) => {
    const sortedDates = empShifts
      .map((s) => new Date(s.date).getTime())
      .sort((a, b) => a - b);

    let consecutive = 1;
    for (let i = 1; i < sortedDates.length; i++) {
      const daysDiff = (sortedDates[i] - sortedDates[i - 1]) / (1000 * 60 * 60 * 24);
      if (daysDiff === 1) {
        consecutive++;
        if (consecutive > maxDays) {
          violations.push({
            rule_id: rule.id,
            rule_name: rule.name,
            violation_type: RULE_TYPES.MAX_CONSECUTIVE_DAYS,
            employee_id: empId,
            message: `Employee ${empId} scheduled for ${consecutive} consecutive days (max: ${maxDays})`,
            severity: 'error',
          });
        }
      } else {
        consecutive = 1;
      }
    }
  });

  return violations;
}

function checkMinRestBetweenShifts(
  shifts: any[],
  assignments: any[],
  rule: ShiftRule
): ComplianceViolation[] {
  const violations: ComplianceViolation[] = [];
  const minRestHours = rule.threshold || 11;

  const employeeShifts: Record<string, any[]> = {};
  assignments.forEach((a) => {
    if (!employeeShifts[a.employee_id]) employeeShifts[a.employee_id] = [];
    const shift = shifts.find((s) => s.id === a.shift_id);
    if (shift) employeeShifts[a.employee_id].push(shift);
  });

  Object.entries(employeeShifts).forEach(([empId, empShifts]) => {
    const sorted = empShifts.sort(
      (a, b) =>
        new Date(`${a.date}T${a.end_time}`).getTime() -
        new Date(`${b.date}T${b.end_time}`).getTime()
    );

    for (let i = 1; i < sorted.length; i++) {
      const prevEnd = new Date(`${sorted[i - 1].date}T${sorted[i - 1].end_time}`);
      const nextStart = new Date(`${sorted[i].date}T${sorted[i].start_time}`);
      const restHours = (nextStart.getTime() - prevEnd.getTime()) / (1000 * 60 * 60);

      if (restHours < minRestHours) {
        violations.push({
          rule_id: rule.id,
          rule_name: rule.name,
          violation_type: RULE_TYPES.MIN_REST_BETWEEN_SHIFTS,
          employee_id: empId,
          shift_id: sorted[i].id,
          message: `Insufficient rest between shifts: ${restHours.toFixed(1)}h (min: ${minRestHours}h)`,
          severity: 'warning',
        });
      }
    }
  });

  return violations;
}

function checkBreakRequirements(
  shifts: any[],
  assignments: any[],
  rule: ShiftRule
): ComplianceViolation[] {
  const violations: ComplianceViolation[] = [];
  const breakMinutes = rule.constraint_data?.break_minutes || 30;
  const shiftDurationThreshold = rule.constraint_data?.shift_duration_hours || 4;

  assignments.forEach((a) => {
    const shift = shifts.find((s) => s.id === a.shift_id);
    if (!shift) return;

    const [startH, startM] = shift.start_time.split(':').map(Number);
    const [endH, endM] = shift.end_time.split(':').map(Number);
    const duration = (endH + endM / 60) - (startH + startM / 60);

    if (duration > shiftDurationThreshold && !rule.constraint_data?.break_taken) {
      violations.push({
        rule_id: rule.id,
        rule_name: rule.name,
        violation_type: RULE_TYPES.BREAK_REQUIREMENT,
        employee_id: a.employee_id,
        shift_id: shift.id,
        message: `Shift ${duration.toFixed(1)}h requires ${breakMinutes}min break`,
        severity: 'warning',
      });
    }
  });

  return violations;
}

function checkOvertimeThreshold(
  shifts: any[],
  assignments: any[],
  rule: ShiftRule
): ComplianceViolation[] {
  const violations: ComplianceViolation[] = [];
  const threshold = rule.threshold || 50;

  const employeeHours: Record<string, number> = {};
  assignments.forEach((a) => {
    const shift = shifts.find((s) => s.id === a.shift_id);
    if (!shift) return;

    if (!employeeHours[a.employee_id]) employeeHours[a.employee_id] = 0;

    const [startH, startM] = shift.start_time.split(':').map(Number);
    const [endH, endM] = shift.end_time.split(':').map(Number);
    const duration = (endH + endM / 60) - (startH + startM / 60);
    employeeHours[a.employee_id] += duration;
  });

  Object.entries(employeeHours).forEach(([empId, hours]) => {
    if (hours > threshold) {
      violations.push({
        rule_id: rule.id,
        rule_name: rule.name,
        violation_type: RULE_TYPES.OVERTIME_THRESHOLD,
        employee_id: empId,
        message: `Employee ${empId} scheduled for ${hours.toFixed(1)}h (threshold: ${threshold}h)`,
        severity: 'warning',
      });
    }
  });

  return violations;
}

function checkCertifications(
  assignments: any[],
  employees: any[],
  rule: ShiftRule
): ComplianceViolation[] {
  const violations: ComplianceViolation[] = [];
  const requiredCerts = rule.constraint_data?.required_certifications || [];

  assignments.forEach((a) => {
    const employee = employees.find((e) => e.id === a.employee_id);
    if (!employee) return;

    const hasCerts = requiredCerts.every((cert: string) =>
      employee.certifications?.includes(cert)
    );

    if (!hasCerts) {
      violations.push({
        rule_id: rule.id,
        rule_name: rule.name,
        violation_type: RULE_TYPES.CERTIFICATION_REQUIRED,
        employee_id: a.employee_id,
        message: `Employee missing required certifications: ${requiredCerts.join(', ')}`,
        severity: 'error',
      });
    }
  });

  return violations;
}

function checkBudgetLimit(shifts: any[], rule: ShiftRule): ComplianceViolation[] {
  const violations: ComplianceViolation[] = [];
  const budgetLimit = rule.threshold || 50000;

  let totalBudget = 0;
  shifts.forEach((s) => {
    const [startH, startM] = s.start_time.split(':').map(Number);
    const [endH, endM] = s.end_time.split(':').map(Number);
    const duration = (endH + endM / 60) - (startH + startM / 60);
    totalBudget += duration * (s.budget_hours || 0);
  });

  if (totalBudget > budgetLimit) {
    violations.push({
      rule_id: rule.id,
      rule_name: rule.name,
      violation_type: RULE_TYPES.BUDGET_LIMIT,
      message: `Total roster budget $${totalBudget.toFixed(2)} exceeds limit $${budgetLimit.toFixed(2)}`,
      severity: 'error',
    });
  }

  return violations;
}

function checkMaxHoursPerWeek(
  shifts: any[],
  assignments: any[],
  rule: ShiftRule
): ComplianceViolation[] {
  const violations: ComplianceViolation[] = [];
  const maxHours = rule.threshold || 48;

  const employeeWeeklyHours: Record<string, number> = {};

  assignments.forEach((a) => {
    const shift = shifts.find((s) => s.id === a.shift_id);
    if (!shift) return;

    const [startH, startM] = shift.start_time.split(':').map(Number);
    const [endH, endM] = shift.end_time.split(':').map(Number);
    const duration = (endH + endM / 60) - (startH + startM / 60);

    const weekKey = `${a.employee_id}-${getWeekNumber(new Date(shift.date))}`;
    if (!employeeWeeklyHours[weekKey]) employeeWeeklyHours[weekKey] = 0;
    employeeWeeklyHours[weekKey] += duration;
  });

  Object.entries(employeeWeeklyHours).forEach(([key, hours]) => {
    if (hours > maxHours) {
      const [empId] = key.split('-');
      violations.push({
        rule_id: rule.id,
        rule_name: rule.name,
        violation_type: RULE_TYPES.MAX_HOURS_PER_WEEK,
        employee_id: empId,
        message: `Employee ${empId} scheduled for ${hours.toFixed(1)}h this week (max: ${maxHours}h)`,
        severity: 'warning',
      });
    }
  });

  return violations;
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
