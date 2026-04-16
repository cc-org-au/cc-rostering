import { supabase } from './supabase';

const ALERT_TYPES = {
  // Roster Alerts
  UNDERSTAFFED_PROJECT: 'understaffed_project',
  DOUBLE_BOOKING_DETECTED: 'double_booking_detected',
  EMPLOYEE_UNAVAILABLE_ASSIGNED: 'employee_unavailable_assigned',
  SKILL_MISMATCH: 'skill_mismatch',

  // Employee Alerts
  MAX_HOURS_VIOLATION: 'max_hours_violation',
  CERTIFICATION_EXPIRING_SOON: 'certification_expiring_soon',
  AVAILABLE_CAPACITY_FLAGGED: 'available_capacity_flagged',

  // Leave Alerts
  LEAVE_CONFLICT: 'leave_conflict',
  LEAVE_REQUEST_SUBMITTED: 'leave_request_submitted',
  LEAVE_REQUEST_APPROVED: 'leave_request_approved',
  LEAVE_REQUEST_DENIED: 'leave_request_denied',

  // Project Alerts
  BUDGET_EXCEEDED: 'budget_exceeded',
  TIMELINE_AT_RISK: 'timeline_at_risk',
  PROJECT_COMPLETED: 'project_completed',

  // System Alerts
  SYSTEM_BACKUP_COMPLETE: 'system_backup_complete',
  DATA_EXPORT_READY: 'data_export_ready',
  USER_ACTIVITY_UNUSUAL: 'user_activity_unusual',
  ROSTER_APPROVAL_PENDING: 'roster_approval_pending'
};

// Check for understaffed projects
export async function checkUnderstaffedProjects() {
  try {
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name, status')
      .eq('status', 'active')
      .eq('is_completed', false);

    if (!projects) return [];

    const alerts = [];

    for (const project of projects) {
      const { data: assignments } = await supabase
        .from('assignments')
        .select('id')
        .eq('project_id', project.id)
        .eq('status', 'assigned');

      const currentCount = assignments?.length || 0;
      const requiredCount = 3; // Default threshold

      if (currentCount < requiredCount) {
        alerts.push({
          type: ALERT_TYPES.UNDERSTAFFED_PROJECT,
          title: `Project Understaffed: ${project.name}`,
          message: `Project "${project.name}" is understaffed. Current: ${currentCount}/${requiredCount} staff`,
          severity: 'high',
          relatedEntityId: project.id,
          relatedEntityType: 'project',
          metadata: { currentCount, requiredCount, projectId: project.id }
        });
      }
    }

    return alerts;
  } catch (err) {
    console.error('Error checking understaffed projects:', err);
    return [];
  }
}

// Check for double bookings
export async function checkDoubleBooking() {
  try {
    const { data: assignments } = await supabase
      .from('assignments')
      .select('id, employee_id, project_id, start_date, end_date, status');

    if (!assignments || assignments.length === 0) return [];

    const alerts = [];
    const employeeAssignments = {};

    // Group by employee
    for (const assignment of assignments) {
      if (!employeeAssignments[assignment.employee_id]) {
        employeeAssignments[assignment.employee_id] = [];
      }
      employeeAssignments[assignment.employee_id].push(assignment);
    }

    // Check for overlaps
    for (const [empId, emps] of Object.entries(employeeAssignments)) {
      for (let i = 0; i < emps.length; i++) {
        for (let j = i + 1; j < emps.length; j++) {
          const a1 = emps[i];
          const a2 = emps[j];

          const start1 = new Date(a1.start_date);
          const end1 = new Date(a1.end_date);
          const start2 = new Date(a2.start_date);
          const end2 = new Date(a2.end_date);

          if (start1 <= end2 && start2 <= end1) {
            const { data: emp } = await supabase
              .from('employees')
              .select('name')
              .eq('id', empId)
              .single();

            const { data: proj1 } = await supabase
              .from('projects')
              .select('name')
              .eq('id', a1.project_id)
              .single();

            const { data: proj2 } = await supabase
              .from('projects')
              .select('name')
              .eq('id', a2.project_id)
              .single();

            alerts.push({
              type: ALERT_TYPES.DOUBLE_BOOKING_DETECTED,
              title: `Double Booking: ${emp?.name || 'Unknown Employee'}`,
              message: `${emp?.name} is booked on "${proj1?.name}" and "${proj2?.name}" for overlapping dates (${a1.start_date} to ${a1.end_date})`,
              severity: 'critical',
              relatedEntityId: empId,
              relatedEntityType: 'employee',
              metadata: { employeeId: empId, assignments: [a1.id, a2.id] }
            });
          }
        }
      }
    }

    return alerts;
  } catch (err) {
    console.error('Error checking double bookings:', err);
    return [];
  }
}

