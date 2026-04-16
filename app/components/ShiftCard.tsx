'use client';

import { Draggable } from 'react-beautiful-dnd';

interface ShiftCardProps {
  shiftId: string;
  projectName: string;
  projectColor: string;
  date: string;
  startTime: string;
  endTime: string;
  assignedCount: number;
  requiredCount: number;
  role?: string;
  status: 'open' | 'partial' | 'full' | 'over';
  employeeName?: string;
  index: number;
  isDragDisabled?: boolean;
}

export function ShiftCard({
  shiftId,
  projectName,
  projectColor,
  date,
  startTime,
  endTime,
  assignedCount,
  requiredCount,
  role,
  status,
  employeeName,
  index,
  isDragDisabled = false,
}: ShiftCardProps) {
  const statusColor = {
    open: '#dc2626',
    partial: '#f59e0b',
    full: '#10b981',
    over: '#ef4444',
  }[status];

  const statusLabel = {
    open: 'Open',
    partial: 'Partial',
    full: 'Full',
    over: 'Over',
  }[status];

  return (
    <Draggable draggableId={shiftId} index={index} isDragDisabled={isDragDisabled}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          style={{
            ...provided.draggableProps.style,
            opacity: snapshot.isDragging ? 0.5 : 1,
          }}
          title={`${projectName} - ${date} ${startTime}-${endTime}`}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: `2px solid ${statusColor}`,
              borderRadius: 8,
              padding: '10px 12px',
              marginBottom: 8,
              cursor: isDragDisabled ? 'default' : 'grab',
              boxShadow: snapshot.isDragging ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 6,
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: projectColor,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
                {projectName}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  background: statusColor,
                  color: '#fff',
                  padding: '2px 6px',
                  borderRadius: 4,
                }}
              >
                {statusLabel}
              </span>
            </div>

            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
              {date} · {startTime}-{endTime}
            </div>

            {role && (
              <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>
                {role}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 11,
                color: 'var(--text-secondary)',
              }}
            >
              <span style={{ fontWeight: 500 }}>
                {assignedCount} / {requiredCount} assigned
              </span>
              {employeeName && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  {employeeName}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </Draggable>
  );
}
