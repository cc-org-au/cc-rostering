'use client';

import { supabase } from './supabase';

const uid = () => Math.random().toString(36).slice(2, 8);
const HPD = 8;

// ── Utility Functions ────────────────────────────────────────────────────────

/**
 * Calculate business days between two dates (excluding weekends by default)
 */
export function calculateLeaveDays(startDate, endDate, excludeWeekends = true) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let days = 0;

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (!excludeWeekends || (dow !== 0 && dow !== 6)) {
      days += 1;
    }
  }

  return days;
}

/**
 * Check if there are roster conflicts (employee already assigned on leave dates)
 */
export async function checkRosterConflicts(employeeId, startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const year = start.getFullYear();
  const startMonth = start.getMonth();
  const endMonth = end.getMonth();

  const conflicts = [];

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const { data } = await supabase
      .from('assignments')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('year', d.getFullYear())
      .eq('month', d.getMonth())
      .eq('day', d.getDate());

    if (data && data.length > 0) {
      conflicts.push({
        date: new Date(d),
        assignments: data,
      });
    }
  }

  return conflicts;
}

/**
 * Remove roster assignments for given dates
 */
export async function removeRosterAssignments(employeeId, startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const removed = [];

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const { data: assignments } = await supabase
      .from('assignments')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('year', d.getFullYear())
      .eq('month', d.getMonth())
      .eq('day', d.getDate());

    if (assignments && assignments.length > 0) {
      for (const assignment of assignments) {
        await supabase
          .from('assignments')
          .delete()
          .eq('year', assignment.year)
          .eq('month', assignment.month)
          .eq('day', assignment.day)
          .eq('employee_id', assignment.employee_id);

        removed.push(assignment);
      }
    }
  }

  return removed;
}

// ── Leave Balance Functions ──────────────────────────────────────────────────

/**
 * Get leave balances for a specific employee and year
 */
export async function getMyLeaveBalances(employeeId, year = new Date().getFullYear()) {
  const { data, error } = await supabase
    .from('leave_balances')
    .select(
      `
      id,
      balance,
      used,
      year,
      accrued_on,
      leave_types (
        id,
        name,
        color,
        paid,
        days_per_year,
        requires_approval
      )
    `
    )
    .eq('employee_id', employeeId)
    .eq('year', year);

  if (error) throw error;

  return (data || []).map((b) => ({
    id: b.id,
    leaveType: b.leave_types,
    balance: b.balance,
    used: b.used,
    available: Math.max(0, b.balance - b.used),
    year: b.year,
    accruedOn: b.accrued_on,
  }));
}

/**
 * Get or create leave balance for an employee
 */
export async function getOrCreateLeaveBalance(employeeId, leaveTypeId, year) {
  let { data, error } = await supabase
    .from('leave_balances')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('leave_type_id', leaveTypeId)
    .eq('year', year)
    .single();

  if (error && error.code === 'PGRST116') {
    // No row found, create one
    const newBalance = {
      id: uid(),
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      year,
      balance: 0,
      used: 0,
      accrued_on: new Date().toISOString().split('T')[0],
    };

    const { data: created, error: insertError } = await supabase
      .from('leave_balances')
      .insert([newBalance])
      .select()
      .single();

    if (insertError) throw insertError;
    return created;
  }

  if (error) throw error;
  return data;
}

/**
 * Get leave balance for specific employee, type, and year
 */
export async function getLeaveBalance(employeeId, leaveTypeId, year) {
  const balance = await getOrCreateLeaveBalance(employeeId, leaveTypeId, year);
  return {
    balance: balance.balance,
    used: balance.used,
    available: Math.max(0, balance.balance - balance.used),
  };
}

/**
 * Update leave balance (used internally)
 */
async function updateLeaveBalance(balanceId, used) {
  const { data, error } = await supabase
    .from('leave_balances')
    .update({ used, last_updated: new Date().toISOString() })
    .eq('id', balanceId)
    .select();

  if (error) throw error;
  return data[0];
}

// ── Leave Request Functions ──────────────────────────────────────────────────

/**
 * Request leave
 */
export async function requestLeave(
  employeeId,
  leaveTypeId,
  startDate,
  endDate,
  reason = '',
  notes = '',
  requestedById = null
) {
  const daysRequested = calculateLeaveDays(startDate, endDate);
  const year = new Date(startDate).getFullYear();

  // Check balance
  const leaveType = await supabase
    .from('leave_types')
    .select('*')
    .eq('id', leaveTypeId)
    .single();

  if (leaveType.error) throw leaveType.error;

  if (leaveType.data.days_per_year > 0 || leaveType.data.paid) {
    const balance = await getLeaveBalance(employeeId, leaveTypeId, year);
    if (balance.available < daysRequested) {
      throw new Error(`Insufficient balance. Available: ${balance.available}, Requested: ${daysRequested}`);
    }
  }

  const request = {
    id: uid(),
    employee_id: employeeId,
    leave_type_id: leaveTypeId,
    start_date: startDate,
    end_date: endDate,
    days_requested: daysRequested,
    status: leaveType.data.requires_approval ? 'pending' : 'approved',
    requested_by_id: requestedById || employeeId,
    notes,
  };

  if (reason) request.notes = `${reason}${notes ? '\n' + notes : ''}`;

  const { data, error } = await supabase.from('leave_requests').insert([request]).select().single();

  if (error) throw error;

  // Log to audit
  await logLeaveAction(data.id, 'requested', employeeId, reason);

  return data;
}

