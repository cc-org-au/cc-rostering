"use client";
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Overlay, ModalBox, Lbl, FocusInp, Btn, BtnPri, BtnDanger, SecTitle, Tag, cardSt } from './shared';

export function NotificationAdminDashboard() {
  const [alerts, setAlerts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [tab, setTab] = useState('alerts'); // alerts, logs, stats
  const [loading, setLoading] = useState(true);

  // Load alerts config
  const loadAlertsConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('alerts_config')
        .select('*')
        .order('alert_type');

      if (error) throw error;
      setAlerts(data);
    } catch (err) {
      console.error('Error loading alerts:', err);
    }
  };

  // Load audit logs
  const loadAuditLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('alert_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs(data);
    } catch (err) {
      console.error('Error loading logs:', err);
    }
  };

  // Load stats
  const loadStats = async () => {
    try {
      const { data: notifLogs } = await supabase
        .from('notification_logs')
        .select('status');

      const stats = {
        total: notifLogs?.length || 0,
        sent: notifLogs?.filter(l => l.status === 'sent').length || 0,
        failed: notifLogs?.filter(l => l.status === 'failed').length || 0,
        pending: notifLogs?.filter(l => l.status === 'pending').length || 0
      };

      setStats(stats);
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([loadAlertsConfig(), loadAuditLogs(), loadStats()]);
      setLoading(false);
    };
    load();
  }, []);

  const updateAlertConfig = async (alertId, updates) => {
    try {
      const { error } = await supabase
        .from('alerts_config')
        .update(updates)
        .eq('id', alertId);

      if (error) throw error;
      await loadAlertsConfig();
      setShowEditModal(false);
    } catch (err) {
      console.error('Error updating alert:', err);
    }
  };

  const severityColors = {
    critical: { bg: '#fecaca', col: '#dc2626' },
    high: { bg: '#fdba74', col: '#d97706' },
    medium: { bg: '#fcd34d', col: '#d97706' },
    low: { bg: '#bfdbfe', col: '#1d4ed8' },
    info: { bg: '#d1d5db', col: '#374151' }
  };

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1.5px solid #e5e7eb', paddingBottom: 12 }}>
        {['alerts', 'logs', 'stats'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 16px',
              background: 'none',
              border: 'none',
              fontSize: 14,
              fontWeight: tab === t ? 600 : 500,
              cursor: 'pointer',
              color: tab === t ? '#4f46e5' : '#6b7280',
              borderBottom: tab === t ? '2px solid #4f46e5' : 'none',
              marginBottom: -13
            }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Alerts Tab */}
      {tab === 'alerts' && (
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#111827' }}>
            Alert Types & Configuration
          </div>
          {loading ? (
            <div>Loading...</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
              {alerts.map(alert => (
                <div key={alert.id} style={cardSt()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 6 }}>
                        {alert.alert_type}
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10, lineHeight: 1.5 }}>
                        {alert.message_template}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                        <Tag bg={severityColors[alert.severity].bg} col={severityColors[alert.severity].col}>
                          {alert.severity}
                        </Tag>
                        {alert.channels?.map(ch => (
                          <Tag key={ch} bg="#dbeafe" col="#1d4ed8">
                            {ch}
                          </Tag>
                        ))}
                        <Tag bg={alert.enabled ? '#dcfce7' : '#fee2e2'} col={alert.enabled ? '#166534' : '#dc2626'}>
                          {alert.enabled ? 'Enabled' : 'Disabled'}
                        </Tag>
                      </div>
                      {alert.threshold && (
                        <div style={{ fontSize: 12, color: '#6b7280' }}>
                          Threshold: {alert.threshold}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setSelectedAlert(alert);
                        setShowEditModal(true);
                      }}
                      style={{
                        padding: '8px 16px',
                        background: '#4f46e5',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                        marginLeft: 12
                      }}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Logs Tab */}
      {tab === 'logs' && (
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#111827' }}>
            Alert Audit Log
          </div>
          {loading ? (
            <div>Loading...</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid #e5e7eb' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>
                      Alert Type
                    </th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>
                      Trigger Reason
                    </th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>
                      Count
                    </th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>
                      Status
                    </th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '10px 12px', fontSize: 13, color: '#374151' }}>
                        {log.alert_type}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 13, color: '#6b7280' }}>
                        {log.trigger_reason}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, color: '#111827' }}>
                        {log.triggered_count}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 13 }}>
                        <Tag bg={log.success ? '#dcfce7' : '#fee2e2'} col={log.success ? '#166534' : '#dc2626'}>
                          {log.success ? 'Success' : 'Failed'}
                        </Tag>
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 13, color: '#6b7280' }}>
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Stats Tab */}
      {tab === 'stats' && stats && (
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#111827' }}>
            Delivery Statistics
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div style={cardSt()}>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Total Notifications</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: '#111827' }}>{stats.total}</div>
            </div>
            <div style={cardSt()}>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Successfully Sent</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: '#10b981' }}>{stats.sent}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                {stats.total > 0 ? ((stats.sent / stats.total) * 100).toFixed(1) : 0}% success rate
              </div>
            </div>
            <div style={cardSt()}>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Failed</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: '#dc2626' }}>{stats.failed}</div>
            </div>
            <div style={cardSt()}>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Pending</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: '#d97706' }}>{stats.pending}</div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Alert Modal */}
      {showEditModal && selectedAlert && (
        <Overlay onClose={() => setShowEditModal(false)}>
          <ModalBox>
            <EditAlertModal
              alert={selectedAlert}
              onSave={(updates) => updateAlertConfig(selectedAlert.id, updates)}
              onClose={() => setShowEditModal(false)}
            />
          </ModalBox>
        </Overlay>
      )}
    </div>
  );
}

