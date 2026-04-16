'use client';

import { useState, useEffect } from 'react';
import { ConfirmModal } from './shared';
import { supabase } from '@/lib/supabase';
import { TRIGGER_TYPES, ACTION_TYPES, WORKFLOW_TEMPLATES } from '@/lib/automation/workflowEngine';

interface Workflow {
  id: string;
  name: string;
  trigger_type: string;
  trigger_config: Record<string, any>;
  conditions: any[];
  actions: any[];
  enabled: boolean;
}

export function AutomationStudio() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [workflowToDelete, setWorkflowToDelete] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('automation_workflows').select('*');
      if (data) setWorkflows(data as Workflow[]);
      setLoading(false);
    })();
  }, []);

  const handleCreateWorkflow = (template?: any) => {
    const newWorkflow: Workflow = template || {
      id: `workflow-${Date.now()}`,
      name: 'New Workflow',
      trigger_type: Object.values(TRIGGER_TYPES)[0],
      trigger_config: {},
      conditions: [],
      actions: [],
      enabled: true,
    };
    setEditingWorkflow(newWorkflow);
  };

  const handleSaveWorkflow = async (workflow: Workflow) => {
    const { error } = await supabase.from('automation_workflows').upsert(workflow);
    if (!error) {
      setWorkflows((prev) =>
        prev.some((w) => w.id === workflow.id)
          ? prev.map((w) => (w.id === workflow.id ? workflow : w))
          : [...prev, workflow]
      );
      setEditingWorkflow(null);
    }
  };

  const handleToggleWorkflow = async (workflowId: string, enabled: boolean) => {
    const { error } = await supabase
      .from('automation_workflows')
      .update({ enabled })
      .eq('id', workflowId);
    if (!error) {
      setWorkflows((prev) => prev.map((w) => (w.id === workflowId ? { ...w, enabled } : w)));
    }
  };

  const runDeleteWorkflow = async () => {
    if (!workflowToDelete) return;
    const workflowId = workflowToDelete;
    setWorkflowToDelete(null);
    const { error } = await supabase.from('automation_workflows').delete().eq('id', workflowId);
    if (!error) {
      setWorkflows((prev) => prev.filter((w) => w.id !== workflowId));
    }
  };

  if (loading) return <div style={{ padding: 20, color: '#6b7280' }}>Loading automation studio...</div>;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', margin: 0 }}>
          Automation Studio
        </h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => handleCreateWorkflow()}
            style={{
              padding: '8px 16px',
              background: '#4f46e5',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            + Blank Workflow
          </button>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
              style={{
                padding: '8px 16px',
                background: '#f3f4f6',
                border: '1px solid #d1d5db',
                borderRadius: 8,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Templates ▾
            </button>
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                background: '#fff',
                border: '1px solid #d1d5db',
                borderRadius: 8,
                zIndex: 10,
                minWidth: 200,
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              }}
            >
              {Object.entries(WORKFLOW_TEMPLATES).map(([key, template]: any) => (
                <button
                  key={key}
                  onClick={() => handleCreateWorkflow(template)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    border: 'none',
                    background: 'none',
                    fontSize: 12,
                    cursor: 'pointer',
                    borderBottom: '1px solid #e5e7eb',
                    color: '#374151',
                  }}
                >
                  {template.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Workflows List */}
      <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
        {workflows.map((workflow) => (
          <div
            key={workflow.id}
            style={{
              background: '#fff',
              border: '1.5px solid #e5e7eb',
              borderRadius: 10,
              padding: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              opacity: workflow.enabled ? 1 : 0.6,
            }}
          >
            <input
              type="checkbox"
              checked={workflow.enabled}
              onChange={(e) => handleToggleWorkflow(workflow.id, e.target.checked)}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 2 }}>
                {workflow.name}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                Trigger: {workflow.trigger_type} · {workflow.actions.length} action(s)
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setEditingWorkflow(workflow)}
                style={{
                  padding: '6px 12px',
                  background: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setWorkflowToDelete(workflow.id)}
                style={{
                  padding: '6px 12px',
                  background: '#fee2e2',
                  border: '1px solid #fecaca',
                  borderRadius: 6,
                  fontSize: 12,
                  color: '#dc2626',
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <ConfirmModal
        open={!!workflowToDelete}
        title="Delete workflow?"
        message={
          workflowToDelete
            ? `Delete "${workflows.find((w) => w.id === workflowToDelete)?.name || 'this workflow'}"? This cannot be undone.`
            : ''
        }
        onCancel={() => setWorkflowToDelete(null)}
        onConfirm={runDeleteWorkflow}
      />

      {workflows.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af' }}>
          <div style={{ fontSize: 14, marginBottom: 12 }}>No workflows configured yet</div>
          <button
            type="button"
            onClick={() => handleCreateWorkflow()}
            style={{
              padding: '8px 16px',
              background: '#4f46e5',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Create Your First Workflow
          </button>
        </div>
      )}

      {/* Edit Modal */}
      {editingWorkflow && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
          }}
          onClick={() => setEditingWorkflow(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 24,
              maxWidth: 600,
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 4px 32px rgba(0,0,0,0.12)',
            }}
          >
            <h4 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 16, margin: 0 }}>
              {editingWorkflow.id.startsWith('workflow-') ? 'New Workflow' : 'Edit Workflow'}
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
              {/* Workflow Name */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>
                  Workflow Name
                </label>
                <input
                  type="text"
                  value={editingWorkflow.name}
                  onChange={(e) =>
                    setEditingWorkflow({ ...editingWorkflow, name: e.target.value })
                  }
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1.5px solid #d1d5db',
                    borderRadius: 8,
                    fontSize: 13,
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Trigger Type */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>
                  Trigger Event
                </label>
                <select
                  value={editingWorkflow.trigger_type}
                  onChange={(e) =>
                    setEditingWorkflow({ ...editingWorkflow, trigger_type: e.target.value })
                  }
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1.5px solid #d1d5db',
                    borderRadius: 8,
                    fontSize: 13,
                    fontFamily: 'inherit',
                  }}
                >
                  {Object.entries(TRIGGER_TYPES).map(([key, value]) => (
                    <option key={value} value={value}>
                      {key.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>

              {/* Actions */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>
                  Actions ({editingWorkflow.actions.length})
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {editingWorkflow.actions.map((action, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: '#f9fafb',
                        border: '1px solid #e5e7eb',
                        borderRadius: 6,
                        padding: 8,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ fontSize: 12, color: '#374151' }}>
                        {action.type.replace(/_/g, ' ')}
                      </span>
                      <button
                        onClick={() => {
                          const newActions = editingWorkflow.actions.filter((_, i) => i !== idx);
                          setEditingWorkflow({ ...editingWorkflow, actions: newActions });
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#dc2626',
                          cursor: 'pointer',
                          fontSize: 12,
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}

                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        const newAction = { type: e.target.value, config: {} };
                        setEditingWorkflow({
                          ...editingWorkflow,
                          actions: [...editingWorkflow.actions, newAction],
                        });
                        e.target.value = '';
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1.5px solid #d1d5db',
                      borderRadius: 6,
                      fontSize: 12,
                      fontFamily: 'inherit',
                    }}
                  >
                    <option value="">+ Add Action</option>
                    {Object.entries(ACTION_TYPES).map(([key, value]) => (
                      <option key={value} value={value}>
                        {key.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setEditingWorkflow(null)}
                style={{
                  padding: '8px 16px',
                  background: '#fff',
                  border: '1.5px solid #d1d5db',
                  borderRadius: 8,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleSaveWorkflow(editingWorkflow)}
                style={{
                  padding: '8px 16px',
                  background: '#4f46e5',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Save Workflow
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