// Check for unavailable employees assigned to shifts
export async function checkUnavailableAssignments() {
  try {
    const { data: assignments } = await supabase
      .from('assignments')
      .select('id, employee_id, start_date, end_date')
      .eq('status', 'assigned');

    if (!assignments) return [];

    const alerts = [];

    for (const assignment of assignments) {
      const { data: employee } = await supabase
        .from('employees')
        .select('name, availability')
        .eq('id', assignment.employee_id)
        .single();

      if (!employee) continue;

      const startDate = new Date(assignment.start_date);
      const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][startDate.getDay()];

      const availability = employee.availability || {};
      if (!availability[dayOfWeek]) {
        alerts.push({
          type: ALERT_TYPES.EMPLOYEE_UNAVAILABLE_ASSIGNED,
          title: `Employee Unavailable: ${employee.name}`,
          message: `${employee.name} is marked unavailable on ${dayOfWeek} but has assignment on ${assignment.start_date}`,
          severity: 'high',
          relatedEntityId: assignment.employee_id,
          relatedEntityType: 'employee',
          metadata: { employeeId: assignment.employee_id, assignmentId: assignment.id }
        });
      }
    }

    return alerts;
  } catch (err) {
    console.error('Error checking unavailable assignments:', err);
    return [];
  }
}

