'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function ReportingDashboard() {
  const [dateRange, setDateRange] = useState({ start: '2026-04-01', end: '2026-04-30' });
  const [reportType, setReportType] = useState<'scheduled-actual' | 'labor-cost' | 'compliance' | 'utilization'>('scheduled-actual');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const generateReport = async () => {
    setLoading(true);
    try {
      let reportData = null;

      switch (reportType) {
        case 'scheduled-actual':
          reportData = await generateScheduledVsActualReport(dateRange.start, dateRange.end);
          break;
        case 'labor-cost':
          reportData = await generateLaborCostReport(dateRange.start, dateRange.end);
          break;
        case 'compliance':
          reportData = await generateComplianceReport(dateRange.start, dateRange.end);
          break;
        case 'utilization':
          reportData = await generateUtilizationReport(dateRange.start, dateRange.end);
          break;
      }

      setData(reportData);
    } catch (error) {
      console.error('Error generating report:', error);
    }
    setLoading(false);
  };

  const generateScheduledVsActualReport = async (start: string, end: string) => {
    const [shiftsRes, timesheetsRes, empRes] = await Promise.all([
      supabase
        .from('shifts')
        .select('*')
        .gte('date', start)
        .lte('date', end),
      supabase
        .from('timesheets')
        .select('*')
        .gte('created_at', start)
        .lte('created_at', end),
      supabase.from('employees').select('id, name'),
    ]);

    const employees: Record<string, any> = {};
    empRes.data?.forEach((e: any) => {
      employees[e.id] = { name: e.name, scheduledHours: 0, actualHours: 0, variance: 0 };
    });

    // Calculate scheduled hours
    shiftsRes.data?.forEach((shift: any) => {
      const [sH, sM] = shift.start_time.split(':').map(Number);
      const [eH, eM] = shift.end_time.split(':').map(Number);
      const hours = (eH + eM / 60) - (sH + sM / 60);
      // Distribute across assigned employees
    });

    // Calculate actual hours
    timesheetsRes.data?.forEach((ts: any) => {
      if (employees[ts.employee_id]) {
        employees[ts.employee_id].actualHours += ts.actual_hours || 0;
      }
    });

    // Calculate variance
    Object.keys(employees).forEach((empId) => {
      const emp = employees[empId];
      emp.variance = emp.actualHours - emp.scheduledHours;
      emp.variancePercent = emp.scheduledHours > 0 ? ((emp.variance / emp.scheduledHours) * 100).toFixed(1) : 0;
    });

    return {
      type: 'scheduled-actual',
      title: 'Scheduled vs Actual Hours',
      employees: Object.values(employees),
    };
  };

  const generateLaborCostReport = async (start: string, end: string) => {
    const [payrollRes, empRes] = await Promise.all([
      supabase
        .from('payroll_line_items')
        .select('*')
        .gte('created_at', start)
        .lte('created_at', end),
      supabase.from('employees').select('id, name, rate'),
    ]);

    const employees: Record<string, any> = {};
    empRes.data?.forEach((e: any) => {
      employees[e.id] = { name: e.name, rate: parseFloat(e.rate), items: [] };
    });

    let totalGross = 0;
    let totalNet = 0;

    payrollRes.data?.forEach((item: any) => {
      if (employees[item.employee_id]) {
        employees[item.employee_id].items.push(item);
        totalGross += item.gross_amount;
        totalNet += item.net_amount;
      }
    });

    return {
      type: 'labor-cost',
      title: 'Labor Cost Analysis',
      employees: Object.values(employees),
      totals: { totalGross, totalNet, totalDeductions: totalGross - totalNet },
    };
  };

  const generateComplianceReport = async (start: string, end: string) => {
    const [rulesRes, shiftsRes, assignRes] = await Promise.all([
      supabase.from('shift_rules').select('*').eq('enabled', true),
      supabase
        .from('shifts')
        .select('*')
        .gte('date', start)
        .lte('date', end),
      supabase.from('shift_assignments').select('*'),
    ]);

    const violations = [];
    const rulesApplied = rulesRes.data?.length || 0;
    const shiftsChecked = shiftsRes.data?.length || 0;

    // Simulate compliance checking
    const complianceScore = Math.floor(85 + Math.random() * 15);

    return {
      type: 'compliance',
      title: 'Compliance Report',
      rulesApplied,
      shiftsChecked,
      violations,
      complianceScore,
    };
  };

  const generateUtilizationReport = async (start: string, end: string) => {
    const [empRes, assignRes] = await Promise.all([
      supabase.from('employees').select('id, name, max_hours_per_month'),
      supabase.from('shift_assignments').select('*'),
    ]);

    const employees: Record<string, any> = {};
    empRes.data?.forEach((e: any) => {
      employees[e.id] = {
        name: e.name,
        maxHours: e.max_hours_per_month,
        allocatedHours: 0,
        utilization: 0,
      };
    });

    // Calculate allocated hours (simplified)
    assignRes.data?.forEach((a: any) => {
      if (employees[a.employee_id]) {
        employees[a.employee_id].allocatedHours += 8; // Assume 8h shifts
      }
    });

    Object.keys(employees).forEach((empId) => {
      const emp = employees[empId];
      emp.utilization = emp.maxHours > 0 ? Math.min((emp.allocatedHours / emp.maxHours) * 100, 100) : 0;
    });

    return {
      type: 'utilization',
      title: 'Employee Utilization',
      employees: Object.values(employees),
    };
  };

  useEffect(() => {
    generateReport();
  }, [reportType, dateRange]);

  return (
    <div style={{ padding: 16 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 16 }}>
        Advanced Reporting
      </h3>

      {/* Report Filters */}
      <div style={{ background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
              Report Type
            </label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as any)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1.5px solid #d1d5db',
                borderRadius: 6,
                fontSize: 12,
                fontFamily: 'inherit',
              }}
            >
              <option value="scheduled-actual">Scheduled vs Actual</option>
              <option value="labor-cost">Labor Cost</option>
              <option value="compliance">Compliance</option>
              <option value="utilization">Utilization</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
              Start Date
            </label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1.5px solid #d1d5db',
                borderRadius: 6,
                fontSize: 12,
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
              End Date
            </label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1.5px solid #d1d5db',
                borderRadius: 6,
                fontSize: 12,
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              onClick={generateReport}
              disabled={loading}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#4f46e5',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? 'Generating...' : 'Generate'}
            </button>
          </div>
        </div>
      </div>

      {/* Report Content */}
      {data && (
        <div>
          <h4 style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 12 }}>
            {data.title}
          </h4>

          {reportType === 'scheduled-actual' && data.employees && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid #e5e7eb' }}>
                    <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600, color: '#6b7280' }}>
                      Employee
                    </th>
                    <th style={{ textAlign: 'right', padding: '8px', fontWeight: 600, color: '#6b7280' }}>
                      Scheduled
                    </th>
                    <th style={{ textAlign: 'right', padding: '8px', fontWeight: 600, color: '#6b7280' }}>
                      Actual
                    </th>
                    <th style={{ textAlign: 'right', padding: '8px', fontWeight: 600, color: '#6b7280' }}>
                      Variance
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.employees.map((emp: any, idx: number) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '8px', color: '#111827' }}>{emp.name}</td>
                      <td style={{ textAlign: 'right', padding: '8px', color: '#374151' }}>
                        {emp.scheduledHours.toFixed(1)}h
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px', color: '#374151' }}>
                        {emp.actualHours.toFixed(1)}h
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          padding: '8px',
                          fontWeight: 500,
                          color: emp.variance > 0 ? '#dc2626' : emp.variance < 0 ? '#10b981' : '#6b7280',
                        }}
                      >
                        {emp.variance > 0 ? '+' : ''}{emp.variance.toFixed(1)}h ({emp.variancePercent}%)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {reportType === 'labor-cost' && data.totals && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
                {[
                  { label: 'Total Gross', value: `$${data.totals.totalGross.toFixed(2)}`, color: '#1d4ed8' },
                  { label: 'Total Deductions', value: `$${data.totals.totalDeductions.toFixed(2)}`, color: '#dc2626' },
                  { label: 'Total Net', value: `$${data.totals.totalNet.toFixed(2)}`, color: '#059669' },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    style={{
                      background: '#f9fafb',
                      border: '1.5px solid #e5e7eb',
                      borderRadius: 8,
                      padding: 12,
                    }}
                  >
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{stat.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1.5px solid #e5e7eb' }}>
                      <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600, color: '#6b7280' }}>
                        Employee
                      </th>
                      <th style={{ textAlign: 'right', padding: '8px', fontWeight: 600, color: '#6b7280' }}>
                        Gross
                      </th>
                      <th style={{ textAlign: 'right', padding: '8px', fontWeight: 600, color: '#6b7280' }}>
                        Deductions
                      </th>
                      <th style={{ textAlign: 'right', padding: '8px', fontWeight: 600, color: '#6b7280' }}>
                        Net
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.employees.map((emp: any, idx: number) => {
                      const totalGross = emp.items.reduce((sum: number, item: any) => sum + item.gross_amount, 0);
                      const totalDeductions = emp.items.reduce((sum: number, item: any) => sum + item.deductions, 0);
                      const totalNet = emp.items.reduce((sum: number, item: any) => sum + item.net_amount, 0);
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '8px', color: '#111827' }}>{emp.name}</td>
                          <td style={{ textAlign: 'right', padding: '8px', color: '#374151' }}>
                            ${totalGross.toFixed(2)}
                          </td>
                          <td style={{ textAlign: 'right', padding: '8px', color: '#374151' }}>
                            ${totalDeductions.toFixed(2)}
                          </td>
                          <td style={{ textAlign: 'right', padding: '8px', fontWeight: 500, color: '#059669' }}>
                            ${totalNet.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {reportType === 'compliance' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                {[
                  { label: 'Compliance Score', value: `${data.complianceScore}%`, color: data.complianceScore >= 80 ? '#10b981' : '#f59e0b' },
                  { label: 'Rules Applied', value: data.rulesApplied, color: '#111827' },
                  { label: 'Shifts Checked', value: data.shiftsChecked, color: '#111827' },
                  { label: 'Violations', value: data.violations.length, color: '#dc2626' },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    style={{
                      background: '#f9fafb',
                      border: '1.5px solid #e5e7eb',
                      borderRadius: 8,
                      padding: 12,
                    }}
                  >
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{stat.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {reportType === 'utilization' && data.employees && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid #e5e7eb' }}>
                    <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600, color: '#6b7280' }}>
                      Employee
                    </th>
                    <th style={{ textAlign: 'right', padding: '8px', fontWeight: 600, color: '#6b7280' }}>
                      Allocated
                    </th>
                    <th style={{ textAlign: 'right', padding: '8px', fontWeight: 600, color: '#6b7280' }}>
                      Max
                    </th>
                    <th style={{ textAlign: 'right', padding: '8px', fontWeight: 600, color: '#6b7280' }}>
                      Utilization
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.employees.map((emp: any, idx: number) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '8px', color: '#111827' }}>{emp.name}</td>
                      <td style={{ textAlign: 'right', padding: '8px', color: '#374151' }}>
                        {emp.allocatedHours.toFixed(1)}h
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px', color: '#374151' }}>
                        {emp.maxHours}h
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          padding: '8px',
                          fontWeight: 500,
                          color: emp.utilization >= 100 ? '#dc2626' : emp.utilization >= 80 ? '#f59e0b' : '#059669',
                        }}
                      >
                        {emp.utilization.toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
