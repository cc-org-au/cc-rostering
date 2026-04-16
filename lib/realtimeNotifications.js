import { supabase } from './supabase';
import { processNotificationDelivery } from './notificationDelivery';

let realtimeSubscriptions = {};

// Subscribe to alert triggers and broadcast notifications
export function subscribeToAlertTriggers(callback) {
  const channel = supabase
    .channel('alert_triggers')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'alerts_config'
    }, (payload) => {
      if (callback) callback(payload);
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// Broadcast notification to specific user(s)
export async function broadcastNotification(userIds, alert) {
  try {
    // If not array, make it array
    const targetUsers = Array.isArray(userIds) ? userIds : [userIds];

    const notificationInserts = targetUsers.map(userId => ({
      user_id: userId,
      type: alert.type,
      title: alert.title,
      message: alert.message,
      related_entity_id: alert.relatedEntityId,
      related_entity_type: alert.relatedEntityType,
      action_url: alert.actionUrl,
      created_at: new Date().toISOString()
    }));

    const { data: createdNotifications, error: insertErr } = await supabase
      .from('notifications')
      .insert(notificationInserts)
      .select();

    if (insertErr) throw insertErr;

    // Process delivery for each notification
    for (let i = 0; i < createdNotifications.length; i++) {
      const userId = targetUsers[i];
      const notifId = createdNotifications[i].id;
      await processNotificationDelivery(userId, alert, notifId);
    }

    // Log to audit
    await supabase
      .from('alert_audit_log')
      .insert([{
        alert_type: alert.type,
        trigger_reason: alert.title,
        triggered_count: targetUsers.length,
        user_ids: targetUsers,
        notification_ids: createdNotifications.map(n => n.id),
        metadata: alert.metadata || {},
        success: true
      }]);

    return { success: true, notificationIds: createdNotifications.map(n => n.id) };
  } catch (err) {
    console.error('Error broadcasting notification:', err);

    // Log failure
    await supabase
      .from('alert_audit_log')
      .insert([{
        alert_type: alert.type,
        trigger_reason: alert.title,
        triggered_count: Array.isArray(userIds) ? userIds.length : 1,
        user_ids: Array.isArray(userIds) ? userIds : [userIds],
        success: false,
        error_message: err.message
      }]);

    return { success: false, error: err.message };
  }
}

// Find recipients for an alert based on roles
export async function findAlertRecipients(alertType, recipientRoles) {
  try {
    if (!recipientRoles || recipientRoles.length === 0) {
      return [];
    }

    const { data: users } = await supabase
      .from('app_users')
      .select('id')
      .in('role', recipientRoles);

    return (users || []).map(u => u.id);
  } catch (err) {
    console.error('Error finding alert recipients:', err);
    return [];
  }
}

// Get alert configuration
export async function getAlertConfig(alertType) {
  try {
    const { data, error } = await supabase
      .from('alerts_config')
      .select('*')
      .eq('alert_type', alertType)
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error getting alert config:', err);
    return null;
  }
}

// Trigger alert if enabled
export async function triggerAlert(alert) {
  try {
    // Get alert config
    const config = await getAlertConfig(alert.type);

    if (!config || !config.enabled) {
      console.log(`Alert ${alert.type} is disabled`);
      return { success: false, reason: 'alert_disabled' };
    }

    // Find recipients
    const recipients = await findAlertRecipients(alert.type, config.recipient_roles);

    if (recipients.length === 0) {
      console.log(`No recipients found for alert ${alert.type}`);
      return { success: false, reason: 'no_recipients' };
    }

    // Broadcast notification
    const result = await broadcastNotification(recipients, alert);

    return result;
  } catch (err) {
    console.error('Error triggering alert:', err);
    return { success: false, error: err.message };
  }
}

// Subscribe to user notification changes (real-time)
export function subscribeToUserNotifications(userId, onNewNotification) {
  const channelName = `user_notifications_${userId}`;

  if (realtimeSubscriptions[channelName]) {
    supabase.removeChannel(realtimeSubscriptions[channelName]);
  }

  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${userId}`
    }, (payload) => {
      if (onNewNotification) {
        onNewNotification(payload.new);
      }
    })
    .subscribe();

  realtimeSubscriptions[channelName] = channel;

  return () => {
    if (realtimeSubscriptions[channelName]) {
      supabase.removeChannel(realtimeSubscriptions[channelName]);
      delete realtimeSubscriptions[channelName];
    }
  };
}

// Show toast notification in browser (requires toast context)
export function showToastNotification(notification, toastContext) {
  if (!toastContext) return;

  const toastData = {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    duration: 5000,
    action: notification.action_url ? {
      label: 'View',
      onClick: () => window.location.href = notification.action_url
    } : null
  };

  if (toastContext.add) {
    toastContext.add(toastData);
  }

  // Play sound if enabled
  playNotificationSound();
}

// Play notification sound
export function playNotificationSound() {
  try {
    const audioUrl = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==';
    const audio = new Audio(audioUrl);
    audio.play().catch(() => {
      // Silent if browser doesn't allow audio
    });
  } catch (err) {
    // Silently fail if audio not supported
  }
}

// Get notification summary stats
export async function getNotificationStats(userId) {
  try {
    const { data: allNotifs } = await supabase
      .from('notifications')
      .select('read, type')
      .eq('user_id', userId)
      .eq('archived', false);

    if (!allNotifs) {
      return {
        total: 0,
        unread: 0,
        byType: {}
      };
    }

    const unread = allNotifs.filter(n => !n.read).length;
    const byType = {};

    for (const notif of allNotifs) {
      byType[notif.type] = (byType[notif.type] || 0) + 1;
    }

    return {
      total: allNotifs.length,
      unread,
      byType
    };
  } catch (err) {
    console.error('Error getting notification stats:', err);
    return { total: 0, unread: 0, byType: {} };
  }
}

// Cleanup old notifications (archive older than days)
export async function cleanupOldNotifications(userId, daysOld = 30) {
  try {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from('notifications')
      .update({ archived: true })
      .eq('user_id', userId)
      .lt('created_at', cutoffDate);

    if (error) throw error;

    return { success: true };
  } catch (err) {
    console.error('Error cleaning up old notifications:', err);
    return { success: false, error: err.message };
  }
}
