'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Shift {
  id: string;
  project_id: string;
  date: string;
  start_time: string;
  end_time: string;
  required_count: number;
}

interface ShiftAssignment {
  shift_id: string;
  employee_id: string;
}

interface Project {
  id: string;
  name: string;
  color: string;
}

export function CoverageTab() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [projects, setProjects] = useState<Record<string, Project>>({});
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [shiftsRes, assignmentsRes, projectsRes] = await Promise.all([
        supabase.from('shifts').select('*'),
        supabase.from('shift_assignments').select('*'),
        supabase.from('projects').select('*'),
      ]);

      if (shiftsRes.data) setShifts(shiftsRes.data as Shift[]);
      if (assignmentsRes.data) setAssignments(assignmentsRes.data as ShiftAssignment[]);

      const projMap: Record<string, Project> = {};
      if (projectsRes.data) {
        projectsRes.data.forEach((p: any) => {
          projMap[p.id] = { id: p.id, name: p.name, color: p.color };
        });
      }
      setProjects(projMap);
      setLoading(false);
    })();
  }, []);

  const getShiftStatus = (
    shiftId: string
  ): { status: 'open' | 'partial' | 'full' | 'over'; count: number } => {
    const shift = shifts.find((s) => s.id === shiftId);
    if (!shift) return { status: 'open', count: 0 };

    const count = assignments.filter((a) => a.shift_id === shiftId).length;
    if (count === 0) return { status: 'open', count };
    if (count < shift.required_count) return { status: 'partial', count };
    if (count === shift.required_count) return { status: 'full', count };
    return { status: 'over', count };
  };

  const dayShifts = shifts.filter((s) => s.date === selectedDate);

  const stats = {
    total: dayShifts.length,
    open: dayShifts.filter((s) => getShiftStatus(s.id).status === 'open').length,
    partial: dayShifts.filter((s) => getShiftStatus(s.id).status === 'partial').length,
    full: dayShifts.filter((s) => getShiftStatus(s.id).status === 'full').length,
    over: dayShifts.filter((s) => getShiftStatus(s.id).status === 'over').length,
  };

  const fillPercentage = stats.total > 0 ? Math.round(((stats.full + stats.partial) / stats.total) * 100) : 0;

  const statusColors = {
    open: '#dc2626',
    partial: '#f59e0b',
    full: '#10b981',
    over: '#ef4444',
  };

  if (loading) return <div style={{ padding: 20, color: '#6b7280' }}>Loading coverage data...</div>;

  return (
    <div style={{ padding: 16 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 16 }}>
        Real-Time Shift Coverage
      </h3>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>
          Select Date
        </label>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1.5px solid #d1d5db',
            borderRadius: 8,
            fontSize: 13,
            fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Coverage Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Shifts', value: stats.total, color: '#111827' },
          { label: 'Full Coverage', value: stats.full, color: '#10b981' },
          { label: 'Partial Coverage', value: stats.partial, color: '#f59e0b' },
          { label: 'Open Shifts', value: stats.open, color: '#dc2626' },
          { label: 'Over Assigned', value: stats.over, color: '#ef4444' },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              background: '#f9fafb',
              border: '1.5px solid #e5e7eb',
              borderRadius: 10,
              padding: 12,
            }}
          >
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{stat.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: stat.color }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Coverage Progress */}
      <div style={{ background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: 14, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Overall Coverage</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>{fillPercentage}%</span>
        </div>
        <div
          style={{
            height: 8,
            background: '#e5e7eb',
            borderRadius: 99,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              background: fillPercentage >= 100 ? '#10b981' : fillPercentage >= 80 ? '#f59e0b' : '#dc2626',
              width: `${Math.min(fillPercentage, 100)}%`,
              transition: 'width 0.3s',
            }}
          />
        </div>
      </div>

      {/* Shifts by Status */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Open & Partial */}
        <div>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', marginBottom: 12 }}>
            Gaps to Fill ({stats.open + stats.partial})
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dayShifts
              .filter((s) => {
                const st = getShiftStatus(s.id).status;
                return st === 'open' || st === 'partial';
              })
              .map((shift) => {
                const st = getShiftStatus(shift.id);
                const needed = shift.required_count - st.count;
                return (
                  <div
                    key={shift.id}
                    style={{
                      background: '#fff',
                      border: `2px solid ${statusColors[st.status]}`,
                      borderRadius: 8,
                      padding: 12,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                        {projects[shift.project_id]?.name || 'Unknown Project'}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          background: statusColors[st.status],
                          color: '#fff',
                          padding: '2px 8px',
                          borderRadius: 4,
                        }}
                      >
                        {st.status === 'open' ? 'OPEN' : 'PARTIAL'} ({needed} needed)
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                      {shift.date} · {shift.start_time}-{shift.end_time}
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>
                      {st.count} / {shift.required_count} assigned
                    </div>
                  </div>
                );
              })}
            {stats.open + stats.partial === 0 && (
              <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '20px 0' }}>
                No coverage gaps!
              </div>
            )}
          </div>
        </div>

        {/* Full Coverage */}
        <div>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', marginBottom: 12 }}>
            Fully Covered ({stats.full})
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dayShifts
              .filter((s) => getShiftStatus(s.id).status === 'full')
              .map((shift) => (
                <div
                  key={shift.id}
                  style={{
                    background: '#ecfdf5',
                    border: '2px solid #10b981',
                    borderRadius: 8,
                    padding: 12,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#065f46' }}>
                      {projects[shift.project_id]?.name || 'Unknown Project'}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        background: '#10b981',
                        color: '#fff',
                        padding: '2px 8px',
                        borderRadius: 4,
                      }}
                    >
                      ✓ FULL
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#059669', marginBottom: 4 }}>
                    {shift.date} · {shift.start_time}-{shift.end_time}
                  </div>
                  <div style={{ fontSize: 11, color: '#047857' }}>
                    {shift.required_count} / {shift.required_count} assigned
                  </div>
                </div>
              ))}
            {stats.full === 0 && (
              <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '20px 0' }}>
                No fully covered shifts
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
