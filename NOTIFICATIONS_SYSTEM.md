# Notifications & Alerts System - Complete Implementation Guide

## Overview

This comprehensive notifications and alerts system provides:
- Real-time in-app notifications
- Email and SMS alerts (with SendGrid/Twilio integration)
- Configurable alert rules for 30+ alert types
- User notification preferences (channels, quiet hours)
- Notification dashboard and admin panel
- Toast notifications for UI feedback
- Alert audit logging and analytics

## Architecture

### Database Schema

Four main tables plus audit logging:

#### 1. `notification_preferences`
- User notification channel preferences (email, SMS, in-app)
- Quiet hours settings (no notifications between X and Y)
- Sound notification toggle
- **RLS**: Users can only access their own preferences

#### 2. `alerts_config`
- Global alert type definitions
- Enable/disable per alert type
- Message templates
- Recipient roles (admin, manager, dispatcher, employee)
- Severity levels (critical, high, medium, low, info)
- Channels (in_app, email, sms)
- **RLS**: Only admins/managers can view/edit

#### 3. `notifications`
- Individual notification records
- User ID, type, title, message
- Related entity tracking (project_id, employee_id, etc.)
- Read/archived status
- **RLS**: Users see only their own notifications

#### 4. `notification_logs`
- Delivery tracking for each notification
- Channel used (email, sms, in_app)
- Status (pending, sent, failed, bounced)
- Retry count and error messages
- **RLS**: Admins/managers can view

#### 5. `alert_audit_log`
- Complete audit trail of all alert triggers
- Alert type and reason
- Number of users notified
- Success/failure tracking
- Error messages for debugging

## Alert Types Catalog (30+)

### Roster Alerts
- **understaffed_project**: Project has fewer staff than required (threshold: 3)
- **double_booking_detected**: Employee assigned to multiple projects (severity: critical)
- **employee_unavailable_assigned**: Employee marked unavailable but has assignment
- **skill_mismatch**: Employee lacks required skill for project

### Employee Alerts
- **max_hours_violation**: Approaching or exceeding monthly hour limit (threshold: 80%)
- **certification_expiring_soon**: Certification expires within 30 days
- **available_capacity_flagged**: Employee availability changes

### Leave Alerts
- **leave_conflict**: Approved leave conflicts with assignment
- **leave_request_submitted**: New leave request (to managers)
- **leave_request_approved**: Leave request approved (to employee)
- **leave_request_denied**: Leave request denied (to employee)

### Project Alerts
- **budget_exceeded**: Project spending exceeds budget (severity: high)
- **timeline_at_risk**: Project approaching deadline without completion
- **project_completed**: Project marked complete

### System Alerts
- **system_backup_complete**: Database backup finished
- **data_export_ready**: User's data export available for download
- **user_activity_unusual**: Suspicious user activity detected
- **roster_approval_pending**: Monthly roster waiting for approval

## Component Structure

### Components

#### NotificationCenter (`app/components/NotificationCenter.jsx`)
Main UI component featuring:
- Bell icon with unread badge in header
- Dropdown panel (10 recent notifications)
- Filter tabs (All, Roster, Leave, Projects, Employee, System)
- Search functionality
- "Mark all as read" and "View all" links
- Settings button → preferences modal

**Usage:**
```jsx
import { NotificationCenter } from '@/app/components/NotificationCenter';

export function Header() {
  return (
    <header>
      {/* Other header items */}
      <NotificationCenter />
    </header>
  );
}
```

#### NotificationAdminDashboard (`app/components/NotificationAdminDashboard.jsx`)
Admin interface for managing alerts:
- Alert type configuration (enable/disable, edit templates)
- Audit log viewer (search, filter, export)
- Delivery statistics (success rate, sent/failed counts)
- Manual alert testing

**Usage:**
```jsx
import { NotificationAdminDashboard } from '@/app/components/NotificationAdminDashboard';

// In admin settings page
<NotificationAdminDashboard />
```

### Hooks

#### useNotifications (`lib/useNotifications.js`)
Main hook for managing notifications:

```jsx
const {
  notifications,      // Array of notification objects
  preferences,        // User's notification preferences
  unreadCount,        // Number of unread notifications
  loading,            // Loading state
  error,              // Error if any
  getNotifications,   // async (limit, offset) - fetch paginated
  getPreferences,     // async - fetch user preferences
  markAsRead,         // async (notificationId)
  markAllAsRead,      // async
  archiveNotification,// async (notificationId) - soft delete
  createNotification, // async (notificationData)
  updatePreferences,  // async (settings)
  subscribeToNotifications // (callback) - real-time subscription
} = useNotifications(userId);
```

**Example:**
```jsx
import { useNotifications } from '@/lib/useNotifications';

function MyNotifications() {
  const { notifications, unreadCount, markAsRead } = useNotifications(user.id);

  return (
    <div>
      <h2>Notifications ({unreadCount})</h2>
      {notifications.map(n => (
        <div key={n.id} onClick={() => markAsRead(n.id)}>
          {n.title}: {n.message}
        </div>
      ))}
    </div>
  );
}
```

