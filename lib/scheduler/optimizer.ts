interface Shift {
  id: string;
  required_count: number;
  required_skills: string[];
  budget_hours: number;
  date: string;
}

interface Employee {
  id: string;
  name: string;
  strengths: string[];
  availability: Record<string, boolean>;
  max_hours_per_month: number;
}

interface Assignment {
  shift_id: string;
  employee_id: string;
}

export interface OptimizedSchedule {
  assignments: Assignment[];
  unassignedShifts: string[];
  score: number;
}

export function optimizeSchedule(
  shifts: Shift[],
  employees: Employee[],
  existingAssignments: Record<string, string[]>
): OptimizedSchedule {
  const assignments: Assignment[] = [];
  const unassignedShifts: string[] = [];
  let score = 0;

  // Get open shifts
  const openShifts = shifts.filter((s) => {
    const assigned = existingAssignments[s.id] || [];
    return assigned.length < s.required_count;
  });

  openShifts.forEach((shift) => {
    const assigned = existingAssignments[shift.id] || [];
    const spotsNeeded = shift.required_count - assigned.length;

    // Find eligible employees
    const eligible = employees
      .filter((e) => {
        const dayOfWeek = new Date(shift.date).toLocaleDateString('en-US', { weekday: 'short' });
        return e.availability[dayOfWeek] ?? false;
      })
      .filter((e) => !assigned.includes(e.id));

    // Sort by skill match (primary) then alphabetically
    eligible.sort((a, b) => {
      const aSkillMatch = shift.required_skills.filter((s) => a.strengths.includes(s)).length;
      const bSkillMatch = shift.required_skills.filter((s) => b.strengths.includes(s)).length;
      if (aSkillMatch !== bSkillMatch) return bSkillMatch - aSkillMatch;
      return a.name.localeCompare(b.name);
    });

    // Assign top eligible employees
    for (let i = 0; i < Math.min(spotsNeeded, eligible.length); i++) {
      assignments.push({
        shift_id: shift.id,
        employee_id: eligible[i].id,
      });

      // Increase score for skill matches
      const skillMatch = shift.required_skills.filter((s) =>
        eligible[i].strengths.includes(s)
      ).length;
      score += (skillMatch / Math.max(shift.required_skills.length, 1)) * 10 + 5;
    }

    // Track unassigned shifts
    if (assignments.filter((a) => a.shift_id === shift.id).length < shift.required_count) {
      unassignedShifts.push(shift.id);
    }
  });

  return { assignments, unassignedShifts, score };
}

export function scoreAssignment(shift: Shift, employee: Employee): number {
  let score = 0;

  // Skill match: max 100 points
  if (shift.required_skills.length > 0) {
    const matchedSkills = shift.required_skills.filter((s) => employee.strengths.includes(s))
      .length;
    score += (matchedSkills / shift.required_skills.length) * 100;
  } else {
    score += 50; // Default if no skills required
  }

  // Availability bonus: 20 points
  const dayOfWeek = new Date(shift.date).toLocaleDateString('en-US', { weekday: 'short' });
  if (employee.availability[dayOfWeek]) {
    score += 20;
  }

  return score;
}
