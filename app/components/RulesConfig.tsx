'use client';

import { useState, useEffect } from 'react';
import { ConfirmModal } from './shared';
import { supabase } from '@/lib/supabase';
import { RULE_TYPES } from '@/lib/rules/complianceValidator';

interface ShiftRule {
  id: string;
  name: string;
  rule_type: string;
  constraint_data: Record<string, any>;
  threshold: number;
  enabled_projects: string[];
  enabled: boolean;
}

interface Project {
  id: string;
  name: string;
}

export function RulesConfig() {
  const [rules, setRules] = useState<ShiftRule[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [editingRule, setEditingRule] = useState<ShiftRule | null>(null);
  const [loading, setLoading] = useState(true);
  const [ruleToDelete, setRuleToDelete] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [rulesRes, projectsRes] = await Promise.all([
        supabase.from('shift_rules').select('*'),
        supabase.from('projects').select('id, name'),
      ]);

      if (rulesRes.data) setRules(rulesRes.data as ShiftRule[]);
      if (projectsRes.data) setProjects(projectsRes.data as Project[]);
      setLoading(false);
    })();
  }, []);

  const handleSaveRule = async (rule: ShiftRule) => {
    const { error } = await supabase.from('shift_rules').upsert(rule);
    if (!error) {
      setRules((prev) =>
        prev.some((r) => r.id === rule.id)
          ? prev.map((r) => (r.id === rule.id ? rule : r))
          : [...prev, rule]
      );
      setEditingRule(null);
    }
  };

  const handleToggleRule = async (ruleId: string, enabled: boolean) => {
    const { error } = await supabase
      .from('shift_rules')
      .update({ enabled })
      .eq('id', ruleId);
    if (!error) {
      setRules((prev) => prev.map((r) => (r.id === ruleId ? { ...r, enabled } : r)));
    }
  };

  const runDeleteRule = async () => {
    if (!ruleToDelete) return;
    const ruleId = ruleToDelete;
    setRuleToDelete(null);
    const { error } = await supabase.from('shift_rules').delete().eq('id', ruleId);
    if (!error) {
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
    }
  };

  if (loading) return <div style={{ padding: 20, color: 'var(--text-muted)' }}>Loading rules...</div>;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          Shift Rules & Compliance
        </h3>
        <button
          onClick={() =>
            setEditingRule({
              id: `rule-${Date.now()}`,
              name: '',
              rule_type: Object.values(RULE_TYPES)[0] as string,
              constraint_data: {},
              threshold: 0,
              enabled_projects: [],
              enabled: true,
            })
          }
          style={{
            padding: '8px 16px',
            background: 'var(--accent)',
            color: 'var(--on-accent)',
            border: 'none',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          + Add Rule
        </button>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {rules.map((rule) => (
          <div
            key={rule.id}
            style={{
              background: 'var(--bg-card)',
              border: `2px solid ${rule.enabled ? 'var(--border)' : 'var(--border-input)'}`,
              borderRadius: 10,
              padding: 14,
              opacity: rule.enabled ? 1 : 0.6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'start', gap: 12, marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={(e) => handleToggleRule(rule.id, e.target.checked)}
                style={{ width: 18, height: 18, marginTop: 2, cursor: 'pointer' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                  {rule.name || 'Unnamed Rule'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                  {rule.rule_type}
                  {rule.threshold > 0 && ` · Threshold: ${rule.threshold}`}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                  {rule.enabled_projects.length > 0
                    ? `Applied to: ${rule.enabled_projects.length} project(s)`
                    : 'All projects'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => setEditingRule(rule)}
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
                  onClick={() => setRuleToDelete(rule.id)}
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
          </div>
        ))}
      </div>

      <ConfirmModal
        open={!!ruleToDelete}
        title="Delete rule?"
        message={
          ruleToDelete
            ? `Delete "${rules.find((r) => r.id === ruleToDelete)?.name || 'this rule'}"? This cannot be undone.`
            : ''
        }
        onCancel={() => setRuleToDelete(null)}
        onConfirm={runDeleteRule}
      />

      {/* Edit Modal */}
      {editingRule && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--overlay-scrim)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
          }}
          onClick={() => setEditingRule(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)',
              borderRadius: 12,
              padding: 24,
              maxWidth: 500,
              width: '90%',
              boxShadow: '0 4px 32px rgba(0,0,0,0.12)',
            }}
          >
            <h4 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16, margin: 0 }}>
              {editingRule.id.startsWith('rule-') ? 'New Rule' : 'Edit Rule'}
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
                  Rule Name
                </label>
                <input
                  type="text"
                  value={editingRule.name}
                  onChange={(e) =>
                    setEditingRule({ ...editingRule, name: e.target.value })
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

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
                  Rule Type
                </label>
                <select
                  value={editingRule.rule_type}
                  onChange={(e) =>
                    setEditingRule({ ...editingRule, rule_type: e.target.value })
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
                  {Object.entries(RULE_TYPES).map(([key, value]) => (
                    <option key={value} value={value}>
                      {key.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
                  Threshold / Limit
                </label>
                <input
                  type="number"
                  value={editingRule.threshold}
                  onChange={(e) =>
                    setEditingRule({ ...editingRule, threshold: Number(e.target.value) })
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
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setEditingRule(null)}
                style={{
                  padding: '8px 16px',
                  background: 'var(--bg-card)',
                  border: '1.5px solid #d1d5db',
                  borderRadius: 8,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleSaveRule(editingRule)}
                style={{
                  padding: '8px 16px',
                  background: 'var(--accent)',
                  color: 'var(--on-accent)',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Save Rule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
