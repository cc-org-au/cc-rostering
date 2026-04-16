'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Shift {
  id: string;
  project_id: string;
  date: string;
  start_time: string;
  end_time: string;
}

interface ShiftClaim {
  id: string;
  shift_id: string;
  employee_id: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface ShiftSwap {
  id: string;
  from_employee_id: string;
  to_employee_id: string;
  shift_id: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface Employee {
  id: string;
  name: string;
}

interface Project {
  id: string;
  name: string;
}

export function ShiftSelfService() {
  const [tab, setTab] = useState<'claims' | 'swaps'>('claims');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [claims, setClaims] = useState<ShiftClaim[]>([]);
  const [swaps, setSwaps] = useState<ShiftSwap[]>([]);
  const [employees, setEmployees] = useState<Record<string, Employee>>({});
  const [projects, setProjects] = useState<Record<string, Project>>({});
  const [currentEmpId, setCurrentEmpId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [shiftsRes, claimsRes, swapsRes, empRes, projRes] = await Promise.all([
        supabase.from('shifts').select('*'),
        supabase.from('shift_claims').select('*'),
        supabase.from('shift_swaps').select('*'),
        supabase.from('employees').select('*'),
        supabase.from('projects').select('*'),
      ]);

      if (shiftsRes.data) setShifts(shiftsRes.data as Shift[]);
      if (claimsRes.data) setClaims(claimsRes.data as ShiftClaim[]);
      if (swapsRes.data) setSwaps(swapsRes.data as ShiftSwap[]);

      const empMap: Record<string, Employee> = {};
      if (empRes.data) {
        empRes.data.forEach((e: any) => {
          empMap[e.id] = { id: e.id, name: e.name };
        });
        setEmployees(empMap);
        if (empRes.data.length > 0) setCurrentEmpId(empRes.data[0].id);
      }

      const projMap: Record<string, Project> = {};
      if (projRes.data) {
        projRes.data.forEach((p: any) => {
          projMap[p.id] = { id: p.id, name: p.name };
        });
      }
      setProjects(projMap);

      setLoading(false);
    })();
  }, []);

  const handleClaimShift = async (shiftId: string) => {
    if (!currentEmpId) return;

    const { data } = await supabase
      .from('shift_claims')
      .insert([
        {
          id: `claim-${Date.now()}`,
          shift_id: shiftId,
          employee_id: currentEmpId,
          status: 'pending',
        },
      ])
      .select();

    if (data) {
      setClaims((prev) => [...prev, data[0]]);
    }
  };

  const handleRequestSwap = async (fromEmpId: string, toEmpId: string, shiftId: string) => {
    const { data } = await supabase
      .from('shift_swaps')
      .insert([
        {
          id: `swap-${Date.now()}`,
          from_employee_id: fromEmpId,
          to_employee_id: toEmpId,
          shift_id: shiftId,
          status: 'pending',
        },
      ])
      .select();

    if (data) {
      setSwaps((prev) => [...prev, data[0]]);
    }
  };

  const handleApproveRequest = async (type: 'claim' | 'swap', id: string) => {
    const table = type === 'claim' ? 'shift_claims' : 'shift_swaps';
    await supabase.from(table).update({ status: 'approved' }).eq('id', id);

    if (type === 'claim') {
      setClaims((prev) => prev.map((c) => (c.id === id ? { ...c, status: 'approved' } : c)));
    } else {
      setSwaps((prev) => prev.map((s) => (s.id === id ? { ...s, status: 'approved' } : s)));
    }
  };

  const handleRejectRequest = async (type: 'claim' | 'swap', id: string) => {
    const table = type === 'claim' ? 'shift_claims' : 'shift_swaps';
    await supabase.from(table).update({ status: 'rejected' }).eq('id', id);

    if (type === 'claim') {
      setClaims((prev) => prev.map((c) => (c.id === id ? { ...c, status: 'rejected' } : c)));
    } else {
      setSwaps((prev) => prev.map((s) => (s.id === id ? { ...s, status: 'rejected' } : s)));
    }
  };

  if (loading) return <div style={{ padding: 20, color: '#6b7280' }}>Loading self-service options...</div>;

  const openShifts = shifts.filter((s) => !claims.find((c) => c.shift_id === s.id && c.status === 'approved'));

  return (
    <div style={{ padding: 16 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 16 }}>
        Shift Self-Service
      </h3>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1.5px solid #e5e7eb', paddingBottom: 12 }}>
        {['claims', 'swaps'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t as 'claims' | 'swaps')}
            style={{
              padding: '8px 12px',
              background: tab === t ? '#4f46e5' : 'transparent',
              color: tab === t ? '#fff' : '#6b7280',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {t === 'claims' ? 'Open Shifts' : 'Shift Swaps'}
          </button>
        ))}
      </div>

      {/* Open Shifts Tab */}
      {tab === 'claims' && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
              Your Employee ID
            </label>
            <select
              value={currentEmpId}
              onChange={(e) => setCurrentEmpId(e.target.value)}
              style={{
                width: '100%',
                maxWidth: 300,
                padding: '8px 10px',
                border: '1.5px solid #d1d5db',
                borderRadius: 6,
                fontSize: 12,
                fontFamily: 'inherit',
              }}
            >
              {Object.values(employees).map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
            {openShifts.map((shift) => {
              const hasClaim = claims.find((c) => c.shift_id === shift.id && c.employee_id === currentEmpId);
              return (
                <div
                  key={shift.id}
                  style={{
                    background: '#fff',
                    border: '1.5px solid #e5e7eb',
                    borderRadius: 10,
                    padding: 12,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                      {projects[shift.project_id]?.name || 'Unknown Project'}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                      {shift.date} · {shift.start_time}-{shift.end_time}
                    </div>
                  </div>
                  <button
                    onClick={() => handleClaimShift(shift.id)}
                    disabled={hasClaim !== undefined}
                    style={{
                      padding: '8px 16px',
                      background: hasClaim ? '#d1d5db' : '#10b981',
                      color: hasClaim ? '#6b7280' : '#fff',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: hasClaim ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {hasClaim ? `Claimed (${hasClaim.status})` : 'Claim Shift'}
                  </button>
                </div>
              );
            })}
            {openShifts.length === 0 && (
              <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '20px' }}>
                No open shifts available
              </div>
            )}
          </div>

          {/* Pending Claims */}
          <h4 style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>
            Your Claims
          </h4>
          <div style={{ display: 'grid', gap: 8 }}>
            {claims
              .filter((c) => c.employee_id === currentEmpId)
              .map((claim) => {
                const shift = shifts.find((s) => s.id === claim.shift_id);
                return shift ? (
                  <div
                    key={claim.id}
                    style={{
                      background: '#fef3c7',
                      border: '1.5px solid #fcd34d',
                      borderRadius: 8,
                      padding: 10,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ fontSize: 12, color: '#92400e' }}>
                      {projects[shift.project_id]?.name} - {shift.date} {shift.start_time}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 500, color: '#92400e' }}>
                      {claim.status}
                    </span>
                  </div>
                ) : null;
              })}
            {claims.filter((c) => c.employee_id === currentEmpId).length === 0 && (
              <div style={{ fontSize: 12, color: '#9ca3af' }}>No claims yet</div>
            )}
          </div>
        </div>
      )}

      {/* Shift Swaps Tab */}
      {tab === 'swaps' && (
        <div>
          <div style={{ display: 'grid', gap: 10 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
              Pending Swap Requests
            </h4>
            {swaps
              .filter((s) => s.status === 'pending')
              .map((swap) => {
                const shift = shifts.find((sh) => sh.id === swap.shift_id);
                const fromEmp = employees[swap.from_employee_id];
                const toEmp = employees[swap.to_employee_id];

                return shift ? (
                  <div
                    key={swap.id}
                    style={{
                      background: '#fff',
                      border: '1.5px solid #e5e7eb',
                      borderRadius: 10,
                      padding: 12,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>
                        {fromEmp?.name} ↔ {toEmp?.name}
                      </div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                        {projects[shift.project_id]?.name} - {shift.date} {shift.start_time}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => handleApproveRequest('swap', swap.id)}
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
                        Approve
                      </button>
                      <button
                        onClick={() => handleRejectRequest('swap', swap.id)}
                        style={{
                          padding: '6px 12px',
                          background: '#fee2e2',
                          color: '#991b1b',
                          border: '1px solid #fecaca',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ) : null;
              })}
            {swaps.filter((s) => s.status === 'pending').length === 0 && (
              <div style={{ fontSize: 12, color: '#9ca3af' }}>No pending swaps</div>
            )}
          </div>

          {/* Approved Swaps */}
          <h4 style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginTop: 16, marginBottom: 8 }}>
            Approved Swaps
          </h4>
          <div style={{ display: 'grid', gap: 8 }}>
            {swaps
              .filter((s) => s.status === 'approved')
              .map((swap) => {
                const shift = shifts.find((sh) => sh.id === swap.shift_id);
                const fromEmp = employees[swap.from_employee_id];
                const toEmp = employees[swap.to_employee_id];

                return shift ? (
                  <div
                    key={swap.id}
                    style={{
                      background: '#ecfdf5',
                      border: '1.5px solid #86efac',
                      borderRadius: 8,
                      padding: 10,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#065f46' }}>
                      ✓ {fromEmp?.name} and {toEmp?.name} swapped {shift.date}
                    </div>
                  </div>
                ) : null;
              })}
            {swaps.filter((s) => s.status === 'approved').length === 0 && (
              <div style={{ fontSize: 12, color: '#9ca3af' }}>No approved swaps</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
