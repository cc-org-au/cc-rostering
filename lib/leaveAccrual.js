'use client';

import { supabase } from './supabase';
import {
  getOrCreateLeaveBalance,
  processAnnualAccrual,
  adjustLeaveBalance,
} from './useLeave';

const uid = () => Math.random().toString(36).slice(2, 8);

// ── Accrual Configuration ────────────────────────────────────────────────────

/**
 * Default accrual rules by employment type
 */
const ACCRUAL_RULES = {
  'Full-time': {
    'leave-annual': 20,
    'leave-sick': 10,
    'leave-parental': 0,
  },
  'Part-time': {
    'leave-annual': 10,
    'leave-sick': 5,
    'leave-parental': 0,
  },
  Casual: {
    'leave-annual': 0,
    'leave-sick': 0,
    'leave-parental': 0,
  },
  Contractor: {
    'leave-annual': 0,
    'leave-sick': 0,
    'leave-parental': 0,
  },
};

/**
 * Rollover rules: defines which leave types can roll over to next year
 */
const ROLLOVER_RULES = {
  'leave-annual': {
    allowRollover: true,
    maxRollover: 5, // max days that can roll over
    expiryYears: 2, // rolled-over days expire after 2 years
  },
  'leave-sick': {
    allowRollover: true,
    maxRollover: 10,
    expiryYears: 3,
  },
  'leave-parental': {
    allowRollover: false,
    maxRollover: 0,
    expiryYears: 1,
  },
  'leave-unpaid': {
    allowRollover: false,
    maxRollover: 0,
    expiryYears: 1,
  },
};

// ── Annual Accrual Processing ────────────────────────────────────────────────

/**
 * Process annual leave accrual for all employees
 * Run this on January 1st or manually trigger
 */
export async function processAllEmployeeAccruals(year) {
  try {
    // Fetch all employees
    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('id, type');

    if (empError) throw empError;

    const results = {
      success: [],
      failed: [],
      skipped: [],
    };

    for (const employee of employees) {
      try {
        await processEmployeeAccrual(employee.id, employee.type, year);
        results.success.push(employee.id);
      } catch (error) {
        results.failed.push({ employeeId: employee.id, error: error.message });
      }
    }

    return results;
  } catch (error) {
    console.error('Error processing accruals:', error);
    throw error;
  }
}

/**
 * Process accrual for a single employee
 */
export async function processEmployeeAccrual(employeeId, employeeType, year) {
  const rules = ACCRUAL_RULES[employeeType] || {};

  // Fetch previous year balance for rollover
  const { data: previousBalances, error: prevError } = await supabase
    .from('leave_balances')
    .select('leave_type_id, balance, used')
    .eq('employee_id', employeeId)
    .eq('year', year - 1);

  if (prevError && prevError.code !== 'PGRST116') throw prevError;

  const previousByType = {};
  (previousBalances || []).forEach((b) => {
    previousByType[b.leave_type_id] = {
      balance: b.balance,
      used: b.used,
    };
  });

  // Process each leave type
  for (const [leaveTypeId, accrualDays] of Object.entries(rules)) {
    const balance = await getOrCreateLeaveBalance(employeeId, leaveTypeId, year);
    const previousBalance = previousByType[leaveTypeId];
    let newBalance = accrualDays;

    // Handle rollover from previous year
    if (previousBalance) {
      const unused = previousBalance.balance - previousBalance.used;
      const rolloverRule = ROLLOVER_RULES[leaveTypeId];

      if (rolloverRule.allowRollover && unused > 0) {
        const rolloverAmount = Math.min(unused, rolloverRule.maxRollover);
        newBalance += rolloverAmount;

        // Log rollover
        await supabase.from('leave_accrual_log').insert([
          {
            id: uid(),
            employee_id: employeeId,
            leave_type_id: leaveTypeId,
            year,
            days_accrued: rolloverAmount,
            accrual_type: 'annual',
            processed_at: new Date().toISOString(),
            processed_by_id: 'system',
          },
        ]);
      }
    }

    // Update balance
    await supabase
      .from('leave_balances')
      .update({
        balance: newBalance,
        used: 0,
        accrued_on: `${year}-01-01`,
        last_updated: new Date().toISOString(),
      })
      .eq('id', balance.id);

    // Log accrual
    await supabase.from('leave_accrual_log').insert([
      {
        id: uid(),
        employee_id: employeeId,
        leave_type_id: leaveTypeId,
        year,
        days_accrued: accrualDays,
        accrual_type: 'annual',
        processed_at: new Date().toISOString(),
        processed_by_id: 'system',
      },
    ]);
  }
}

// ── Expiry Processing ────────────────────────────────────────────────────────

/**
 * Process leave expiry (e.g., unused leave that doesn't roll over)
 * Run annually or on-demand
 */
