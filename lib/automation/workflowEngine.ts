export interface AutomationWorkflow {
  id: string;
  name: string;
  trigger_type: string;
  trigger_config: Record<string, any>;
  conditions: any[];
  actions: any[];
  enabled: boolean;
}

export interface WorkflowTrigger {
  type: string;
  config: Record<string, any>;
}

export interface WorkflowAction {
  type: string;
  config: Record<string, any>;
}

export const TRIGGER_TYPES = {
  COVERAGE_GAP: 'coverage_gap',
  SHIFT_CREATED: 'shift_created',
  EMPLOYEE_CLOCKED_IN: 'employee_clocked_in',
  EMPLOYEE_CLOCKED_OUT: 'employee_clocked_out',
  TIMESHEET_SUBMITTED: 'timesheet_submitted',
  RULE_VIOLATION: 'rule_violation',
  PAYROLL_RUN_CREATED: 'payroll_run_created',
} as const;

export const ACTION_TYPES = {
  SEND_EMAIL: 'send_email',
  SEND_SMS: 'send_sms',
  SEND_SLACK: 'send_slack',
  AUTO_ASSIGN: 'auto_assign',
  FLAG_FOR_REVIEW: 'flag_for_review',
  UPDATE_STATUS: 'update_status',
  TRIGGER_WEBHOOK: 'trigger_webhook',
} as const;

export interface WorkflowExecutionContext {
  trigger: WorkflowTrigger;
  data: Record<string, any>;
  timestamp: string;
}

export class WorkflowEngine {
  async executeWorkflow(workflow: AutomationWorkflow, context: WorkflowExecutionContext): Promise<boolean> {
    if (!workflow.enabled) return false;

    // Check conditions
    for (const condition of workflow.conditions) {
      if (!this.evaluateCondition(condition, context.data)) {
        return false;
      }
    }

    // Execute actions
    for (const action of workflow.actions) {
      await this.executeAction(action, context);
    }

    return true;
  }

  private evaluateCondition(condition: any, data: Record<string, any>): boolean {
    const { field, operator, value } = condition;

    if (!field || !(field in data)) return true;

    const fieldValue = data[field];

    switch (operator) {
      case 'equals':
        return fieldValue === value;
      case 'not_equals':
        return fieldValue !== value;
      case 'greater_than':
        return fieldValue > value;
      case 'less_than':
        return fieldValue < value;
      case 'contains':
        return String(fieldValue).includes(String(value));
      case 'in_array':
        return Array.isArray(value) && value.includes(fieldValue);
      default:
        return true;
    }
  }

  private async executeAction(action: any, context: WorkflowExecutionContext): Promise<void> {
    const { type, config } = action;

    switch (type) {
      case ACTION_TYPES.SEND_EMAIL:
        await this.sendEmail(config, context.data);
        break;
      case ACTION_TYPES.SEND_SLACK:
        await this.sendSlack(config, context.data);
        break;
      case ACTION_TYPES.AUTO_ASSIGN:
        await this.autoAssign(config, context.data);
        break;
      case ACTION_TYPES.FLAG_FOR_REVIEW:
        await this.flagForReview(config, context.data);
        break;
      case ACTION_TYPES.UPDATE_STATUS:
        await this.updateStatus(config, context.data);
        break;
      default:
        console.log(`Unknown action type: ${type}`);
    }
  }

  private async sendEmail(config: any, data: Record<string, any>): Promise<void> {
    console.log(`📧 Sending email to ${config.recipients}: ${config.subject}`);
    // TODO: Integrate with email service (SendGrid, Mailgun, etc.)
  }

  private async sendSlack(config: any, data: Record<string, any>): Promise<void> {
    console.log(`💬 Posting to Slack: ${config.message}`);
    // TODO: Integrate with Slack API
  }

  private async autoAssign(config: any, data: Record<string, any>): Promise<void> {
    console.log(`🤖 Auto-assigning shift ${data.shift_id} based on rules`);
    // TODO: Call AI scheduler
  }

  private async flagForReview(config: any, data: Record<string, any>): Promise<void> {
    console.log(`🚩 Flagging for review: ${config.reason}`);
    // TODO: Create review task
  }

  private async updateStatus(config: any, data: Record<string, any>): Promise<void> {
    console.log(`📝 Updating ${config.entity_type} status to ${config.status}`);
    // TODO: Update database
  }
}

// Predefined workflow templates
export const WORKFLOW_TEMPLATES = {
  COVERAGE_GAP_ALERT: {
    name: 'Coverage Gap Alert',
    trigger_type: TRIGGER_TYPES.COVERAGE_GAP,
    trigger_config: { gap_threshold: 2 },
    conditions: [],
    actions: [
      {
        type: ACTION_TYPES.SEND_EMAIL,
        config: { recipients: ['manager@example.com'], subject: 'Coverage Gap Alert' },
      },
      {
        type: ACTION_TYPES.SEND_SLACK,
        config: { channel: '#scheduling', message: 'Coverage gap detected for {{project}}' },
      },
    ],
  },

  LATE_CLOCK_IN_FLAG: {
    name: 'Late Clock In Alert',
    trigger_type: TRIGGER_TYPES.EMPLOYEE_CLOCKED_IN,
    trigger_config: { check_scheduled_time: true },
    conditions: [
      { field: 'clock_in_minutes_late', operator: 'greater_than', value: 5 },
    ],
    actions: [
      {
        type: ACTION_TYPES.FLAG_FOR_REVIEW,
        config: { reason: 'Employee clocked in late' },
      },
    ],
  },

  AUTO_SCHEDULE_OPEN_SHIFTS: {
    name: 'Auto Schedule Open Shifts',
    trigger_type: TRIGGER_TYPES.COVERAGE_GAP,
    trigger_config: { gap_threshold: 1 },
    conditions: [],
    actions: [
      {
        type: ACTION_TYPES.AUTO_ASSIGN,
        config: { use_ai: true, strategy: 'skill_match' },
      },
    ],
  },

  PAYROLL_COMPLETION_EMAIL: {
    name: 'Payroll Completion Notification',
    trigger_type: TRIGGER_TYPES.PAYROLL_RUN_CREATED,
    trigger_config: {},
    conditions: [],
    actions: [
      {
        type: ACTION_TYPES.SEND_EMAIL,
        config: { recipients: ['accounting@example.com'], subject: 'New Payroll Run Ready' },
      },
    ],
  },
};
