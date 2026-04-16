import { supabase } from '@/lib/supabase';

export interface PayrollRun {
  id: string;
  period_start: string;
  period_end: string;
  status: 'draft' | 'submitted' | 'processed';
  total_cost: number;
  created_at: string;
}

export interface PayrollLineItem {
  id: string;
  payroll_run_id: string;
  employee_id: string;
  shift_hours: number;
  overtime_hours: number;
  rate: number;
  gross_amount: number;
  deductions: number;
  net_amount: number;
  created_at: string;
}

export interface Timesheet {
  id: string;
  employee_id: string;
  actual_hours: number;
  status: string;
  created_at: string;
}

interface Employee {
  id: string;
  rate: number;
}

const OVERTIME_THRESHOLD = 40; // Hours per week
const OVERTIME_MULTIPLIER = 1.5;

export async function createPayrollRun(
  periodStart: string,
  periodEnd: string
): Promise<{ success: boolean; payrollRunId?: string; error?: string }> {
  try {
    // Get all approved timesheets in period
    const { data: timesheets, error: timesheetError } = await supabase
      .from('timesheets')
      .select('*')
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd)
      .eq('status', 'approved');

    if (timesheetError) throw timesheetError;
    if (!timesheets || timesheets.length === 0) {
      return { success: false, error: 'No approved timesheets found for period' };
    }

    // Get unique employees and their rates
    const empIds = [...new Set(timesheets.map((t: Timesheet) => t.employee_id))];
    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('id, rate')
      .in('id', empIds);

    if (empError) throw empError;

    const empRateMap: Record<string, number> = {};
    employees?.forEach((e: Employee) => {
      empRateMap[String(e.id)] = parseFloat(String(e.rate)) || 0;
    });

    // Create payroll run
    const payrollRunId = `pr-${Date.now()}`;
    const { error: createError } = await supabase.from('payroll_runs').insert([
      {
        id: payrollRunId,
        period_start: periodStart,
        period_end: periodEnd,
        status: 'draft',
        total_cost: 0,
      },
    ]);

    if (createError) throw createError;

    // Generate line items
    const lineItems: PayrollLineItem[] = [];
    let totalCost = 0;

    timesheets.forEach((ts: Timesheet) => {
      const rate = empRateMap[ts.employee_id] || 0;
      const regularHours = Math.min(ts.actual_hours, OVERTIME_THRESHOLD);
      const overtimeHours = Math.max(0, ts.actual_hours - OVERTIME_THRESHOLD);

      const regularPay = regularHours * rate;
      const overtimePay = overtimeHours * rate * OVERTIME_MULTIPLIER;
      const grossAmount = regularPay + overtimePay;
      const deductions = grossAmount * 0.15; // 15% deduction rate (customize as needed)
      const netAmount = grossAmount - deductions;

      lineItems.push({
        id: `pli-${Date.now()}-${ts.employee_id}`,
        payroll_run_id: payrollRunId,
        employee_id: ts.employee_id,
        shift_hours: regularHours,
        overtime_hours: overtimeHours,
        rate,
        gross_amount: grossAmount,
        deductions,
        net_amount: netAmount,
        created_at: new Date().toISOString(),
      });

      totalCost += netAmount;
    });

    // Insert line items
    const { error: lineError } = await supabase
      .from('payroll_line_items')
      .insert(lineItems);

    if (lineError) throw lineError;

    // Update payroll run total
    await supabase
      .from('payroll_runs')
      .update({ total_cost: totalCost })
      .eq('id', payrollRunId);

    return { success: true, payrollRunId };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function exportPayrollCSV(payrollRunId: string): Promise<string> {
  const { data: lineItems, error } = await supabase
    .from('payroll_line_items')
    .select('*')
    .eq('payroll_run_id', payrollRunId);

  if (error || !lineItems) {
    throw error;
  }

  // Build CSV
  let csv =
    'Employee ID,Shift Hours,Overtime Hours,Rate,Gross Amount,Deductions,Net Amount\n';

  lineItems.forEach((item: PayrollLineItem) => {
    csv += `${item.employee_id},${item.shift_hours},${item.overtime_hours},${item.rate},${item.gross_amount.toFixed(2)},${item.deductions.toFixed(2)},${item.net_amount.toFixed(2)}\n`;
  });

  return csv;
}

export async function submitPayrollRun(payrollRunId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('payroll_runs')
      .update({ status: 'submitted' })
      .eq('id', payrollRunId);

    if (error) throw error;

    // Trigger webhook or external payroll system integration here
    // Example: POST to accounting software API

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function getPayrollRun(payrollRunId: string): Promise<{
  run: PayrollRun | null;
  lineItems: PayrollLineItem[];
}> {
  const [runRes, itemsRes] = await Promise.all([
    supabase.from('payroll_runs').select('*').eq('id', payrollRunId).single(),
    supabase.from('payroll_line_items').select('*').eq('payroll_run_id', payrollRunId),
  ]);

  return {
    run: (runRes.data as PayrollRun) || null,
    lineItems: (itemsRes.data as PayrollLineItem[]) || [],
  };
}