### Services

#### Alert Rules Engine (`lib/alertRules.js`)
Evaluates conditions and generates alerts:

```javascript
// Individual check functions
checkUnderstaffedProjects()    // Returns array of understaffed project alerts
checkDoubleBooking()            // Returns array of double booking alerts
checkMaxHoursViolation(year, month)  // Returns max hours alerts
checkCertificationExpiry(daysThreshold)
checkLeaveConflicts()
checkSkillMismatch()
checkBudgetOverrun()

// Batch evaluation
evaluateAllAlerts() // Runs all checks and returns combined alerts
```

#### Real-time Notifications (`lib/realtimeNotifications.js`)
Handles alert broadcasting and user subscriptions:

```javascript
triggerAlert(alert)                     // Broadcast alert to all recipients
broadcastNotification(userIds, alert)   // Send to specific users
subscribeToUserNotifications(userId, callback)  // Real-time user stream
findAlertRecipients(alertType, roles)   // Get user IDs for roles
getAlertConfig(alertType)               // Get alert settings
showToastNotification(notif, context)   // Display toast
playNotificationSound()                 // Play audio alert
```

#### Notification Delivery (`lib/notificationDelivery.js`)
Sends notifications via multiple channels:

```javascript
sendEmailNotification(recipient, templateType, data)
sendSmsNotification(phoneNumber, templateType, data)
sendInAppNotification(userId, notificationData)
processNotificationDelivery(userId, alert, notificationId)  // Smart routing
resendFailedNotifications(hoursOld)     // Retry failed deliveries
```

#### Alert Scheduler (`lib/alertScheduler.js`)
Manages periodic alert evaluation:

```javascript
initializeAlertScheduler(intervalMinutes)  // Start 15-min scheduler
runAlertEvaluation()                       // Manual run
testAlertType(alertType)                   // Send test alert
cleanupOldAuditLogs(daysToKeep)            // Archive old logs
getSchedulerStatus()                       // Get scheduler info
```

### Toast System (Extended shared.jsx)

```jsx
import { useToast, Toast, ToastContainer } from '@/app/components/shared';

function MyComponent() {
  const { toasts, add, remove } = useToast();

  const showSuccess = () => {
    add({
      id: 'success-1',
      type: 'success',
      title: 'Operation Successful',
      message: 'Your changes have been saved',
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: () => console.log('Undo clicked')
      }
    });
  };

  return (
    <>
      <button onClick={showSuccess}>Show Toast</button>
      <ToastContainer toasts={toasts} onClose={remove} />
    </>
  );
}
```

## Integration Guide

### 1. Setup Database Schema

Run the migration in Supabase SQL editor:

```bash
# In supabase/schema.sql (already included - just run with Supabase CLI)
supabase db push
```

### 2. Add NotificationCenter to Header

```jsx
// app/components/Header.jsx
import { NotificationCenter } from './NotificationCenter';
import { useAuth } from '@/lib/useAuth';

export function Header() {
  const { user } = useAuth();

  return (
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <h1>Rostering App</h1>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        {user && <NotificationCenter />}
        {/* Other header items */}
      </div>
    </header>
  );
}
```

### 3. Initialize Alert Scheduler (in App Root)

```jsx
// app/RosterApp.jsx
import { initializeAlertScheduler } from '@/lib/alertScheduler';
import { useEffect } from 'react';

export default function RosterApp() {
  useEffect(() => {
    // Start alert scheduler - runs every 15 minutes
    const unsubscribe = initializeAlertScheduler(15);

    // Cleanup on unmount
    return () => {
      unsubscribe?.();
    };
  }, []);

  return (
    // App components
  );
}
```

### 4. Configure Environment Variables

Add to `.env.local`:

```bash
# SendGrid Email Configuration
SENDGRID_API_KEY=your_sendgrid_api_key
SENDGRID_FROM_EMAIL=noreply@rostering.app

# Twilio SMS Configuration (optional)
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE=+1234567890
```

### 5. Add Admin Dashboard to Settings

```jsx
// In admin settings page
import { NotificationAdminDashboard } from '@/app/components/NotificationAdminDashboard';

export function AdminSettings() {
  return (
    <div>
      <h2>Alert Management</h2>
      <NotificationAdminDashboard />
    </div>
  );
}
```

## Manual Testing

### Test Individual Alerts

```javascript
import { testAlertType } from '@/lib/alertScheduler';

// In browser console or test function
const result = await testAlertType('max_hours_violation');
console.log(result); // { success: true, recipients: 3 }
```

### Trigger Specific Alert Type

```javascript
import { triggerAlert } from '@/lib/realtimeNotifications';

const alert = {
  type: 'budget_exceeded',
  title: 'Project Budget Exceeded',
  message: 'Project "Website Redesign" budget exceeded by $5,000',
  severity: 'high',
  relatedEntityId: 'proj-123',
  relatedEntityType: 'project',
  metadata: { projectId: 'proj-123', overage: 5000 }
};

await triggerAlert(alert);
```

