import { supabase } from './supabase';

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE = process.env.TWILIO_PHONE;

// Email notification templates
const EMAIL_TEMPLATES = {
  understaffed_project: {
    subject: 'Alert: Project Understaffed',
    template: ({ projectName, currentCount, requiredCount }) => `
      <h2>${projectName} is Understaffed</h2>
      <p>Current staff: <strong>${currentCount}</strong> / Required: <strong>${requiredCount}</strong></p>
      <p>Please assign additional staff to this project.</p>
    `
  },
  double_booking_detected: {
    subject: 'CRITICAL: Double Booking Detected',
    template: ({ employeeName, project1, project2, dates }) => `
      <h2>Double Booking Alert</h2>
      <p><strong>${employeeName}</strong> is assigned to both:</p>
      <ul>
        <li>${project1}</li>
        <li>${project2}</li>
      </ul>
      <p>Period: ${dates}</p>
      <p>Immediate action required!</p>
    `
  },
  max_hours_violation: {
    subject: 'Alert: Approaching Max Hours',
    template: ({ employeeName, hoursUsed, maxHours, month }) => `
      <h2>Max Hours Warning for ${employeeName}</h2>
      <p>Hours used in ${month}: <strong>${hoursUsed}</strong> / Max: <strong>${maxHours}</strong></p>
      <p>Employee is approaching maximum allowed hours.</p>
    `
  },
  certification_expiring_soon: {
    subject: 'Alert: Certification Expiring Soon',
    template: ({ employeeName, certName, daysRemaining }) => `
      <h2>Certification Expiring Soon</h2>
      <p><strong>${employeeName}</strong>'s ${certName} expires in <strong>${daysRemaining}</strong> days.</p>
      <p>Please arrange renewal if necessary.</p>
    `
  },
  leave_conflict: {
    subject: 'Alert: Leave Request Conflict',
    template: ({ employeeName, leaveStart, leaveEnd }) => `
      <h2>Leave Conflict Detected</h2>
      <p><strong>${employeeName}</strong> has approved leave from ${leaveStart} to ${leaveEnd}.</p>
      <p>But there's an assignment scheduled during this period. Please review.</p>
    `
  },
  budget_exceeded: {
    subject: 'Alert: Project Budget Exceeded',
    template: ({ projectName, budgetLimit, totalSpent, overage }) => `
      <h2>${projectName} Budget Exceeded</h2>
      <p>Budget limit: $${budgetLimit}</p>
      <p>Total spent: $${totalSpent}</p>
      <p>Overage: <strong>$${overage}</strong></p>
      <p>Immediate review required.</p>
    `
  },
  leave_request_submitted: {
    subject: 'Leave Request Submitted',
    template: ({ employeeName, startDate, endDate, reason }) => `
      <h2>New Leave Request</h2>
      <p><strong>${employeeName}</strong> submitted a leave request:</p>
      <ul>
        <li>From: ${startDate}</li>
        <li>To: ${endDate}</li>
        <li>Reason: ${reason}</li>
      </ul>
      <p>Please review and approve/deny as appropriate.</p>
    `
  },
  leave_request_approved: {
    subject: 'Your Leave Request Has Been Approved',
    template: ({ startDate, endDate }) => `
      <h2>Leave Request Approved</h2>
      <p>Your leave request from ${startDate} to ${endDate} has been approved.</p>
      <p>Enjoy your time off!</p>
    `
  },
  leave_request_denied: {
    subject: 'Your Leave Request Has Been Denied',
    template: ({ startDate, endDate, reason }) => `
      <h2>Leave Request Denied</h2>
      <p>Your leave request from ${startDate} to ${endDate} has been denied.</p>
      ${reason ? `<p>Reason: ${reason}</p>` : ''}
    `
  }
};

// SMS notification templates (must be <= 160 chars)
const SMS_TEMPLATES = {
  double_booking_detected: ({ employeeName, dates }) =>
    `ALERT: ${employeeName} has double booking on ${dates}. Immediate action required!`,
  max_hours_violation: ({ employeeName, month }) =>
    `${employeeName} approaching max hours in ${month}. Review assignments.`,
  budget_exceeded: ({ projectName }) =>
    `ALERT: ${projectName} budget exceeded. Immediate review required.`,
  leave_conflict: ({ employeeName, date }) =>
    `ALERT: ${employeeName} has leave on ${date} but scheduled for work. Review.`
};

// Send email via SendGrid
export async function sendEmailNotification(recipient, templateType, data) {
  if (!SENDGRID_API_KEY) {
    console.warn('SendGrid API key not configured');
    return { success: false, error: 'SendGrid not configured' };
  }

  try {
    const template = EMAIL_TEMPLATES[templateType];
    if (!template) {
      throw new Error(`Unknown email template: ${templateType}`);
    }

    const subject = template.subject;
    const htmlContent = template.template(data);

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: recipient }] }],
        from: { email: process.env.SENDGRID_FROM_EMAIL || 'noreply@rostering.app' },
        subject,
        content: [{ type: 'text/html', value: htmlContent }]
      })
    });

    if (!response.ok) {
      throw new Error(`SendGrid API error: ${response.statusText}`);
    }

    return { success: true };
  } catch (err) {
    console.error('Error sending email:', err);
    return { success: false, error: err.message };
  }
}

