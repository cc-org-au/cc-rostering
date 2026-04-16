# Notifications & Alerts System - Usage Examples & Troubleshooting

## Usage Examples

### Example 1: Display User's Notifications

```jsx
import { useNotifications } from '@/lib/useNotifications';
import { useAuth } from '@/lib/useAuth';

function NotificationsPage() {
  const { user } = useAuth();
  const { notifications, loading, markAsRead, archiveNotification } = useNotifications(user?.id);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1>Your Notifications</h1>
      {notifications.length === 0 ? (
        <p>No notifications</p>
      ) : (
        <ul>
          {notifications.map(n => (
            <li key={n.id}>
              <div>
                <strong>{n.title}</strong>
                <p>{n.message}</p>
                <small>{new Date(n.created_at).toLocaleString()}</small>
              </div>
              <div>
                {!n.read && (
                  <button onClick={() => markAsRead(n.id)}>Mark as read</button>
                )}
                <button onClick={() => archiveNotification(n.id)}>Dismiss</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

### Example 2: Create Custom Alert Trigger

When a leave request is submitted, automatically send alerts to managers:

```jsx
import { triggerAlert, broadcastNotification, findAlertRecipients } from '@/lib/realtimeNotifications';

async function handleLeaveRequestSubmitted(leaveRequest, employee) {
  // Get manager recipients
  const recipients = await findAlertRecipients('leave_request_submitted', ['manager']);

  const alert = {
    type: 'leave_request_submitted',
    title: `Leave Request from ${employee.name}`,
    message: `${employee.name} submitted leave from ${leaveRequest.startDate} to ${leaveRequest.endDate}`,
    severity: 'info',
    relatedEntityId: leaveRequest.id,
    relatedEntityType: 'leave_request',
    actionUrl: `/leave-approvals/${leaveRequest.id}`,
    metadata: {
      employeeId: employee.id,
      leaveRequestId: leaveRequest.id,
      startDate: leaveRequest.startDate,
      endDate: leaveRequest.endDate
    }
  };

  await triggerAlert(alert);
}
```

### Example 3: Update User Preferences

```jsx
import { useNotifications } from '@/lib/useNotifications';

function PreferencesForm() {
  const { preferences, updatePreferences } = useNotifications(user?.id);

  const handleSave = async () => {
    await updatePreferences({
      email_enabled: true,
      sms_enabled: false,
      quiet_hours_enabled: true,
      quiet_hours_start: '22:00',
      quiet_hours_end: '08:00',
      notification_sounds_enabled: true
    });
  };

  return <button onClick={handleSave}>Save Preferences</button>;
}
```

### Example 4: Manual Alert Testing

```javascript
// In browser console or test script
import { testAlertType } from '@/lib/alertScheduler';
import { runAlertEvaluation } from '@/lib/alertScheduler';

// Test a specific alert type
const result1 = await testAlertType('max_hours_violation');
console.log('Test result:', result1);
// Output: { success: true, recipients: 3 }

// Run full evaluation cycle
const result2 = await runAlertEvaluation();
console.log('Full evaluation completed');

// Check multiple alert types
for (const type of ['budget_exceeded', 'double_booking_detected', 'leave_conflict']) {
  const result = await testAlertType(type);
  console.log(`${type}: ${result.success ? 'OK' : 'FAILED'}`);
}
```

### Example 5: Listen for Real-time Notifications

```jsx
import { useEffect } from 'react';
import { subscribeToUserNotifications, showToastNotification } from '@/lib/realtimeNotifications';
import { useToast } from '@/app/components/shared';

function NotificationListener({ userId }) {
  const { add } = useToast();

  useEffect(() => {
    if (!userId) return;

    // Subscribe to real-time notifications
    const unsubscribe = subscribeToUserNotifications(userId, (newNotification) => {
      // Show toast
      add({
        type: 'info',
        title: newNotification.title,
        message: newNotification.message,
        duration: 7000,
        action: newNotification.action_url ? {
          label: 'View',
          onClick: () => window.location.href = newNotification.action_url
        } : null
      });

      // Play sound
      const audio = new Audio('/notification.mp3');
      audio.play().catch(() => {}); // Silently fail on autoplay restrictions
    });

    return unsubscribe;
  }, [userId]);

  return null;
}
```

### Example 6: Toast Notifications in Components

```jsx
import { useToast, ToastContainer } from '@/app/components/shared';

