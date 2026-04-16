import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from './supabase';

export function useNotifications(userId) {
  const [notifications, setNotifications] = useState([]);
  const [preferences, setPreferences] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const subscriptionRef = useRef(null);

  // Fetch notifications with pagination
  const getNotifications = useCallback(async (limit = 20, offset = 0) => {
    try {
      const { data, error: err } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .eq('archived', false)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (err) throw err;
      return data || [];
    } catch (err) {
      console.error('Error fetching notifications:', err);
      throw err;
    }
  }, [userId]);

  // Fetch user preferences
  const getPreferences = useCallback(async () => {
    try {
      let { data, error: err } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (err && err.code === 'PGRST116') {
        // Preferences don't exist, create default
        const { data: newPref, error: createErr } = await supabase
          .from('notification_preferences')
          .insert([{
            user_id: userId,
            email_enabled: true,
            in_app_enabled: true,
            sms_enabled: false,
            quiet_hours_enabled: false,
            notification_sounds_enabled: true
          }])
          .select()
          .single();

        if (createErr) throw createErr;
        return newPref;
      }

      if (err) throw err;
      return data;
    } catch (err) {
      console.error('Error fetching preferences:', err);
      throw err;
    }
  }, [userId]);

  // Mark single notification as read
  const markAsRead = useCallback(async (notificationId) => {
    try {
      const { error: err } = await supabase
        .from('notifications')
        .update({ read: true, updated_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (err) throw err;

      // Update local state
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Error marking notification as read:', err);
      throw err;
    }
  }, []);

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    try {
      const { error: err } = await supabase
        .from('notifications')
        .update({ read: true, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('read', false);

      if (err) throw err;

      // Update local state
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Error marking all as read:', err);
      throw err;
    }
  }, [userId]);

  // Archive (soft delete) a notification
  const archiveNotification = useCallback(async (notificationId) => {
    try {
      const { error: err } = await supabase
        .from('notifications')
        .update({ archived: true, updated_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (err) throw err;

      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      setUnreadCount(prev => {
        const notif = notifications.find(n => n.id === notificationId);
        return notif && !notif.read ? Math.max(0, prev - 1) : prev;
      });
    } catch (err) {
      console.error('Error archiving notification:', err);
      throw err;
    }
  }, [notifications]);

  // Create a new notification (typically called by server/alert system)
  const createNotification = useCallback(async (data) => {
    try {
      const { error: err } = await supabase
        .from('notifications')
        .insert([{
          user_id: userId,
          type: data.type,
          title: data.title,
          message: data.message,
          related_entity_id: data.relatedEntityId,
          related_entity_type: data.relatedEntityType,
          action_url: data.actionUrl,
          created_at: new Date().toISOString()
        }]);

      if (err) throw err;
    } catch (err) {
      console.error('Error creating notification:', err);
      throw err;
    }
  }, [userId]);

  // Update notification preferences
  const updatePreferences = useCallback(async (updatedSettings) => {
    try {
      const { error: err } = await supabase
        .from('notification_preferences')
        .update({
          ...updatedSettings,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      if (err) throw err;

      setPreferences(prev => ({ ...prev, ...updatedSettings }));
    } catch (err) {
      console.error('Error updating preferences:', err);
      throw err;
    }
  }, [userId]);

  // Subscribe to real-time notification changes
  const subscribeToNotifications = useCallback((callback) => {
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setNotifications(prev => [payload.new, ...prev]);
          setUnreadCount(prev => prev + 1);
          if (callback) callback(payload.new);
        } else if (payload.eventType === 'UPDATE') {
          setNotifications(prev =>
            prev.map(n => n.id === payload.new.id ? payload.new : n)
          );
          if (!payload.old.read && payload.new.read) {
            setUnreadCount(prev => Math.max(0, prev - 1));
          }
        } else if (payload.eventType === 'DELETE') {
          setNotifications(prev => prev.filter(n => n.id !== payload.old.id));
        }
      })
      .subscribe();

    subscriptionRef.current = channel;
    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }
    };
  }, [userId]);

  // Initial load
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoading(true);
        const [notifs, prefs] = await Promise.all([
          getNotifications(50),
          getPreferences()
        ]);

        setNotifications(notifs);
        setPreferences(prefs);
        setUnreadCount(notifs.filter(n => !n.read).length);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      loadInitialData();
      const unsubscribe = subscribeToNotifications();
      return unsubscribe;
    }
  }, [userId, getNotifications, getPreferences, subscribeToNotifications]);

  return {
    notifications,
    preferences,
    unreadCount,
    loading,
    error,
    getNotifications,
    getPreferences,
    markAsRead,
    markAllAsRead,
    archiveNotification,
    createNotification,
    updatePreferences,
    subscribeToNotifications
  };
}