/**
 * Approve leave request
 */
export async function approveLeave(requestId, approvedById, removeConflicts = false) {
  const { data: request, error: fetchError } = await supabase
    .from('leave_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (fetchError) throw fetchError;

  // Check for roster conflicts
  const conflicts = await checkRosterConflicts(
    request.employee_id,
    request.start_date,
    request.end_date
  );

  if (conflicts.length > 0 && !removeConflicts) {
    throw new Error(`Roster conflicts detected: ${conflicts.length} assignments will be affected`);
  }

  // Remove conflicting assignments if requested
  if (removeConflicts && conflicts.length > 0) {
    await removeRosterAssignments(request.employee_id, request.start_date, request.end_date);
  }

  // Update leave balance
  const balance = await getOrCreateLeaveBalance(
    request.employee_id,
    request.leave_type_id,
    new Date(request.start_date).getFullYear()
  );

  await updateLeaveBalance(balance.id, (balance.used || 0) + request.days_requested);

  // Update request status
  const { data: updated, error: updateError } = await supabase
    .from('leave_requests')
    .update({
      status: 'approved',
      approved_by_id: approvedById,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .select()
    .single();

  if (updateError) throw updateError;

  // Log to audit
  await logLeaveAction(requestId, 'approved', approvedById);

  return updated;
}

/**
 * Reject leave request
 */
export async function rejectLeave(requestId, rejectedById, reason = '') {
  const { data: updated, error } = await supabase
    .from('leave_requests')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      approved_by_id: rejectedById,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .select()
    .single();

  if (error) throw error;

  // Log to audit
  await logLeaveAction(requestId, 'rejected', rejectedById, reason);

  return updated;
}

/**
 * Cancel leave request
 */
export async function cancelLeave(requestId, cancelledById, reason = '') {
  const { data: request, error: fetchError } = await supabase
    .from('leave_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (fetchError) throw fetchError;

  if (request.status === 'approved') {
    const balance = await getOrCreateLeaveBalance(
      request.employee_id,
      request.leave_type_id,
      new Date(request.start_date).getFullYear()
    );
    await updateLeaveBalance(balance.id, Math.max(0, (balance.used || 0) - request.days_requested));
  }

  const { data: updated, error } = await supabase
    .from('leave_requests')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .select()
    .single();

  if (error) throw error;

  await logLeaveAction(requestId, 'cancelled', cancelledById, reason);

  return updated;
}

/**
 * Get pending leave requests (for managers/admins)
 */
export async function getPendingRequests(filters = {}) {
  let query = supabase
    .from('leave_requests')
    .select(
      `
      id,
      start_date,
      end_date,
      days_requested,
      status,
      notes,
      created_at,
      employees (
        id,
        name,
        email,
        role
      ),
      leave_types (
        id,
        name,
        color,
        paid
      )
    `
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (filters.employeeId) {
    query = query.eq('employee_id', filters.employeeId);
  }

  if (filters.leaveTypeId) {
    query = query.eq('leave_type_id', filters.leaveTypeId);
  }

  if (filters.startDate) {
    query = query.gte('start_date', filters.startDate);
  }

  if (filters.endDate) {
    query = query.lte('end_date', filters.endDate);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data || []).map((r) => ({
    id: r.id,
    employee: r.employees,
    leaveType: r.leave_types,
    startDate: r.start_date,
    endDate: r.end_date,
    daysRequested: r.days_requested,
    status: r.status,
    notes: r.notes,
    createdAt: r.created_at,
  }));
}

/**
 * Get employee's leave requests
 */
export async function getEmployeeLeaveRequests(employeeId, year = new Date().getFullYear()) {
  const { data, error } = await supabase
    .from('leave_requests')
    .select(
      `
      id,
      start_date,
      end_date,
      days_requested,
      status,
      notes,
      rejection_reason,
      created_at,
      updated_at,
      leave_types (
        id,
        name,
        color,
        paid
      )
    `
    )
    .eq('employee_id', employeeId)
    .gte('start_date', `${year}-01-01`)
    .lte('end_date', `${year}-12-31`)
    .order('start_date', { ascending: true });

  if (error) throw error;

  return (data || []).map((r) => ({
    id: r.id,
    leaveType: r.leave_types,
    startDate: r.start_date,
    endDate: r.end_date,
    daysRequested: r.days_requested,
    status: r.status,
    notes: r.notes,
    rejectionReason: r.rejection_reason,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

// ── Leave Calendar Functions ─────────────────────────────────────────────────

/**
 * Get aggregated leave calendar for team view
 */
export async function getLeaveCalendar(year, month = null) {
  let query = supabase
    .from('leave_requests')
    .select(
      `
      id,
      employee_id,
      start_date,
      end_date,
      status,
      employees (
        id,
        name,
        color
      ),
      leave_types (
        id,
        name,
        color
      )
    `
    )
    .eq('status', 'approved');

  // Filter by year
  query = query
    .gte('start_date', `${year}-01-01`)
    .lte('end_date', `${year}-12-31`);

  // Filter by month if provided
  if (month !== null) {
    const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const monthEnd = new Date(year, month + 1, 0).toISOString().split('T')[0];
    query = query.gte('start_date', monthStart).lte('end_date', monthEnd);
  }

  const { data, error } = await query;

  if (error) throw error;

  // Flatten into day-by-day calendar
  const calendar = {};

  (data || []).forEach((request) => {
    const start = new Date(request.start_date);
    const end = new Date(request.end_date);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateKey = d.toISOString().split('T')[0];
      if (!calendar[dateKey]) calendar[dateKey] = [];
      calendar[dateKey].push({
        employeeId: request.employee_id,
        employeeName: request.employees?.name,
        leaveType: request.leave_types?.name,
        leaveColor: request.leave_types?.color,
      });
    }
  });

  return calendar;
}

// ── Leave Types Functions ────────────────────────────────────────────────────

/**
 * Get all leave types
 */
export async function getLeaveTypes() {
  const { data, error } = await supabase
    .from('leave_types')
    .select('*')
    .eq('enabled', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Create custom leave type
 */
export async function createLeaveType(name, color, paid, daysPerYear, requiresApproval) {
  const { data, error } = await supabase
    .from('leave_types')
    .insert([
      {
        id: uid(),
        name,
        color,
        paid,
        days_per_year: daysPerYear,
        requires_approval: requiresApproval,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── Accrual Functions ────────────────────────────────────────────────────────

/**
 * Process annual accrual for all employees
 */
export async function processAnnualAccrual(year, leaveTypeId = 'leave-annual') {
  const { data: employees, error: empError } = await supabase
    .from('employees')
    .select('id, type');

  if (empError) throw empError;

  const accruals = [];

  for (const emp of employees) {
    const leaveType = await supabase
      .from('leave_types')
      .select('days_per_year')
      .eq('id', leaveTypeId)
      .single();

    if (leaveType.error) continue;

    const balance = await getOrCreateLeaveBalance(emp.id, leaveTypeId, year);
    const accrualDays = leaveType.data.days_per_year;

    await supabase
      .from('leave_balances')
      .update({
        balance: accrualDays,
        used: 0,
        accrued_on: `${year}-01-01`,
        last_updated: new Date().toISOString(),
      })
      .eq('id', balance.id);

    accruals.push({
      employeeId: emp.id,
      daysAccrued: accrualDays,
    });

    // Log accrual
    await supabase.from('leave_accrual_log').insert([
      {
        id: uid(),
        employee_id: emp.id,
        leave_type_id: leaveTypeId,
        year,
        days_accrued: accrualDays,
        accrual_type: 'annual',
        processed_at: new Date().toISOString(),
      },
    ]);
  }

  return accruals;
}

/**
 * Manually adjust leave balance
 */
export async function adjustLeaveBalance(employeeId, leaveTypeId, year, daysAdjustment, reason) {
  const balance = await getOrCreateLeaveBalance(employeeId, leaveTypeId, year);
  const newBalance = Math.max(0, balance.balance + daysAdjustment);

  await supabase
    .from('leave_balances')
    .update({
      balance: newBalance,
      last_updated: new Date().toISOString(),
    })
    .eq('id', balance.id);

  // Log adjustment
  await supabase.from('leave_accrual_log').insert([
    {
      id: uid(),
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      year,
      days_accrued: daysAdjustment,
      accrual_type: 'adjustment',
      processed_at: new Date().toISOString(),
    },
  ]);

  return newBalance;
}

// ── Audit Logging ────────────────────────────────────────────────────────────

/**
 * Log leave action to audit trail
 */
async function logLeaveAction(requestId, action, userId, reason = '') {
  await supabase.from('leave_audit_log').insert([
    {
      id: uid(),
      leave_request_id: requestId,
      action,
      user_id: userId,
      reason: reason || null,
      timestamp: new Date().toISOString(),
    },
  ]);
}

/**
 * Get audit log for a leave request
 */
export async function getLeaveAuditLog(requestId) {
  const { data, error } = await supabase
    .from('leave_audit_log')
    .select('*')
    .eq('leave_request_id', requestId)
    .order('timestamp', { ascending: true });

  if (error) throw error;
  return data || [];
}
