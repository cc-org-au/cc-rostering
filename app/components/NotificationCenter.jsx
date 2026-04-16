"use client";
import { useState, useEffect, useRef } from 'react';
import { useNotifications } from '../lib/useNotifications';
import { useAuth } from '../lib/useAuth';
import { Overlay, ModalBox, Lbl, FocusInp, Btn, BtnPri, BtnDanger, Tag, Avatar, SecTitle } from './shared';

export function NotificationCenter() {
  const { user } = useAuth();
  const {
    notifications,
    preferences,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    archiveNotification,
    updatePreferences
  } = useNotifications(user?.id);

  const [showDropdown, setShowDropdown] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [showFullList, setShowFullList] = useState(false);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef(null);

  const NOTIFICATION_TYPES = {
    understaffed_project: { icon: '👥', color: '#f97316', label: 'Roster' },
    double_booking_detected: { icon: '⚠️', color: '#dc2626', label: 'Roster' },
    employee_unavailable_assigned: { icon: '📅', color: '#d97706', label: 'Roster' },
    max_hours_violation: { icon: '⏰', color: '#d97706', label: 'Employee' },
    certification_expiring_soon: { icon: '📜', color: '#d97706', label: 'Employee' },
    leave_conflict: { icon: '🚫', color: '#dc2626', label: 'Leave' },
    leave_request_submitted: { icon: '📋', color: '#3b82f6', label: 'Leave' },
    leave_request_approved: { icon: '✅', color: '#10b981', label: 'Leave' },
    leave_request_denied: { icon: '❌', color: '#dc2626', label: 'Leave' },
    budget_exceeded: { icon: '💰', color: '#dc2626', label: 'Projects' },
    project_completed: { icon: '🎉', color: '#10b981', label: 'Projects' },
    system_backup_complete: { icon: '💾', color: '#6b7280', label: 'System' },
    data_export_ready: { icon: '📥', color: '#6b7280', label: 'System' },
    user_activity_unusual: { icon: '🔍', color: '#dc2626', label: 'System' }
  };

  // Filter notifications
  const filteredNotifications = notifications.filter(n => {
    const matchesFilter = filter === 'all' || (NOTIFICATION_TYPES[n.type]?.label || 'Other') === filter;
    const matchesSearch = searchQuery === '' || 
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.message.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Format time relative
  const formatTime = (date) => {
    const now = new Date();
    const time = new Date(date);
    const diff = now - time;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return time.toLocaleDateString();
  };

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  return (
    <>
      {/* Bell Icon */}
      <div ref={dropdownRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 20,
            position: 'relative',
            padding: '8px 12px'
          }}
          title="Notifications"
        >
          🔔
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute',
              top: 0,
              right: 0,
              background: '#dc2626',
              color: '#fff',
              borderRadius: '50%',
              width: 20,
              height: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 'bold'
            }}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* Dropdown Panel */}
        {showDropdown && (
          <div style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
            width: 420,
            maxHeight: 600,
            zIndex: 100,
            marginTop: 8,
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Header */}
            <div style={{
              padding: '16px 18px',
              borderBottom: '1.5px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                  Notifications
                </div>
                {unreadCount > 0 && (
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    {unreadCount} unread
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {unreadCount > 0 && (
                  <button
                    onClick={() => { markAllAsRead(); setShowDropdown(false); }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#4f46e5',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 500,
                      padding: '4px 8px'
                    }}
                  >
                    Mark all as read
                  </button>
                )}
                <button
                  onClick={() => setShowPreferences(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 16,
                    padding: '4px 8px'
                  }}
                  title="Preferences"
                >
                  ⚙️
                </button>
              </div>
            </div>

            {/* Filter Tabs */}
            <div style={{
              padding: '12px 18px',
              borderBottom: '1.5px solid #e5e7eb',
              display: 'flex',
              gap: 6,
              overflowX: 'auto'
            }}>
              {['All', 'Roster', 'Leave', 'Projects', 'Employee', 'System'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setFilter(tab === 'All' ? 'all' : tab)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: 'none',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                    background: (tab === 'All' ? filter === 'all' : filter === tab) ? '#eef2ff' : 'transparent',
                    color: (tab === 'All' ? filter === 'all' : filter === tab) ? '#4f46e5' : '#6b7280',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Search */}
            <div style={{ padding: '12px 18px', borderBottom: '1.5px solid #e5e7eb' }}>
              <input
                type="text"
                placeholder="Search notifications..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1.5px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 13,
                  outline: 'none'
                }}
              />
            </div>

            {/* Notifications List */}
            <div style={{
              overflowY: 'auto',
              flex: 1,
              minHeight: 0
            }}>
              {loading ? (
                <div style={{ padding: '32px 18px', textAlign: 'center', color: '#9ca3af' }}>
                  Loading...
                </div>
              ) : filteredNotifications.length === 0 ? (
                <div style={{ padding: '32px 18px', textAlign: 'center', color: '#9ca3af' }}>
                  No notifications
                </div>
              ) : (
                filteredNotifications.slice(0, 10).map(notif => {
                  const typeInfo = NOTIFICATION_TYPES[notif.type] || { icon: '📌', color: '#6b7280' };
                  return (
                    <div
                      key={notif.id}
                      onClick={() => {
                        if (!notif.read) markAsRead(notif.id);
                        if (notif.action_url) window.location.href = notif.action_url;
                      }}
                      style={{
                        padding: '12px 18px',
                        borderBottom: '1px solid #f3f4f6',
                        cursor: 'pointer',
                        background: notif.read ? '#fff' : '#f9fafb',
                        transition: 'background 0.2s',
                        display: 'flex',
                        gap: 12,
                        alignItems: 'flex-start'
                      }}
                      onMouseEnter={(e) => { if (!notif.read) e.currentTarget.style.background = '#f0fdf4'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = notif.read ? '#fff' : '#f9fafb'; }}
                    >
                      <div style={{ fontSize: 18, flexShrink: 0, marginTop: 2 }}>
                        {typeInfo.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: '#111827',
                          marginBottom: 2,
                          display: 'flex',
                          gap: 6,
                          alignItems: 'center'
                        }}>
                          {notif.title}
                          {!notif.read && (
                            <div style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: '#4f46e5',
                              flexShrink: 0
                            }} />
                          )}
                        </div>
                        <div style={{
                          fontSize: 12,
                          color: '#6b7280',
                          marginBottom: 4,
                          lineHeight: 1.4
                        }}>
                          {notif.message}
                        </div>
                        <div style={{
                          fontSize: 11,
                          color: '#9ca3af'
                        }}>
                          {formatTime(notif.created_at)}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          archiveNotification(notif.id);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#d1d5db',
                          cursor: 'pointer',
                          fontSize: 14,
                          padding: '4px 6px',
                          flexShrink: 0
                        }}
                        title="Dismiss"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {filteredNotifications.length > 10 && (
              <div style={{
                padding: '12px 18px',
                borderTop: '1.5px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'center'
              }}>
                <button
                  onClick={() => { setShowDropdown(false); setShowFullList(true); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#4f46e5',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 500
                  }}
                >
                  View all notifications
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Preferences Modal */}
      {showPreferences && (
        <Overlay onClose={() => setShowPreferences(false)}>
          <ModalBox>
            <NotificationPreferences
              preferences={preferences}
              onUpdate={updatePreferences}
              onClose={() => setShowPreferences(false)}
            />
          </ModalBox>
        </Overlay>
      )}

      {/* Full List Modal */}
      {showFullList && (
        <Overlay onClose={() => setShowFullList(false)}>
          <ModalBox maxWidth={600}>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: '#111827' }}>
                All Notifications
              </div>
              <div style={{
                display: 'flex',
                gap: 8,
                marginBottom: 16,
                flexWrap: 'wrap'
              }}>
                {['All', 'Roster', 'Leave', 'Projects', 'Employee', 'System'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setFilter(tab === 'All' ? 'all' : tab)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 6,
                      border: 'none',
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: 'pointer',
                      background: (tab === 'All' ? filter === 'all' : filter === tab) ? '#eef2ff' : '#f3f4f6',
                      color: (tab === 'All' ? filter === 'all' : filter === tab) ? '#4f46e5' : '#6b7280'
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Search notifications..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1.5px solid #d1d5db',
                  borderRadius: 8,
                  fontSize: 13,
                  outline: 'none',
                  marginBottom: 16
                }}
              />
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                {filteredNotifications.map(notif => {
                  const typeInfo = NOTIFICATION_TYPES[notif.type] || { icon: '📌', color: '#6b7280' };
                  return (
                    <div
                      key={notif.id}
                      style={{
                        padding: '12px 14px',
                        borderBottom: '1px solid #e5e7eb',
                        background: notif.read ? '#fff' : '#f9fafb',
                        display: 'flex',
                        gap: 12,
                        alignItems: 'flex-start'
                      }}
                    >
                      <div style={{ fontSize: 16, flexShrink: 0 }}>
                        {typeInfo.icon}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: '#111827',
                          marginBottom: 2
                        }}>
                          {notif.title}
                        </div>
                        <div style={{
                          fontSize: 12,
                          color: '#6b7280',
                          marginBottom: 4
                        }}>
                          {notif.message}
                        </div>
                        <div style={{
                          fontSize: 11,
                          color: '#9ca3af'
                        }}>
                          {formatTime(notif.created_at)}
                        </div>
                      </div>
                      <button
                        onClick={() => archiveNotification(notif.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#d1d5db',
                          cursor: 'pointer',
                          fontSize: 14,
                          padding: '4px 6px'
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </ModalBox>
        </Overlay>
      )}
    </>
  );
}

export function NotificationPreferences({ preferences, onUpdate, onClose }) {
  const [settings, setSettings] = useState(preferences || {});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handleSave = async () => {
    try {
      setSaving(true);
      await onUpdate(settings);
      setMessage('Preferences saved successfully');
      setTimeout(() => {
        setMessage('');
        onClose();
      }, 1500);
    } catch (err) {
      setMessage('Error saving preferences');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 20, color: '#111827' }}>
        Notification Preferences
      </div>

      {/* Channels */}
      <div style={{ marginBottom: 24 }}>
        <SecTitle>Notification Channels</SecTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { key: 'in_app_enabled', label: 'In-App Notifications' },
            { key: 'email_enabled', label: 'Email Notifications' },
            { key: 'sms_enabled', label: 'SMS Notifications' }
          ].map(({ key, label }) => (
            <label key={key} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              padding: '8px 0'
            }}>
              <input
                type="checkbox"
                checked={settings[key] || false}
                onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })}
                style={{ cursor: 'pointer', width: 18, height: 18 }}
              />
              <span style={{ fontSize: 14, color: '#374151' }}>{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Quiet Hours */}
      <div style={{ marginBottom: 24 }}>
        <SecTitle>Quiet Hours</SecTitle>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
          padding: '8px 0',
          marginBottom: 12
        }}>
          <input
            type="checkbox"
            checked={settings.quiet_hours_enabled || false}
            onChange={(e) => setSettings({ ...settings, quiet_hours_enabled: e.target.checked })}
            style={{ cursor: 'pointer', width: 18, height: 18 }}
          />
          <span style={{ fontSize: 14, color: '#374151' }}>Enable quiet hours</span>
        </label>
        {settings.quiet_hours_enabled && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Lbl>Start Time</Lbl>
              <input
                type="time"
                value={settings.quiet_hours_start || '22:00'}
                onChange={(e) => setSettings({ ...settings, quiet_hours_start: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '1.5px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 13
                }}
              />
            </div>
            <div>
              <Lbl>End Time</Lbl>
              <input
                type="time"
                value={settings.quiet_hours_end || '08:00'}
                onChange={(e) => setSettings({ ...settings, quiet_hours_end: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '1.5px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 13
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Sound */}
      <div style={{ marginBottom: 24 }}>
        <SecTitle>Sound</SecTitle>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
          padding: '8px 0'
        }}>
          <input
            type="checkbox"
            checked={settings.notification_sounds_enabled || false}
            onChange={(e) => setSettings({ ...settings, notification_sounds_enabled: e.target.checked })}
            style={{ cursor: 'pointer', width: 18, height: 18 }}
          />
          <span style={{ fontSize: 14, color: '#374151' }}>Enable notification sounds</span>
        </label>
      </div>

      {/* Message */}
      {message && (
        <div style={{
          padding: '10px 12px',
          borderRadius: 6,
          marginBottom: 16,
          background: message.includes('Error') ? '#fee2e2' : '#dcfce7',
          color: message.includes('Error') ? '#dc2626' : '#166534',
          fontSize: 13
        }}>
          {message}
        </div>
      )}

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <Btn onClick={onClose}>Cancel</Btn>
        <BtnPri onClick={handleSave} style={{ opacity: saving ? 0.6 : 1 }} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </BtnPri>
      </div>
    </div>
  );
}
