import { evaluateAllAlerts } from './alertRules';
import { triggerAlert } from './realtimeNotifications';
import { findAlertRecipients, getAlertConfig } from './realtimeNotifications';
import { supabase } from './supabase';

let alertScheduler = null;

// Initialize alert scheduler (runs every 15 minutes)
export function initializeAlertScheduler(intervalMinutes = 15) {
  if (alertScheduler) {
    clearInterval(alertScheduler);
  }

  console.log(`Starting alert scheduler - running every ${intervalMinutes} minutes`);

  // Run immediately
  runAlertEvaluation();

  // Run on interval
  alertScheduler = setInterval(() => {
    runAlertEvaluation();
  }, intervalMinutes * 60 * 1000);

  return () => {
    if (alertScheduler) {
      clearInterval(alertScheduler);
      alertScheduler = null;
    }
  };
}

// Run all alert evaluations
export async function runAlertEvaluation() {
  try {
    console.log('[Alert Scheduler] Running alert evaluation at', new Date().toISOString());

    const alerts = await evaluateAllAlerts();

    if (alerts.length === 0) {
      console.log('[Alert Scheduler] No alerts triggered');
      return;
    }

    console.log(`[Alert Scheduler] ${alerts.length} alerts triggered`);

    // Process each alert
    for (const alert of alerts) {
      await triggerAlert(alert);
    }
  } catch (err) {
    console.error('[Alert Scheduler] Error during evaluation:', err);

    // Log error
    await supabase
      .from('alert_audit_log')
      .insert([{
        alert_type: 'scheduler_error',
        trigger_reason: 'Alert evaluation failed',
        triggered_count: 0,
        success: false,
        error_message: err.message
      }]).catch(e => console.error('Failed to log scheduler error:', e));
  }
}

// Stop the scheduler
export function stopAlertScheduler() {
  if (alertScheduler) {
    clearInterval(alertScheduler);
    alertScheduler = null;
    console.log('[Alert Scheduler] Stopped');
  }
}

// Manual trigger for testing
export async function testAlertType(alertType) {
  try {
    const config = await getAlertConfig(alertType);

    if (!config) {
      return { success: false, error: `Alert type ${alertType} not found` };
    }

    const recipients = await findAlertRecipients(alertType, config.recipient_roles);

    const testAlert = {
      type: alertType,
      title: `TEST: ${config.message_template}`,
      message: `This is a test notification for ${alertType}`,
      severity: config.severity,
      metadata: { isTest: true }
    };

    const result = await triggerAlert(testAlert);

    return { success: result.success, recipients: recipients.length };
  } catch (err) {
    console.error('Error testing alert:', err);
    return { success: false, error: err.message };
  }
}

// Cleanup old audit logs (keep last 90 days)
export async function cleanupOldAuditLogs(daysToKeep = 90) {
  try {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from('alert_audit_log')
      .delete()
      .lt('created_at', cutoffDate);

    if (error) throw error;

    console.log(`[Alert Scheduler] Cleaned up audit logs older than ${daysToKeep} days`);
  } catch (err) {
    console.error('[Alert Scheduler] Error cleaning up logs:', err);
  }
}

// Cleanup old notification logs (keep last 30 days)
export async function cleanupOldNotificationLogs(daysToKeep = 30) {
  try {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from('notification_logs')
      .delete()
      .lt('created_at', cutoffDate);

    if (error) throw error;

    console.log(`[Alert Scheduler] Cleaned up notification logs older than ${daysToKeep} days`);
  } catch (err) {
    console.error('[Alert Scheduler] Error cleaning up notification logs:', err);
  }
}

// Get scheduler status
export function getSchedulerStatus() {
  return {
    running: alertScheduler !== null,
    lastRun: new Date().toISOString()
  };
}
