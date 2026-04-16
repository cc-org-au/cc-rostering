'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Timesheet {
  id: string;
  employee_id: string;
  shift_id?: string;
  clock_in?: string;
  clock_out?: string;
  actual_hours: number;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  created_at: string;
}

interface PTORequest {
  id: string;
  employee_id: string;
  date_from: string;
  date_to: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  approved_at?: string;
}

interface Employee {
  id: string;
  name: string;
}

export function TimesheetEntry() {
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [ptoRequests, setPTORequests] = useState<PTORequest[]>([]);
  const [employees, setEmployees] = useState<Record<string, Employee>>({});
  const [activeTab, setActiveTab] = useState<'timesheets' | 'pto'>('timesheets');
  const [loading, setLoading] = useState(true);
  const [clockInEmp, setClockInEmp] = useState<string>('');

  useEffect(() => {
    (async () => {
      const [timesheetsRes, ptoRes, empRes] = await Promise.all([
        supabase.from('timesheets').select('*').order('created_at', { ascending: false }),
        supabase.from('pto_requests').select('*').order('date_from', { ascending: false }),
        supabase.from('employees').select('*'),
      ]);

      if (timesheetsRes.data) setTimesheets(timesheetsRes.data as Timesheet[]);
      if (ptoRes.data) setPTORequests(ptoRes.data as PTORequest[]);

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

  const handleClockIn = async (employeeId: string) => {
    const { data } = await supabase
      .from('timesheets')
      .insert([
        {
          id: `ts-${Date.now()}`,
          employee_id: employeeId,
          clock_in: new Date().toISOString(),
          status: 'draft',
        },
      ])
      .select();

    if (data) {
      setTimesheets((prev) => [data[0], ...prev]);
      setClockInEmp('');
    }
  };

  const handleClockOut = async (timesheetId: string) => {
    const timesheet = timesheets.find((t) => t.id === timesheetId);
    if (!timesheet || !timesheet.clock_in) return;

    const clockOutTime = new Date();
    const clockInTime = new Date(timesheet.clock_in);
    const actualHours = (clockOutTime.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);

    const { error } = await supabase
      .from('timesheets')
      .update({
        clock_out: clockOutTime.toISOString(),
        actual_hours: parseFloat(actualHours.toFixed(2)),
      })
      .eq('id', timesheetId);

    if (!error) {
      setTimesheets((prev) =>
        prev.map((t) =>
          t.id === timesheetId
            ? {
                ...t,
                clock_out: clockOutTime.toISOString(),
                actual_hours: parseFloat(actualHours.toFixed(2)),
              }
            : t
        )
      );
    }
  };

  const handleSubmitTimesheet = async (timesheetId: string) => {
    const { error } = await supabase
      .from('timesheets')
      .update({ status: 'submitted' })
      .eq('id', timesheetId);

    if (!error) {
      setTimesheets((prev) => prev.map((t) => (t.id === timesheetId ? { ...t, status: 'submitted' } : t)));
    }
  };

  const handleSubmitPTO = async (dateFrom: string, dateTo: string, reason: string, empId: string) => {
    const { data } = await supabase
      .from('pto_requests')
      .insert([
        {
          id: `pto-${Date.now()}`,
          employee_id: empId,
          date_from: dateFrom,
          date_to: dateTo,
          reason,
          status: 'pending',
        },
      ])
      .select();

    if (data) {
      setPTORequests((prev) => [data[0], ...prev]);
    }
  };

  if (loading) return <div style={{ padding: 20, color: 'var(--text-muted)' }}>Loading time & attendance...</div>;

  return (
    <div style={{ padding: 16 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>
        Time & Attendance
      </h3>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1.5px solid #e5e7eb', paddingBottom: 12 }}>
        {['timesheets', 'pto'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as 'timesheets' | 'pto')}
            style={{
              padding: '8px 12px',
              background: activeTab === tab ? 'var(--accent)' : 'transparent',
              color: activeTab === tab ? 'var(--on-accent)' : 'var(--text-muted)',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {tab === 'timesheets' ? 'Timesheets' : 'PTO Requests'}
          </button>
        ))}
      </div>

      {/* Timesheets Tab */}
      {activeTab === 'timesheets' && (
        <div>
          <div style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 10, padding: 14, marginBottom: 16 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: '#1d4ed8', margin: '0 0 10px' }}>
              Clock In/Out
            </h4>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={clockInEmp}
                onChange={(e) => setClockInEmp(e.target.value)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: '1.5px solid #bfdbfe',
                  borderRadius: 6,
                  fontSize: 13,
                  fontFamily: 'inherit',
                }}
              >
                <option value="">Select employee</option>
                {Object.values(employees).map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => clockInEmp && handleClockIn(clockInEmp)}
                disabled={!clockInEmp}
                style={{
                  padding: '8px 16px',
                  background: clockInEmp ? '#1d4ed8' : '#bfdbfe',
                  color: clockInEmp ? '#fff' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: clockInEmp ? 'pointer' : 'not-allowed',
                }}
              >
                Clock In
              </button>
            </div>
          </div>

          {/* Timesheets List */}
          <div style={{ display: 'grid', gap: 10 }}>
            {timesheets.map((ts) => (
              <div
                key={ts.id}
                style={{
                  background: 'var(--bg-card)',
                  border: '1.5px solid #e5e7eb',
                  borderRadius: 10,
                  padding: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {employees[ts.employee_id]?.name || 'Unknown'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    {ts.clock_in && new Date(ts.clock_in).toLocaleTimeString()}
                    {ts.clock_out && ` - ${new Date(ts.clock_out).toLocaleTimeString()}`}
                  </div>
                  {ts.actual_hours > 0 && (
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#059669', marginTop: 4 }}>
                      {ts.actual_hours.toFixed(1)}h
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {!ts.clock_out && (
                    <button
                      onClick={() => handleClockOut(ts.id)}
                      style={{
                        padding: '6px 12px',
                        background: '#dcfce7',
                        color: '#166534',
                        border: '1px solid #86efac',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: 'pointer',
                      }}
                    >
                      Clock Out
                    </button>
                  )}
                  {ts.status === 'draft' && ts.clock_out && (
                    <button
                      onClick={() => handleSubmitTimesheet(ts.id)}
                      style={{
                        padding: '6px 12px',
                        background: 'var(--accent)',
                        color: 'var(--on-accent)',
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
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      padding: '6px 10px',
                      background:
                        ts.status === 'approved'
                          ? '#ecfdf5'
                          : ts.status === 'submitted'
                            ? '#fef3c7'
                            : '#f3f4f6',
                      color:
                        ts.status === 'approved'
                          ? '#065f46'
                          : ts.status === 'submitted'
                            ? '#92400e'
                            : 'var(--text-muted)',
                      borderRadius: 4,
                    }}
                  >
                    {ts.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PTO Tab */}
      {activeTab === 'pto' && (
        <div>
          <div style={{ display: 'grid', gap: 10 }}>
            {ptoRequests.map((pto) => (
              <div
                key={pto.id}
                style={{
                  background: 'var(--bg-card)',
                  border: '1.5px solid #e5e7eb',
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {employees[pto.employee_id]?.name || 'Unknown'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {pto.date_from} to {pto.date_to}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      padding: '4px 8px',
                      background: pto.status === 'approved' ? '#ecfdf5' : pto.status === 'pending' ? '#fef3c7' : '#fee2e2',
                      color: pto.status === 'approved' ? '#065f46' : pto.status === 'pending' ? '#92400e' : '#991b1b',
                      borderRadius: 4,
                    }}
                  >
                    {pto.status}
                  </span>
                </div>
                {pto.reason && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Reason: {pto.reason}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