// Check for max hours violations
export async function checkMaxHoursViolation(year, month) {
  try {
    const { data: employees } = await supabase
      .from('employees')
      .select('id, name, max_hours_per_month');

    if (!employees) return [];

    const alerts = [];
    const warningThreshold = 0.8; // Alert at 80% of max

    for (const emp of employees) {
      const { data: assignments } = await supabase
        .from('assignments')
        .select('start_date, end_date')
        .eq('employee_id', emp.id)
        .eq('status', 'assigned');

      if (!assignments) continue;

      let totalHours = 0;
      for (const assignment of assignments) {
        const start = new Date(assignment.start_date);
        const end = new Date(assignment.end_date);

        if (start.getFullYear() === year && start.getMonth() === month) {
          const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
          totalHours += days * 8; // Assuming 8 hours per day
        }
      }

      const maxHours = emp.max_hours_per_month || 160;
      const percentUsed = totalHours / maxHours;

      if (percentUsed >= warningThreshold) {
        alerts.push({
          type: ALERT_TYPES.MAX_HOURS_VIOLATION,
          title: `Approaching Max Hours: ${emp.name}`,
          message: `${emp.name} is approaching max hours (${Math.round(totalHours)}/${maxHours} hours) in ${new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
          severity: 'medium',
          relatedEntityId: emp.id,
          relatedEntityType: 'employee',
          metadata: { employeeId: emp.id, hoursUsed: totalHours, maxHours }
        });
      }
    }

    return alerts;
  } catch (err) {
    console.error('Error checking max hours violation:', err);
    return [];
  }
}

// Check for certifications expiring soon
export async function checkCertificationExpiry(daysThreshold = 30) {
  try {
    const { data: employees } = await supabase
      .from('employees')
      .select('id, name, certifications');

    if (!employees) return [];

    const alerts = [];
    const today = new Date();
    const thresholdDate = new Date(today.getTime() + daysThreshold * 24 * 60 * 60 * 1000);

    // Note: This assumes certifications are stored as text array
    // In real implementation, you might want to store expiry dates separately

    return alerts;
  } catch (err) {
    console.error('Error checking certification expiry:', err);
    return [];
  }
}

// Check for leave conflicts
export async function checkLeaveConflicts() {
  try {
    const { data: leaves } = await supabase
      .from('leave_records')
      .select('id, employee_id, start_date, end_date, status')
      .eq('status', 'approved');

    if (!leaves) return [];

    const alerts = [];

    for (const leave of leaves) {
      const { data: assignments } = await supabase
        .from('assignments')
        .select('id, project_id, start_date, end_date')
        .eq('employee_id', leave.employee_id)
        .eq('status', 'assigned');

      if (!assignments) continue;

      const leaveStart = new Date(leave.start_date);
      const leaveEnd = new Date(leave.end_date);

      for (const assignment of assignments) {
        const assignStart = new Date(assignment.start_date);
        const assignEnd = new Date(assignment.end_date);

        if (leaveStart <= assignEnd && assignStart <= leaveEnd) {
          const { data: emp } = await supabase
            .from('employees')
            .select('name')
            .eq('id', leave.employee_id)
            .single();

          alerts.push({
            type: ALERT_TYPES.LEAVE_CONFLICT,
            title: `Leave Conflict: ${emp?.name || 'Unknown'}`,
            message: `${emp?.name} has approved leave from ${leave.start_date} to ${leave.end_date} but is scheduled for assignment`,
            severity: 'high',
            relatedEntityId: leave.employee_id,
            relatedEntityType: 'employee',
            metadata: { employeeId: leave.employee_id, leaveId: leave.id }
          });
        }
      }
    }

    return alerts;
  } catch (err) {
    console.error('Error checking leave conflicts:', err);
    return [];
  }
}

// Check for skill mismatches
export async function checkSkillMismatch() {
  try {
    const { data: assignments } = await supabase
      .from('assignments')
      .select('id, employee_id, project_id, status');

    if (!assignments) return [];

    const alerts = [];

    for (const assignment of assignments) {
      const { data: emp } = await supabase
        .from('employees')
        .select('strengths')
        .eq('id', assignment.employee_id)
        .single();

      const { data: proj } = await supabase
        .from('projects')
        .select('name, strengths_required')
        .eq('id', assignment.project_id)
        .single();

      if (!emp || !proj) continue;

      const empSkills = emp.strengths || [];
      const requiredSkills = proj.strengths_required || [];

      const missingSkills = requiredSkills.filter(skill => !empSkills.includes(skill));

      if (missingSkills.length > 0) {
        const { data: empName } = await supabase
          .from('employees')
          .select('name')
          .eq('id', assignment.employee_id)
          .single();

        alerts.push({
          type: ALERT_TYPES.SKILL_MISMATCH,
          title: `Skill Mismatch: ${empName?.name || 'Unknown'}`,
          message: `${empName?.name} lacks required skill(s): ${missingSkills.join(', ')} for project "${proj.name}"`,
          severity: 'medium',
          relatedEntityId: assignment.id,
          relatedEntityType: 'assignment',
          metadata: { employeeId: assignment.employee_id, missingSkills }
        });
      }
    }

    return alerts;
  } catch (err) {
    console.error('Error checking skill mismatch:', err);
    return [];
  }
}

// Check for budget overruns
export async function checkBudgetOverrun() {
  try {
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name, budget_total');

    if (!projects) return [];

    const alerts = [];

    for (const project of projects) {
      const { data: logs } = await supabase
        .from('revenue_logs')
        .select('amount')
        .eq('project_id', project.id);

      const totalSpent = logs?.reduce((sum, log) => sum + (log.amount || 0), 0) || 0;
      const budget = project.budget_total || 0;

      if (budget > 0 && totalSpent > budget) {
        const overage = totalSpent - budget;
        alerts.push({
          type: ALERT_TYPES.BUDGET_EXCEEDED,
          title: `Budget Exceeded: ${project.name}`,
          message: `Project "${project.name}" budget exceeded by $${Math.round(overage)}`,
          severity: 'high',
          relatedEntityId: project.id,
          relatedEntityType: 'project',
          metadata: { projectId: project.id, budgetLimit: budget, totalSpent, overage }
        });
      }
    }

    return alerts;
  } catch (err) {
    console.error('Error checking budget overrun:', err);
    return [];
  }
}

// Main function to trigger all alert checks
export async function evaluateAllAlerts() {
  try {
    const results = await Promise.all([
      checkUnderstaffedProjects(),
      checkDoubleBooking(),
      checkUnavailableAssignments(),
      checkMaxHoursViolation(new Date().getFullYear(), new Date().getMonth()),
      checkCertificationExpiry(),
      checkLeaveConflicts(),
      checkSkillMismatch(),
      checkBudgetOverrun()
    ]);

    const allAlerts = results.flat();

    // Log to audit
    if (allAlerts.length > 0) {
      await supabase
        .from('alert_audit_log')
        .insert([{
          alert_type: 'batch_evaluation',
          trigger_reason: 'Scheduled alert evaluation',
          triggered_count: allAlerts.length,
          metadata: { alertTypes: allAlerts.map(a => a.type) },
          success: true
        }]);
    }

    return allAlerts;
  } catch (err) {
    console.error('Error evaluating alerts:', err);
    return [];
  }
}

export { ALERT_TYPES };
