import Anthropic from '@anthropic-ai/sdk';

interface Shift {
  id: string;
  project_id: string;
  date: string;
  start_time: string;
  end_time: string;
  role: string;
  required_skills: string[];
  budget_hours: number;
  required_count: number;
}

interface Employee {
  id: string;
  name: string;
  availability: Record<string, boolean>;
  strengths: string[];
  certifications: string[];
  max_hours_per_month: number;
}

interface ConstraintViolation {
  type: string;
  detail: string;
}

export interface SchedulingSuggestion {
  shift_id: string;
  employee_id: string;
  confidence: number;
  reason: string;
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function generateSchedulingSuggestions(
  shifts: Shift[],
  employees: Employee[],
  existingAssignments: Record<string, string[]>
): Promise<{ suggestions: SchedulingSuggestion[]; violations: ConstraintViolation[] }> {
  const openShifts = shifts.filter((s) => {
    const assigned = existingAssignments[s.id] || [];
    return assigned.length < s.required_count;
  });

  if (openShifts.length === 0) {
    return { suggestions: [], violations: [] };
  }

  const prompt = `You are an expert workforce scheduling algorithm. Your task is to suggest employee assignments for open shifts.

OPEN SHIFTS:
${openShifts
  .map(
    (s) =>
      `- Shift ${s.id}: ${s.date} ${s.start_time}-${s.end_time} (Project: ${s.project_id}, Role: ${s.role}, Required: ${s.required_count}, Skills: ${s.required_skills.join(', ') || 'None'})`
  )
  .join('\n')}

AVAILABLE EMPLOYEES:
${employees
  .map(
    (e) =>
      `- ${e.name} (ID: ${e.id}): Max ${e.max_hours_per_month}h/month, Skills: [${e.strengths.join(', ') || 'None'}], Certs: [${e.certifications.join(', ') || 'None'}], Availability: ${JSON.stringify(e.availability)}`
  )
  .join('\n')}

CURRENT ASSIGNMENTS:
${Object.entries(existingAssignments)
  .map(
    ([shiftId, empIds]) =>
      `- Shift ${shiftId}: ${empIds.length} assigned (${empIds.join(', ')})`
  )
  .join('\n')}

CONSTRAINTS:
1. Respect employee availability (day of week constraints)
2. Prioritize employees with required skills
3. Balance workload across team members
4. Prefer employees with matching certifications
5. Do not exceed individual max_hours_per_month
6. Ensure shifts meet required_count

Suggest the best employee assignments. For each suggestion, provide:
- shift_id
- employee_id  
- confidence (0.0-1.0)
- reason (brief explanation)

Output ONLY valid JSON array like:
[
  {"shift_id":"s1","employee_id":"e1","confidence":0.95,"reason":"Has required First Aid cert"},
  {"shift_id":"s2","employee_id":"e2","confidence":0.85,"reason":"Available and matches role skills"}
]

If no good matches, return empty array [].`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return { suggestions: [], violations: [] };
    }

    // Parse Claude's JSON response
    const jsonMatch = content.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return { suggestions: [], violations: [] };
    }

    const suggestions: SchedulingSuggestion[] = JSON.parse(jsonMatch[0]);

    // Validate against hard constraints
    const violations = validateSuggestions(suggestions, shifts, employees, existingAssignments);

    // Filter out suggestions with violations
    const validSuggestions = suggestions.filter((s) => {
      return !violations.some((v) =>
        v.detail.includes(s.shift_id) || v.detail.includes(s.employee_id)
      );
    });

    return { suggestions: validSuggestions, violations };
  } catch (error) {
    console.error('Error calling Claude API:', error);
    return { suggestions: [], violations: [{ type: 'api_error', detail: String(error) }] };
  }
}

function validateSuggestions(
  suggestions: SchedulingSuggestion[],
  shifts: Shift[],
  employees: Employee[],
  existingAssignments: Record<string, string[]>
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  suggestions.forEach((s) => {
    const shift = shifts.find((sh) => sh.id === s.shift_id);
    const employee = employees.find((e) => e.id === s.employee_id);

    if (!shift || !employee) {
      violations.push({
        type: 'invalid_reference',
        detail: `Invalid shift or employee ID in suggestion: ${s.shift_id}, ${s.employee_id}`,
      });
      return;
    }

    // Check skill match
    if (
      shift.required_skills.length > 0 &&
      !shift.required_skills.some((skill) => employee.strengths.includes(skill))
    ) {
      violations.push({
        type: 'skill_mismatch',
        detail: `Employee ${employee.name} missing required skills for shift ${s.shift_id}`,
      });
    }

    // Check availability (day of week)
    const dayOfWeek = new Date(shift.date).toLocaleDateString('en-US', { weekday: 'short' });
    if (!employee.availability[dayOfWeek]) {
      violations.push({
        type: 'availability_conflict',
        detail: `Employee ${employee.name} unavailable on ${dayOfWeek} for shift ${s.shift_id}`,
      });
    }

    // Check duplicate assignments
    const existingForShift = existingAssignments[s.shift_id] || [];
    if (existingForShift.includes(s.employee_id)) {
      violations.push({
        type: 'duplicate_assignment',
        detail: `Employee ${employee.name} already assigned to shift ${s.shift_id}`,
      });
    }
  });

  return violations;
}