// Send SMS via Twilio
export async function sendSmsNotification(phoneNumber, templateType, data) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.warn('Twilio credentials not configured');
    return { success: false, error: 'Twilio not configured' };
  }

  try {
    const template = SMS_TEMPLATES[templateType];
    if (!template) {
      throw new Error(`Unknown SMS template: ${templateType}`);
    }

    const message = template(data);

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          From: TWILIO_PHONE,
          To: phoneNumber,
          Body: message
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Twilio API error: ${response.statusText}`);
    }

    return { success: true };
  } catch (err) {
    console.error('Error sending SMS:', err);
    return { success: false, error: err.message };
  }
}

// Send in-app notification via Supabase
export async function sendInAppNotification(userId, notificationData) {
  try {
    const { error } = await supabase
      .from('notifications')
      .insert([{
        user_id: userId,
        type: notificationData.type,
        title: notificationData.title,
        message: notificationData.message,
        related_entity_id: notificationData.relatedEntityId,
        related_entity_type: notificationData.relatedEntityType,
        action_url: notificationData.actionUrl,
        created_at: new Date().toISOString()
      }]);

    if (error) throw error;

    return { success: true };
  } catch (err) {
    console.error('Error sending in-app notification:', err);
    return { success: false, error: err.message };
  }
}

// Process notification delivery based on user preferences
export async function processNotificationDelivery(userId, alert, notificationId) {
  try {
    // Get user preferences
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!prefs) return;

    // Get user details for contact info
    const { data: user } = await supabase
      .from('app_users')
      .select('email')
      .eq('id', userId)
      .single();

    if (!user) return;

    // Check quiet hours
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const quietStart = prefs.quiet_hours_enabled ? parseTimeToMinutes(prefs.quiet_hours_start) : null;
    const quietEnd = prefs.quiet_hours_enabled ? parseTimeToMinutes(prefs.quiet_hours_end) : null;

    const inQuietHours = quietStart && quietEnd && (
      (quietStart < quietEnd && currentTime >= quietStart && currentTime < quietEnd) ||
      (quietStart > quietEnd && (currentTime >= quietStart || currentTime < quietEnd))
    );

    if (inQuietHours) {
      console.log(`User ${userId} is in quiet hours, skipping notifications`);
      return;
    }

    // Send via configured channels
    const deliveryPromises = [];

    if (prefs.in_app_enabled) {
      deliveryPromises.push(
        sendInAppNotification(userId, alert)
          .then(result => ({
            channel: 'in_app',
            status: result.success ? 'sent' : 'failed',
            error: result.error
          }))
      );
    }

    if (prefs.email_enabled && user.email) {
      deliveryPromises.push(
        sendEmailNotification(user.email, alert.type, alert.metadata || {})
          .then(result => ({
            channel: 'email',
            status: result.success ? 'sent' : 'failed',
            error: result.error,
            recipient: user.email
          }))
      );
    }

    if (prefs.sms_enabled && user.phone) {
      deliveryPromises.push(
        sendSmsNotification(user.phone, alert.type, alert.metadata || {})
          .then(result => ({
            channel: 'sms',
            status: result.success ? 'sent' : 'failed',
            error: result.error,
            recipient: user.phone
          }))
      );
    }

    const results = await Promise.all(deliveryPromises);

    // Log delivery attempts
    for (const result of results) {
      await supabase
        .from('notification_logs')
        .insert([{
          notification_id: notificationId,
          channel: result.channel,
          status: result.status,
          recipient: result.recipient,
          sent_at: result.status === 'sent' ? new Date().toISOString() : null,
          error_message: result.error
        }]);
    }
  } catch (err) {
    console.error('Error processing notification delivery:', err);
  }
}

// Helper to parse time string to minutes
function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

// Resend failed notifications
export async function resendFailedNotifications(hoursOld = 1) {
  try {
    const { data: failedLogs } = await supabase
      .from('notification_logs')
      .select('id, notification_id, channel, recipient, retry_count')
      .eq('status', 'failed')
      .lt('created_at', new Date(Date.now() - hoursOld * 60 * 60 * 1000).toISOString())
      .lt('retry_count', 3);

    if (!failedLogs || failedLogs.length === 0) return;

    for (const log of failedLogs) {
      // Get notification details
      const { data: notif } = await supabase
        .from('notifications')
        .select('*')
        .eq('id', log.notification_id)
        .single();

      if (!notif) continue;

      // Retry based on channel
      let result;
      if (log.channel === 'email') {
        result = await sendEmailNotification(log.recipient, notif.type, {});
      } else if (log.channel === 'sms') {
        result = await sendSmsNotification(log.recipient, notif.type, {});
      }

      // Update log
      if (result?.success) {
        await supabase
          .from('notification_logs')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            retry_count: log.retry_count + 1
          })
          .eq('id', log.id);
      } else {
        await supabase
          .from('notification_logs')
          .update({
            retry_count: log.retry_count + 1,
            error_message: result?.error
          })
          .eq('id', log.id);
      }
    }
  } catch (err) {
    console.error('Error resending failed notifications:', err);
  }
}