function MyForm() {
  const { toasts, add, remove } = useToast();

  const handleSubmit = async (formData) => {
    try {
      // Perform operation
      const result = await saveData(formData);

      // Show success toast
      add({
        type: 'success',
        title: 'Success',
        message: 'Your data has been saved',
        duration: 3000
      });
    } catch (error) {
      // Show error toast with retry
      add({
        type: 'error',
        title: 'Error',
        message: error.message,
        duration: 0, // Don't auto-dismiss
        action: {
          label: 'Retry',
          onClick: () => handleSubmit(formData)
        }
      });
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit}>
        {/* Form fields */}
      </form>
      <ToastContainer toasts={toasts} onClose={remove} />
    </>
  );
}
```

## Troubleshooting Guide

### Issue: Notifications Not Appearing in Dropdown

**Symptoms:**
- Bell icon shows badge count, but dropdown is empty
- Logs show notifications in database

**Diagnosis Steps:**
1. Check browser console for JavaScript errors
2. Verify Supabase connection: `supabase.auth.getUser()`
3. Check RLS policies: Query `notifications` table directly
4. Check network tab for API calls

**Solutions:**
```javascript
// Debug: Check if fetching notifications
const notifs = await supabase
  .from('notifications')
  .select('*')
  .eq('user_id', userId)
  .limit(10);
console.log('Notifications:', notifs);

// Debug: Check user ID
const { data: { user } } = await supabase.auth.getUser();
console.log('Current user:', user.id);

// Debug: Check RLS policy
// Make sure RLS policy allows this user to read their notifications
```

### Issue: Email Notifications Not Sending

**Symptoms:**
- `notification_logs` shows status: 'failed'
- Error message: "SendGrid API error"

**Diagnosis Steps:**
1. Verify `SENDGRID_API_KEY` is set:
   ```javascript
   console.log('SendGrid configured:', !!process.env.SENDGRID_API_KEY);
   ```

2. Check error message in notification_logs:
   ```sql
   SELECT * FROM notification_logs 
   WHERE channel = 'email' AND status = 'failed'
   ORDER BY created_at DESC LIMIT 5;
   ```

3. Verify sender email is verified in SendGrid dashboard

4. Test SendGrid directly:
   ```javascript
   const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
       'Content-Type': 'application/json'
     },
     body: JSON.stringify({
       personalizations: [{ to: [{ email: 'test@example.com' }] }],
       from: { email: 'noreply@rostering.app' },
       subject: 'Test',
       content: [{ type: 'text/html', value: 'Test email' }]
     })
   });
   console.log('Status:', response.status);
   ```

**Solutions:**
- Set `SENDGRID_API_KEY` in environment
- Verify sender email in SendGrid dashboard
- Check email for typos
- Check SendGrid quota/credits

### Issue: Real-time Notifications Not Working

**Symptoms:**
- New notifications appear only after page refresh
- Realtime subscription not connecting

**Diagnosis Steps:**
1. Check Supabase Realtime status
2. Verify WebSocket connection:
   ```javascript
   // In DevTools Network tab
   // Look for WebSocket connection to supabase
   // Should show "wss://..." URL
   ```

3. Check RLS policy allows real-time:
   ```sql
   -- This should return results
   SELECT * FROM notifications WHERE user_id = auth.uid();
   ```

**Solutions:**
```javascript
// Force reconnect Supabase
supabase.removeAllChannels();

// Check connection status
const status = supabase.getChannels();
console.log('Active channels:', status.length);

// Manually re-subscribe
import { subscribeToUserNotifications } from '@/lib/realtimeNotifications';
const unsubscribe = subscribeToUserNotifications(userId, (notif) => {
  console.log('New notification:', notif);
});
```

### Issue: Alert Scheduler Not Running

**Symptoms:**
- No new alerts in audit log
- `alert_audit_log` table empty

**Diagnosis Steps:**
1. Check if scheduler initialized:
   ```javascript
   import { getSchedulerStatus } from '@/lib/alertScheduler';
   console.log(getSchedulerStatus());
   // Should show: { running: true, lastRun: '...' }
   ```

2. Check browser console for errors

3. Check if app is still running (not navigated away)

**Solutions:**
```javascript
// Manually start scheduler
import { initializeAlertScheduler } from '@/lib/alertScheduler';
const unsubscribe = initializeAlertScheduler(15);

// Manually run evaluation
import { runAlertEvaluation } from '@/lib/alertScheduler';
await runAlertEvaluation();

// Check audit log
const { data } = await supabase
  .from('alert_audit_log')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(10);
