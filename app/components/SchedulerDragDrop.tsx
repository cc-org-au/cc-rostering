'use client';

import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, DropResult } from 'react-beautiful-dnd';
import { ShiftCard } from './ShiftCard';
import { supabase } from '@/lib/supabase';

interface Shift {
  id: string;
  project_id: string;
  date: string;
  start_time: string;
  end_time: string;
  role: string;
  required_count: number;
  status: string;
}

interface ShiftAssignment {
  id: string;
  shift_id: string;
  employee_id: string;
  assigned_at: string;
  status: string;
}

interface Project {
  id: string;
  name: string;
  color: string;
}

interface Employee {
  id: string;
  name: string;
}

export function SchedulerDragDrop() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [projects, setProjects] = useState<Record<string, Project>>({});
  const [employees, setEmployees] = useState<Record<string, Employee>>({});
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedProject, setSelectedProject] = useState<string>('');

  useEffect(() => {
    (async () => {
      const [shiftsRes, assignmentsRes, projectsRes, employeesRes] = await Promise.all([
        supabase.from('shifts').select('*'),
        supabase.from('shift_assignments').select('*'),
        supabase.from('projects').select('*'),
        supabase.from('employees').select('*'),
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

      const empMap: Record<string, Employee> = {};
      if (employeesRes.data) {
        employeesRes.data.forEach((e: any) => {
          empMap[e.id] = { id: e.id, name: e.name };
        });
      }
      setEmployees(empMap);

      setLoading(false);
    })();
  }, []);

  const handleDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;

    if (!destination || (source.droppableId === destination.droppableId && source.index === destination.index)) {
      return;
    }

    const [dragType, dragId] = draggableId.split('-');

    if (dragType === 'shift') {
      const sourceShiftId = source.droppableId === 'unassigned' ? null : source.droppableId;
      const destShiftId = destination.droppableId === 'unassigned' ? null : destination.droppableId;
      const employeeId = dragId;

      if (destShiftId === null) {
        await supabase.from('shift_assignments').delete().eq('shift_id', sourceShiftId).eq('employee_id', employeeId);
      } else {
        await supabase.from('shift_assignments').upsert(
          { id: `${destShiftId}-${employeeId}`, shift_id: destShiftId, employee_id: employeeId, status: 'assigned' },
          { onConflict: 'id' }
        );
      }

      setAssignments((prev) => {
        const updated = prev.filter((a) => !(a.employee_id === employeeId && a.shift_id === sourceShiftId));
        if (destShiftId) {
          updated.push({
            id: `${destShiftId}-${employeeId}`,
            shift_id: destShiftId,
            employee_id: employeeId,
            assigned_at: new Date().toISOString(),
            status: 'assigned',
          });
        }
        return updated;
      });
    }
  };

  if (loading) return <div style={{ padding: 20, color: 'var(--text-muted)' }}>Loading scheduler...</div>;

  const projectShifts = selectedProject
    ? shifts.filter((s) => s.project_id === selectedProject && s.date === selectedDate)
    : shifts.filter((s) => s.date === selectedDate);

  const getShiftStatus = (shiftId: string): 'open' | 'partial' | 'full' | 'over' => {
    const shift = shifts.find((s) => s.id === shiftId);
    if (!shift) return 'open';
    const count = assignments.filter((a) => a.shift_id === shiftId).length;
    if (count === 0) return 'open';
    if (count < shift.required_count) return 'partial';
    if (count === shift.required_count) return 'full';
    return 'over';
  };

  const projectOptions = Object.values(projects);

  return (
    <div style={{ padding: 16 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>
        Drag & Drop Scheduler
      </h3>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
            Date
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

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
            Project
          </label>
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1.5px solid #d1d5db',
              borderRadius: 8,
              fontSize: 13,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            <option value="">All Projects</option>
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Open Shifts */}
          <div>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>
              Available Shifts ({projectShifts.length})
            </h4>
            <Droppable droppableId="unassigned">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  style={{
                    background: snapshot.isDraggingOver ? '#f0fdf4' : 'var(--bg-muted)',
                    border: `2px dashed ${snapshot.isDraggingOver ? '#10b981' : 'var(--border)'}`,
                    borderRadius: 12,
                    padding: 12,
                    minHeight: 400,
                  }}
                >
                  {projectShifts.map((shift, idx) => (
                    <ShiftCard
                      key={shift.id}
                      shiftId={shift.id}
                      projectName={projects[shift.project_id]?.name || 'Unknown'}
                      projectColor={projects[shift.project_id]?.color || '#888'}
                      date={shift.date}
                      startTime={shift.start_time}
                      endTime={shift.end_time}
                      role={shift.role}
                      assignedCount={assignments.filter((a) => a.shift_id === shift.id).length}
                      requiredCount={shift.required_count}
                      status={getShiftStatus(shift.id)}
                      index={idx}
                    />
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>

          {/* Assigned Shifts */}
          <div>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>
              Assigned Staff ({Object.keys(employees).length})
            </h4>
            <div style={{ background: 'var(--bg-muted)', border: '2px dashed #e5e7eb', borderRadius: 12, padding: 12, minHeight: 400 }}>
              {Object.values(employees).map((emp) => (
                <Droppable key={emp.id} droppableId={emp.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      style={{
                        background: snapshot.isDraggingOver ? '#eff6ff' : 'var(--bg-card)',
                        border: `1px solid ${snapshot.isDraggingOver ? '#93c5fd' : 'var(--border)'}`,
                        borderRadius: 8,
                        padding: 10,
                        marginBottom: 8,
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                        {emp.name}
                      </div>
                      {assignments
                        .filter((a) => a.employee_id === emp.id)
                        .map((assignment, idx) => {
                          const shift = shifts.find((s) => s.id === assignment.shift_id);
                          return shift ? (
                            <ShiftCard
                              key={assignment.id}
                              shiftId={assignment.shift_id}
                              projectName={projects[shift.project_id]?.name || 'Unknown'}
                              projectColor={projects[shift.project_id]?.color || '#888'}
                              date={shift.date}
                              startTime={shift.start_time}
                              endTime={shift.end_time}
                              role={shift.role}
                              assignedCount={1}
                              requiredCount={1}
                              status="full"
                              employeeName={emp.name}
                              index={idx}
                            />
                          ) : null;
                        })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              ))}
            </div>
          </div>
        </div>
      </DragDropContext>
    </div>
  );
}
