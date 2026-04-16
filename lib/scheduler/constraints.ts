export interface ScheduleConstraint {
  type: string;
  config: Record<string, any>;
}

export const CONSTRAINT_TYPES = {
  MAX_CONSECUTIVE_DAYS: 'max_consecutive_days',
  MIN_REST_HOURS: 'min_rest_hours',
  BREAK_REQUIREMENT: 'break_requirement',
  OVERTIME_THRESHOLD: 'overtime_threshold',
  CERTIFICATION_REQUIRED: 'certification_required',
  BUDGET_LIMIT: 'budget_limit',
  AVAILABILITY: 'availability',
} as const;

export function checkAvailability(
  employeeId: string,
  date: string,
  employeeAvailability: Record<string, boolean>
): boolean {
  const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'short' });
  return employeeAvailability[dayOfWeek] ?? false;
}

export function calculateHoursWorked(
  assignments: Array<{ start_time: string; end_time: string }>,
  startDate: string,
  endDate: string
): number {
  let total = 0;
  assignments.forEach((a) => {
    const [startH, startM] = a.start_time.split(':').map(Number);
    const [endH, endM] = a.end_time.split(':').map(Number);
    const hours = (endH + endM / 60) - (startH + startM / 60);
    total += hours;
  });
  return total;
}

export function validateOvertimeThreshold(
  hoursThisMonth: number,
  threshold: number = 50
): boolean {
  return hoursThisMonth <= threshold;
}

export function validateCertificationRequired(
  employeeCertifications: string[],
  requiredCertifications: string[]
): boolean {
  return requiredCertifications.every((cert) => employeeCertifications.includes(cert));
}

export function validateBudgetConstraint(
  assignedHours: number,
  budgetHours: number
): boolean {
  return assignedHours <= budgetHours;
}

export function calculateConsecutiveDays(
  assignments: Array<{ date: string }>,
  targetDate: string
): number {
  const sortedDates = assignments
    .map((a) => new Date(a.date).getTime())
    .sort((a, b) => a - b);

  let consecutive = 1;
  let maxConsecutive = 1;

  for (let i = 1; i < sortedDates.length; i++) {
    const daysDiff = (sortedDates[i] - sortedDates[i - 1]) / (1000 * 60 * 60 * 24);
    if (daysDiff === 1) {
      consecutive++;
      maxConsecutive = Math.max(maxConsecutive, consecutive);
    } else {
      consecutive = 1;
    }
  }

  return maxConsecutive;
}