### Test Email Delivery

```javascript
import { sendEmailNotification } from '@/lib/notificationDelivery';

const result = await sendEmailNotification(
  'user@example.com',
  'budget_exceeded',
  { projectName: 'Test', budgetLimit: 10000, totalSpent: 12000 }
);
```

### Check Scheduler Status

```javascript
import { getSchedulerStatus } from '@/lib/alertScheduler';

console.log(getSchedulerStatus());
// { running: true, lastRun: '2026-04-16T10:30:00Z' }
```

## Performance Considerations

### 1. Alert Evaluation Frequency
- Runs every **15 minutes** (configurable)
- Staggered evaluation of different check types
- Caching of alert configurations in memory

### 2. Database Optimization
- **Indices** on frequently queried columns:
  - `notifications(user_id, created_at)`
  - `notifications(user_id, read)`
  - `alert_audit_log(alert_type, created_at)`
  - `notification_logs(status, created_at)`

### 3. Real-time Subscription Strategy
- Supabase Realtime with postgres_changes filter
- Per-user channels to avoid broadcast overhead
- Automatic cleanup on component unmount

### 4. Delivery Queue
- Failed notifications retry up to 3 times
- Background processing without blocking UI
- Quiet hours respected to avoid spam

### 5. Scalability
- Batch notification insertion (multiple users at once)
- Cleanup jobs for old logs (90-day audit, 30-day delivery logs)
- Notification aggregation (combine similar alerts)

## Email Template Examples

### Budget Exceeded
```html
<h2>Project Budget Alert</h2>
<p><strong>Project:</strong> Website Redesign</p>
<p><strong>Budget:</strong> $10,000</p>
<p><strong>Spent:</strong> $12,000</p>
<p><strong>Overage:</strong> $2,000</p>
<p>
  <a href="https://app.rostering.app/projects/proj-123">
    View Project Details
  </a>
</p>
```

### Leave Request Submitted
```html
<h2>New Leave Request</h2>
<p><strong>Employee:</strong> John Smith</p>
<ul>
  <li><strong>From:</strong> May 1, 2026</li>
  <li><strong>To:</strong> May 5, 2026</li>
  <li><strong>Type:</strong> Annual Leave</li>
  <li><strong>Reason:</strong> Family vacation</li>
</ul>
<p>
  <a href="https://app.rostering.app/leave-approvals/req-123">
    Review Request
  </a>
</p>
```

## SMS Template Examples

```
⚠️ ALERT: Sarah Johnson has double booking on May 15. Immediate action required!

Employee Sarah approaching max hours in May (152/160h). Review assignments.

🚨 Project "Website Redesign" budget exceeded by $2,000. Immediate review needed.
```

## Troubleshooting

### Notifications Not Appearing
1. Check `notification_preferences` - ensure `in_app_enabled = true`
2. Verify user has permission to view notifications (RLS policy)
3. Check browser console for JavaScript errors
4. Verify Supabase connection is active

### Email Not Sending
1. Verify `SENDGRID_API_KEY` is set in environment
2. Check `notification_logs` table for error message
3. Verify recipient email format is valid
4. Check SendGrid dashboard for bounces

### Real-time Updates Not Working
1. Verify Supabase Realtime is enabled
2. Check network tab for WebSocket connection
3. Ensure user has read permission on notifications table
4. Clear browser cache and reconnect

### Alert Scheduler Not Running
1. Check browser console for errors
2. Verify `initializeAlertScheduler()` was called
3. Check `alert_audit_log` for recent entries
4. Call `getSchedulerStatus()` to verify running state

## Files Created

### New Database Schema
- `supabase/schema.sql` - Updated with notification tables and RLS policies

### React Components
- `app/components/NotificationCenter.jsx` - Main notification UI
- `app/components/NotificationPreferences.jsx` - User settings modal (in NotificationCenter)
- `app/components/NotificationAdminDashboard.jsx` - Admin alert management

### JavaScript Libraries
- `lib/useNotifications.js` - React hook for notification management
- `lib/alertRules.js` - Alert evaluation engine (8 check functions)
- `lib/alertScheduler.js` - Periodic scheduler and testing utilities
- `lib/realtimeNotifications.js` - Real-time subscription and broadcasting
- `lib/notificationDelivery.js` - Email/SMS/in-app delivery routing

### Extended Components
- `app/components/shared.jsx` - Added toast system (`useToast`, `Toast`, `ToastContainer`)

## Next Steps

1. **Run database migration** - Push schema.sql to Supabase
2. **Configure SendGrid** - Add API key to environment
3. **Configure Twilio** (optional) - For SMS alerts
4. **Add NotificationCenter** to app header
5. **Initialize scheduler** in app root component
6. **Add admin dashboard** to settings page
7. **Test alert types** manually via test function
8. **Monitor audit logs** for issues

## Support & Maintenance

- Monitor `alert_audit_log` for failures
- Review `notification_logs` for delivery issues
- Periodic cleanup of old logs (included in scheduler)
- Adjust alert thresholds based on business needs
- Test new alert types before enabling in production

