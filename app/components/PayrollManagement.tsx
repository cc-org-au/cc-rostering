'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { createPayrollRun, exportPayrollCSV, submitPayrollRun, getPayrollRun } from '@/lib/payroll/payrollProcessor';

interface PayrollRun {
  id: string;
  period_start: string;
  period_end: string;
  status: 'draft' | 'submitted' | 'processed';
  total_cost: number;
  created_at: string;
}

interface PayrollLineItem {
  id: string;
  employee_id: string;
  shift_hours: number;
  overtime_hours: number;
  rate: number;
  gross_amount: number;
  deductions: number;
  net_amount: number;
}

interface Employee {
  id: string;
  name: string;
}

export function PayrollManagement() {
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);
  const [lineItems, setLineItems] = useState<PayrollLineItem[]>([]);
  const [employees, setEmployees] = useState<Record<string, Employee>>({});
  const [loading, setLoading] = useState(true);
  const [periodStart, setPeriodStart] = useState(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    (async () => {
      const [runsRes, empRes] = await Promise.all([
        supabase.from('payroll_runs').select('*').order('created_at', { ascending: false }),
        supabase.from('employees').select('id, name'),
      ]);

      if (runsRes.data) setPayrollRuns(runsRes.data as PayrollRun[]);

      const empMap: Record<string, Employee> = {};
      if (empRes.data) {
        empRes.data.forEach((e: any) => {
          empMap[e.id] = { id: e.id, name: e.name };
        });
      }
      setEmployees(empMap);
      setLoading(false);
    })();
  }, []);

  const handleCreatePayroll = async () => {
    setLoading(true);
    const result = await createPayrollRun(periodStart, periodEnd);
    if (result.success && result.payrollRunId) {
      const { run, lineItems: items } = await getPayrollRun(result.payrollRunId);
      if (run) {
        setPayrollRuns((prev) => [run, ...prev]);
        setSelectedRun(run);
        setLineItems(items);
      }
    }
    setLoading(false);
  };

  const handleSelectRun = async (run: PayrollRun) => {
    setSelectedRun(run);
    const { lineItems: items } = await getPayrollRun(run.id);
    setLineItems(items);
  };

  const handleExportCSV = async () => {
    if (!selectedRun) return;
    const csv = await exportPayrollCSV(selectedRun.id);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payroll-${selectedRun.period_start}.csv`;
    link.click();
  };

  const handleSubmitPayroll = async () => {
    if (!selectedRun) return;
    const result = await submitPayrollRun(selectedRun.id);
    if (result.success) {
      setSelectedRun((prev) => (prev ? { ...prev, status: 'submitted' } : null));
      setPayrollRuns((prev) =>
        prev.map((r) => (r.id === selectedRun.id ? { ...r, status: 'submitted' } : r))
      );
    }
  };

  if (loading) return <div style={{ padding: 20, color: '#6b7280' }}>Loading payroll...</div>;

  return (
    <div style={{ padding: 16 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 16 }}>
        Payroll Management
      </h3>

      {/* Create Payroll Run */}
      <div style={{ background: '#f0f9ff', border: '1.5px solid #bfdbfe', borderRadius: 10, padding: 14, marginBottom: 16 }}>
        <h4 style={{ fontSize: 13, fontWeight: 600, color: '#1d4ed8', margin: '0 0 10px' }}>
          Create New Payroll Run
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#0369a1', display: 'block', marginBottom: 4 }}>
              Period Start
            </label>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px',
                border: '1.5px solid #bfdbfe',
                borderRadius: 6,
                fontSize: 12,
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#0369a1', display: 'block', marginBottom: 4 }}>
              Period End
            </label>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px',
                border: '1.5px solid #bfdbfe',
                borderRadius: 6,
                fontSize: 12,
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              onClick={handleCreatePayroll}
              style={{
                width: '100%',
                padding: '6px 12px',
                background: '#1d4ed8',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Create Payroll
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
        {/* Payroll Runs List */}
        <div>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
            Payroll Runs
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {payrollRuns.map((run) => (
              <button
                key={run.id}
                onClick={() => handleSelectRun(run)}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  background: selectedRun?.id === run.id ? '#eff6ff' : '#f9fafb',
                  border: `1.5px solid ${selectedRun?.id === run.id ? '#93c5fd' : '#e5e7eb'}`,
                  borderRadius: 8,
                  fontSize: 12,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ fontWeight: 500, color: '#111827' }}>
                  {run.period_start} to {run.period_end}
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                  ${run.total_cost.toFixed(2)} · {run.status}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Selected Run Details */}
        {selectedRun && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h4 style={{ fontSize: 13, fontWeight: 600, color: '#374151', margin: 0 }}>
                Line Items
              </h4>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={handleExportCSV}
                  style={{
                    padding: '6px 12px',
                    background: '#f3f4f6',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Export CSV
                </button>
                {selectedRun.status === 'draft' && (
                  <button
                    onClick={handleSubmitPayroll}
                    style={{
                      padding: '6px 12px',
                      background: '#10b981',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    Submit
                  </button>
                )}
              </div>
            </div>

            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid #e5e7eb' }}>
                    <th style={{ textAlign: 'left', padding: '8px 4px', fontWeight: 600, color: '#6b7280' }}>
                      Employee
                    </th>
                    <th style={{ textAlign: 'right', padding: '8px 4px', fontWeight: 600, color: '#6b7280' }}>
                      Hours
                    </th>
                    <th style={{ textAlign: 'right', padding: '8px 4px', fontWeight: 600, color: '#6b7280' }}>
                      OT Hours
                    </th>
                    <th style={{ textAlign: 'right', padding: '8px 4px', fontWeight: 600, color: '#6b7280' }}>
                      Gross
                    </th>
                    <th style={{ textAlign: 'right', padding: '8px 4px', fontWeight: 600, color: '#6b7280' }}>
                      Net
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '6px 4px', color: '#111827' }}>
                        {employees[item.employee_id]?.name || item.employee_id}
                      </td>
                      <td style={{ textAlign: 'right', padding: '6px 4px', color: '#374151' }}>
                        {item.shift_hours.toFixed(1)}
                      </td>
                      <td style={{ textAlign: 'right', padding: '6px 4px', color: '#374151' }}>
                        {item.overtime_hours.toFixed(1)}
                      </td>
                      <td style={{ textAlign: 'right', padding: '6px 4px', fontWeight: 500, color: '#111827' }}>
                        ${item.gross_amount.toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'right', padding: '6px 4px', fontWeight: 500, color: '#059669' }}>
                        ${item.net_amount.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 12, padding: '10px 12px', background: '#f9fafb', borderRadius: 8, borderBottom: '1.5px solid #e5e7eb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600 }}>
                <span>Total Cost:</span>
                <span style={{ color: '#111827' }}>${selectedRun.total_cost.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