console.log('Recent alerts:', data);
```

### Issue: Users Not Receiving Alerts for Their Role

**Symptoms:**
- Managers not getting manager-level alerts
- Admins not getting admin alerts

**Diagnosis Steps:**
1. Check user role in database:
   ```sql
   SELECT id, email, role FROM app_users WHERE id = '...';
   ```

2. Check alert recipient roles:
   ```sql
   SELECT alert_type, recipient_roles FROM alerts_config;
   ```

3. Verify alert triggers for that role:
   ```javascript
   import { findAlertRecipients } from '@/lib/realtimeNotifications';
   const recipients = await findAlertRecipients('budget_exceeded', ['manager']);
   console.log('Recipients:', recipients);
   ```

**Solutions:**
- Update user role in `app_users` table
- Update `recipient_roles` in `alerts_config` for that alert type
- Manually re-trigger alert after role update

### Issue: Quiet Hours Not Working

**Symptoms:**
- Receiving notifications during quiet hours
- Preferences show quiet hours enabled

**Diagnosis Steps:**
1. Check quiet hours in preferences:
   ```sql
   SELECT * FROM notification_preferences WHERE user_id = '...';
   ```

2. Check current time vs quiet hours:
   ```javascript
   const now = new Date();
   const currentTime = now.getHours() * 60 + now.getMinutes();
   console.log('Current time (minutes):', currentTime);
   console.log('Quiet start: 22:00 = 1320');
   console.log('Quiet end: 08:00 = 480');
   ```

**Solutions:**
- Verify user time zone matches server
- Check timezone settings in database
- Test quiet hours with known time:
  ```javascript
  // Temporarily set current time to quiet hours
  // Then trigger alert to verify it's suppressed
  ```

### Issue: High CPU/Memory Usage from Alert Scheduler

**Symptoms:**
- CPU spikes every 15 minutes
- Memory leaks in browser dev tools

**Diagnosis Steps:**
1. Check alert evaluation time:
   ```javascript
   import { runAlertEvaluation } from '@/lib/alertScheduler';
   console.time('evaluation');
   await runAlertEvaluation();
   console.timeEnd('evaluation');
   ```

2. Profile specific checks:
   ```javascript
   import * as alertRules from '@/lib/alertRules';
   console.time('understaffed');
   await alertRules.checkUnderstaffedProjects();
   console.timeEnd('understaffed');
   ```

**Solutions:**
- Increase scheduler interval: `initializeAlertScheduler(30)` for 30 minutes
- Add database indices (already done)
- Implement alert result caching
- Run scheduler in Web Worker (advanced)

### Issue: Duplicate Notifications

**Symptoms:**
- Same alert received multiple times
- Multiple entries in notification_logs

**Diagnosis Steps:**
1. Check if alert is in config multiple times:
   ```sql
   SELECT alert_type, COUNT(*) FROM alerts_config GROUP BY alert_type HAVING COUNT(*) > 1;
   ```

2. Check scheduler running multiple times:
   ```javascript
   import { getSchedulerStatus } from '@/lib/alertScheduler';
   console.log(getSchedulerStatus());
   ```

3. Check for duplicate subscriptions

**Solutions:**
- Remove duplicate alert configs
- Ensure scheduler only initialized once
- Check for multiple app instances
- Add idempotency checks to alert trigger

## Performance Optimization Tips

### 1. Reduce Alert Check Frequency
```javascript
// From 15 minutes to 30 minutes
initializeAlertScheduler(30);
```

### 2. Add Database Caching
```javascript
// Cache alert configs to reduce DB queries
let cachedConfigs = null;
let configsCacheTTL = 60000; // 1 minute

async function getCachedAlertConfig(alertType) {
  const now = Date.now();
  if (!cachedConfigs || now - cachedConfigs.timestamp > configsCacheTTL) {
    cachedConfigs = {
      data: await supabase.from('alerts_config').select('*'),
      timestamp: now
    };
  }
  return cachedConfigs.data.find(c => c.alert_type === alertType);
}
```

### 3. Batch Notifications
```javascript
// Instead of individual notifications, batch them
async function triggerAlertsBatch(alerts) {
  const grouped = {};
  for (const alert of alerts) {
    if (!grouped[alert.type]) grouped[alert.type] = [];
    grouped[alert.type].push(alert);
  }

  for (const [type, typeAlerts] of Object.entries(grouped)) {
    await Promise.all(typeAlerts.map(a => triggerAlert(a)));
  }
}
```

### 4. Implement Notification Deduplication
```javascript
// Don't send duplicate alerts for same entity within time window
const recentAlerts = new Map();

async function triggerAlertDeduped(alert, dedupeWindow = 3600000) {
  const key = `${alert.type}:${alert.relatedEntityId}`;
  const lastTime = recentAlerts.get(key);

  if (lastTime && Date.now() - lastTime < dedupeWindow) {
    console.log('Alert deduped, sent less than 1 hour ago');
    return;
  }

  await triggerAlert(alert);
  recentAlerts.set(key, Date.now());
}
```

