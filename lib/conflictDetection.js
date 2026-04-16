import { supabase } from './supabase';

// ── Detect Conflicts in Roster ────────────────────────────────────────────────
export function detectConflicts(assignments, employees, projects) {
  const conflicts = [];

  // 1. Double-booking (same employee, same day, multiple projects)
  const empDayMap = {};
  assignments.forEach(a => {
    const key = `${a.employee_id}-${a.year}-${a.month}-${a.day}`;
    if (!empDayMap[key]) empDayMap[key] = [];
    empDayMap[key].push(a);
  });

  Object.entries(empDayMap).forEach(([key, assigns]) => {
    if (assigns.length > 1) {
      const emp = employees.find(e => e.id === assigns[0].employee_id);
      conflicts.push({
        type: 'double_booking',
        severity: 'critical',
        description: `${emp?.name} assigned to multiple projects on day`,
        assignments: assigns.map(a => a.id),
        suggestion: 'Remove one or more assignments',
      });
    }
  });

  // 2. Max hours violation
  const empMonthHours = {};
  assignments.forEach(a => {
    const key = `${a.employee_id}-${a.year}-${a.month}`;
    empMonthHours[key] = (empMonthHours[key] || 0) + 8; // Assuming 8 hours per day
  });

  Object.entries(empMonthHours).forEach(([key, hours]) => {
    const [empId] = key.split('-');
    const emp = employees.find(e => e.id === empId);
    const max = emp?.max_hours_per_month || 160;

    if (hours > max) {
      conflicts.push({
        type: 'max_hours_violation',
        severity: 'warning',
        description: `${emp?.name} exceeds max hours (${hours}h > ${max}h)`,
        employee_id: empId,
        hours,
        max,
        suggestion: 'Remove some assignments or increase max hours',
      });
    }
  });

  return conflicts;
}

// ── Get Conflict Summary ──────────────────────────────────────────────────────
export function getConflictSummary(conflicts) {
  const summary = {
    total: conflicts.length,
    critical: conflicts.filter(c => c.severity === 'critical').length,
    warning: conflicts.filter(c => c.severity === 'warning').length,
    info: conflicts.filter(c => c.severity === 'info').length,
  };

  return summary;
}

// ── Suggest Conflict Resolution ───────────────────────────────────────────────
export function suggestResolution(conflict, assignments, employees) {
  const suggestions = [];

  switch (conflict.type) {
    case 'double_booking':
      // Suggest removing the lower-priority assignment
      const assigns = conflict.assignments
        .map(id => assignments.find(a => a.id === id))
        .filter(Boolean);
      
      if (assigns.length > 1) {
        suggestions.push({
          action: 'remove_assignment',
          target: assigns[1].id,
          reason: 'Remove secondary assignment to resolve conflict',
        });
      }
      break;

    case 'max_hours_violation':
      const surplus = (conflict.hours - conflict.max) + 8; // Remove 1 day to test
      suggestions.push({
        action: 'remove_assignment',
        reason: `Remove 1 assignment to reduce by 8 hours`,
      });
      break;

    case 'skill_mismatch':
      suggestions.push({
        action: 'reassign',
        reason: 'Assign employee with required skill',
      });
      break;
  }

  return suggestions;
}

// ── Check Specific Conflict Types ─────────────────────────────────────────────
export function checkSkillMismatch(assignment, employees, projects) {
  const emp = employees.find(e => e.id === assignment.employee_id);
  const proj = projects.find(p => p.id === assignment.project_id);

  if (!proj?.strengthsRequired || !emp?.strengths) return null;

  const missing = proj.strengthsRequired.filter(
    skill => !emp.strengths.includes(skill)
  );

  if (missing.length > 0) {
    return {
      type: 'skill_mismatch',
      severity: 'warning',
      description: `${emp.name} missing skills: ${missing.join(', ')}`,
      missing_skills: missing,
    };
  }

  return null;
}

export function checkAvailabilityViolation(assignment, employees) {
  const emp = employees.find(e => e.id === assignment.employee_id);
  if (!emp?.availability) return null;

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const date = new Date(assignment.year, assignment.month, assignment.day);
  const dayName = DAYS[date.getDay()];

  if (emp.availability[dayName] === false) {
    return {
      type: 'availability_violation',
      severity: 'warning',
      description: `${emp.name} is unavailable on ${dayName}`,
      day: dayName,
    };
  }

  return null;
}

export function checkLeaveConflict(assignment, employees, leaveRequests = []) {
  const emp = employees.find(e => e.id === assignment.employee_id);
  if (!emp) return null;

  const assignDate = new Date(assignment.year, assignment.month, assignment.day);
  const conflict = leaveRequests.find(req => {
    if (req.employee_id !== assignment.employee_id || req.status !== 'approved') return false;
    const startDate = new Date(req.start_date);
    const endDate = new Date(req.end_date);
    return assignDate >= startDate && assignDate <= endDate;
  });

  if (conflict) {
    return {
      type: 'leave_conflict',
      severity: 'critical',
      description: `${emp.name} has approved leave`,
      leave_request_id: conflict.id,
    };
  }

  return null;
}