export async function processLeaveExpiry(year) {
  try {
    const results = {
      expired: [],
      rolledOver: [],
    };

    // Get all leave balances from year-2 (expired after 2 years for annual leave)
    const { data: oldBalances, error } = await supabase
      .from('leave_balances')
      .select('*')
      .eq('year', year - 2);

    if (error && error.code !== 'PGRST116') throw error;

    (oldBalances || []).forEach(async (balance) => {
      const rule = ROLLOVER_RULES[balance.leave_type_id];
      if (rule && !rule.allowRollover) {
        // Log expiry
        const unused = Math.max(0, balance.balance - balance.used);
        if (unused > 0) {
          await supabase.from('leave_accrual_log').insert([
            {
              id: uid(),
              employee_id: balance.employee_id,
              leave_type_id: balance.leave_type_id,
              year: year - 2,
              days_accrued: -unused,
              accrual_type: 'expiry',
              processed_at: new Date().toISOString(),
              processed_by_id: 'system',
            },
          ]);

          results.expired.push({
            employeeId: balance.employee_id,
            leaveTypeId: balance.leave_type_id,
            daysExpired: unused,
          });
        }
      }
    });

    return results;
  } catch (error) {
    console.error('Error processing expiry:', error);
    throw error;
  }
}

// ── Manual Adjustments ───────────────────────────────────────────────────────

/**
 * Grant additional leave days (e.g., special circumstance, compensation)
 */
export async function grantLeave(
  employeeId,
  leaveTypeId,
  year,
  daysToGrant,
  reason = ''
) {
  if (daysToGrant <= 0) {
    throw new Error('Days to grant must be positive');
  }

  const newBalance = await adjustLeaveBalance(employeeId, leaveTypeId, year, daysToGrant, reason);

  return {
    employeeId,
    leaveTypeId,
    year,
    daysGranted: daysToGrant,
    newBalance,
    reason,
  };
}

/**
 * Deduct leave days (e.g., correction, mistake rectification)
 */
export async function deductLeave(
  employeeId,
  leaveTypeId,
  year,
  daysToDeduct,
  reason = ''
) {
  if (daysToDeduct <= 0) {
    throw new Error('Days to deduct must be positive');
  }

  const newBalance = await adjustLeaveBalance(
    employeeId,
    leaveTypeId,
    year,
    -daysToDeduct,
    reason
  );

  return {
    employeeId,
    leaveTypeId,
    year,
    daysDeducted: daysToDeduct,
    newBalance,
    reason,
  };
}

// ── Reporting & Analytics ───────────────────────────────────────────────────

/**
 * Get leave balance report for all employees in a year
 */
export async function getLeaveBalanceReport(year, leaveTypeId = null) {
  let query = supabase
    .from('leave_balances')
    .select(
      `
      employee_id,
      leave_type_id,
      balance,
      used,
      year,
      employees (
        id,
        name,
        type,
        email
      ),
      leave_types (
        id,
        name,
        paid
      )
    `
    )
    .eq('year', year);

  if (leaveTypeId) {
    query = query.eq('leave_type_id', leaveTypeId);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data || [])
    .map((b) => ({
      employeeId: b.employee_id,
      employeeName: b.employees?.name,
      employeeType: b.employees?.type,
      employeeEmail: b.employees?.email,
      leaveType: b.leave_types?.name,
      leaveTypeId: b.leave_type_id,
      balance: b.balance,
      used: b.used,
      available: Math.max(0, b.balance - b.used),
      percentageUsed: b.balance > 0 ? Math.round((b.used / b.balance) * 100) : 0,
    }))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}

/**
 * Get accrual audit trail for an employee
 */
export async function getEmployeeAccrualHistory(employeeId, year = null) {
  let query = supabase
    .from('leave_accrual_log')
    .select(
      `
      *,
      leave_types (
        name,
        color
      )
    `
    )
    .eq('employee_id', employeeId)
    .order('processed_at', { ascending: true });

  if (year) {
    query = query.eq('year', year);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data || []).map((log) => ({
    id: log.id,
    leaveType: log.leave_types?.name,
    leaveTypeColor: log.leave_types?.color,
    year: log.year,
    daysAccrued: log.days_accrued,
    type: log.accrual_type,
    processedAt: log.processed_at,
  }));
}

/**
 * Get leave metrics for dashboard
 */
export async function getLeaveMetrics(year) {
  try {
    const report = await getLeaveBalanceReport(year);

    const metrics = {
      totalEmployees: new Set(report.map((r) => r.employeeId)).size,
      totalBalanced: report.reduce((sum, r) => sum + r.balance, 0),
      totalUsed: report.reduce((sum, r) => sum + r.used, 0),
      totalAvailable: report.reduce((sum, r) => sum + r.available, 0),
      averageUsage:
        report.length > 0
          ? Math.round((report.reduce((sum, r) => sum + r.percentageUsed, 0) / report.length))
          : 0,
      byType: {},
    };

    // Group by leave type
    report.forEach((r) => {
      if (!metrics.byType[r.leaveType]) {
        metrics.byType[r.leaveType] = {
          balance: 0,
          used: 0,
          available: 0,
          employees: 0,
        };
      }
      metrics.byType[r.leaveType].balance += r.balance;
      metrics.byType[r.leaveType].used += r.used;
      metrics.byType[r.leaveType].available += r.available;
      metrics.byType[r.leaveType].employees += 1;
    });

    return metrics;
  } catch (error) {
    console.error('Error getting leave metrics:', error);
    throw error;
  }
}