function EditAlertModal({ alert, onSave, onClose }) {
  const [data, setData] = useState(alert);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(data);
    setSaving(false);
  };

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 20, color: '#111827' }}>
        Edit Alert: {alert.alert_type}
      </div>

      <div style={{ marginBottom: 16 }}>
        <Lbl>Alert Type</Lbl>
        <input
          type="text"
          value={data.alert_type}
          disabled
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1.5px solid #d1d5db',
            borderRadius: 8,
            fontSize: 14,
            background: '#f9fafb',
            color: '#9ca3af'
          }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <Lbl>Message Template</Lbl>
        <textarea
          value={data.message_template}
          onChange={(e) => setData({ ...data, message_template: e.target.value })}
          rows={3}
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1.5px solid #d1d5db',
            borderRadius: 8,
            fontSize: 13,
            fontFamily: 'inherit',
            outline: 'none'
          }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <Lbl>Severity</Lbl>
          <select
            value={data.severity}
            onChange={(e) => setData({ ...data, severity: e.target.value })}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1.5px solid #d1d5db',
              borderRadius: 8,
              fontSize: 13
            }}
          >
            <option>critical</option>
            <option>high</option>
            <option>medium</option>
            <option>low</option>
            <option>info</option>
          </select>
        </div>
        <div>
          <Lbl>Threshold</Lbl>
          <input
            type="number"
            value={data.threshold || ''}
            onChange={(e) => setData({ ...data, threshold: e.target.value ? parseFloat(e.target.value) : null })}
            placeholder="Optional"
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1.5px solid #d1d5db',
              borderRadius: 8,
              fontSize: 13,
              outline: 'none'
            }}
          />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={data.enabled}
            onChange={(e) => setData({ ...data, enabled: e.target.checked })}
            style={{ cursor: 'pointer', width: 18, height: 18 }}
          />
          <span style={{ fontSize: 14, color: '#374151' }}>Enabled</span>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <Btn onClick={onClose}>Cancel</Btn>
        <BtnPri onClick={handleSave} style={{ opacity: saving ? 0.6 : 1 }} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </BtnPri>
      </div>
    </div>
  );
}
