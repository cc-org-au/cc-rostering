import { supabase } from './supabase';

// ── Bulk Roster Assignment ────────────────────────────────────────────────────
export async function bulkAssignProject(employeeIds, projectId, dateRange) {
  const { startDate, endDate } = dateRange;
  const results = { assigned: 0, skipped: 0, errors: [] };

  try {
    for (const empId of employeeIds) {
      try {
        // Get employee's current hours in date range
        const { data: assignments } = await supabase
          .from('assignments')
          .select('*')
          .eq('employee_id', empId)
          .gte('year', new Date(startDate).getFullYear())
          .lte('year', new Date(endDate).getFullYear());

        const currentHours = assignments?.reduce((sum, a) => sum + 8, 0) || 0;
        
        // Get employee's max hours
        const { data: emp } = await supabase
          .from('employees')
          .select('max_hours_per_month')
          .eq('id', empId)
          .single();

        if (currentHours >= (emp?.max_hours_per_month || 160)) {
          results.skipped++;
          results.errors.push(`Employee ${empId} at max hours limit`);
          continue;
        }

        // Create assignment for each day in range
        let current = new Date(startDate);
        const assignments_to_insert = [];
        
        while (current <= new Date(endDate)) {
          assignments_to_insert.push({
            year: current.getFullYear(),
            month: current.getMonth(),
            day: current.getDate(),
            employee_id: empId,
            project_id: projectId,
          });
          current.setDate(current.getDate() + 1);
        }

        const { error } = await supabase
          .from('assignments')
          .insert(assignments_to_insert);

        if (error) {
          results.errors.push(`Failed to assign ${empId}: ${error.message}`);
          results.skipped++;
        } else {
          results.assigned += assignments_to_insert.length;
        }
      } catch (e) {
        results.errors.push(`Error processing ${empId}: ${e.message}`);
        results.skipped++;
      }
    }

    return results;
  } catch (e) {
    throw new Error(`Bulk assignment failed: ${e.message}`);
  }
}

// ── Bulk Availability Update ──────────────────────────────────────────────────
export async function bulkUpdateAvailability(employeeIds, dayOfWeek, available) {
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayName = DAYS[dayOfWeek];
  let updated = 0;

  try {
    for (const empId of employeeIds) {
      const { data: emp } = await supabase
        .from('employees')
        .select('availability')
        .eq('id', empId)
        .single();

      if (emp) {
        const updated_av = { ...emp.availability, [dayName]: available };
        await supabase
          .from('employees')
          .update({ availability: updated_av })
          .eq('id', empId);
        updated++;
      }
    }

    return { updated, total: employeeIds.length };
  } catch (e) {
    throw new Error(`Bulk availability update failed: ${e.message}`);
  }
}

// ── Bulk Remove Assignments ───────────────────────────────────────────────────
export async function bulkRemoveAssignments(assignmentIds, reason) {
  let deleted = 0;

  try {
    for (const assignId of assignmentIds) {
      const { error } = await supabase
        .from('assignments')
        .delete()
        .eq('id', assignId);

      if (!error) deleted++;
    }

    // Log audit trail
    if (deleted > 0) {
      await supabase.from('audit_log').insert({
        action: 'bulk_remove_assignments',
        details: { count: deleted, reason, assignment_ids: assignmentIds },
        created_at: new Date().toISOString(),
      });
    }

    return { deleted, total: assignmentIds.length };
  } catch (e) {
    throw new Error(`Bulk removal failed: ${e.message}`);
  }
}

// ── Bulk Approval ─────────────────────────────────────────────────────────────
export async function bulkApproveRoster(year, month, approvedBy) {
  try {
    const { data: assignments } = await supabase
      .from('assignments')
      .select('*')
      .eq('year', year)
      .eq('month', month);

    if (!assignments || assignments.length === 0) {
      return { approved: 0, total: 0 };
    }

    // Mark roster as approved (if using approval status table)
    const { error } = await supabase.from('roster_approvals').insert({
      year,
      month,
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
      status: 'approved',
    });

    if (error) console.warn('Approval status not recorded:', error);

    return { approved: assignments.length, total: assignments.length };
  } catch (e) {
    throw new Error(`Bulk approval failed: ${e.message}`);
  }
}

// ── Validate Bulk Operations ──────────────────────────────────────────────────
export function validateBulkOperation(employeeIds, projectIds, dateRange) {
  const errors = [];

  if (!employeeIds || employeeIds.length === 0) errors.push('No employees selected');
  if (!projectIds || projectIds.length === 0) errors.push('No projects selected');
  if (!dateRange?.startDate || !dateRange?.endDate) errors.push('Invalid date range');
  if (new Date(dateRange?.startDate) > new Date(dateRange?.endDate)) {
    errors.push('Start date must be before end date');
  }

  return { valid: errors.length === 0, errors };
}
