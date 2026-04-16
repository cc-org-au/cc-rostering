import { supabase } from './supabase';

// ── Parse CSV File ───────────────────────────────────────────────────────────
export async function parseCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const csv = event.target.result;
        const lines = csv.split('\n').filter(line => line.trim());
        const headers = lines[0].split(',').map(h => h.trim());
        const rows = lines.slice(1).map((line, idx) => {
          const values = line.split(',').map(v => v.trim());
          const row = {};
          headers.forEach((h, i) => { row[h] = values[i] || ''; });
          return { ...row, _lineNumber: idx + 2 };
        });
        resolve({ headers, rows });
      } catch (e) {
        reject(new Error(`CSV parse error: ${e.message}`));
      }
    };
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsText(file);
  });
}

// ── Validate Employee Import ──────────────────────────────────────────────────
export function validateEmployeeCSV(rows, existingEmployees = []) {
  const valid = [];
  const invalid = [];
  const duplicates = [];

  const existingNames = new Set(existingEmployees.map(e => e.name.toLowerCase()));

  rows.forEach(row => {
    const errors = [];

    // Required: Name
    if (!row.Name || row.Name.trim() === '') {
      errors.push('Name is required');
    }

    // Validate email if provided
    if (row.Email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.Email)) {
      errors.push('Invalid email format');
    }

    // Validate rate if provided
    if (row.Rate && isNaN(parseFloat(row.Rate))) {
      errors.push('Rate must be a number');
    }

    // Validate max hours if provided
    if (row['Max Hours/Month'] && isNaN(parseInt(row['Max Hours/Month']))) {
      errors.push('Max hours must be a number');
    }

    if (errors.length > 0) {
      invalid.push({ ...row, errors });
    } else {
      // Check for duplicates
      if (existingNames.has(row.Name.toLowerCase())) {
        duplicates.push(row);
      } else {
        valid.push(row);
      }
    }
  });

  return { valid, invalid, duplicates };
}

// ── Import Employees ──────────────────────────────────────────────────────────
export async function importEmployees(validRows, options = {}) {
  const { duplicateAction = 'skip' } = options;
  const results = { created: 0, updated: 0, failed: 0, errors: [] };

  try {
    for (const row of validRows) {
      try {
        const empData = {
          name: row.Name,
          role: row.Role || 'Labourer',
          type: row.Type || 'Full-time',
          rate: row.Rate || '',
          email: row.Email || '',
          phone: row.Phone || '',
          max_hours_per_month: parseInt(row['Max Hours/Month']) || 160,
          strengths: row.Skills ? row.Skills.split(';').map(s => s.trim()) : [],
          availability: row['Available Days'] 
            ? parseAvailabilityString(row['Available Days'])
            : { Mon: true, Tue: true, Wed: true, Thu: true, Fri: true, Sat: false, Sun: false },
        };

        // Check if exists
        const { data: existing } = await supabase
          .from('employees')
          .select('id')
          .ilike('name', row.Name)
          .single();

        if (existing) {
          if (duplicateAction === 'overwrite') {
            await supabase
              .from('employees')
              .update(empData)
              .eq('id', existing.id);
            results.updated++;
          } else {
            results.failed++;
            results.errors.push(`Line ${row._lineNumber}: Employee already exists (skipped)`);
          }
        } else {
          const id = 'emp_' + Math.random().toString(36).slice(2, 8);
          await supabase.from('employees').insert({ id, ...empData });
          results.created++;
        }
      } catch (e) {
        results.failed++;
        results.errors.push(`Line ${row._lineNumber}: ${e.message}`);
      }
    }

    return results;
  } catch (e) {
    throw new Error(`Employee import failed: ${e.message}`);
  }
}

// ── Parse Availability String (e.g., "Mon;Tue;Wed;Thu;Fri") ──────────────────
function parseAvailabilityString(str) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const available = str.split(';').map(s => s.trim());
  const result = {};
  days.forEach(d => { result[d] = available.includes(d); });
  return result;
}

// ── Validate Project Import ───────────────────────────────────────────────────
export function validateProjectCSV(rows) {
  const valid = [];
  const invalid = [];

  rows.forEach(row => {
    const errors = [];

    if (!row.Name || row.Name.trim() === '') errors.push('Name is required');
    if (row.Budget && isNaN(parseFloat(row.Budget))) errors.push('Budget must be a number');
    if (row['Charge-out Rate'] && isNaN(parseFloat(row['Charge-out Rate']))) {
      errors.push('Charge-out rate must be a number');
    }

    if (errors.length > 0) {
      invalid.push({ ...row, errors });
    } else {
      valid.push(row);
    }
  });

  return { valid, invalid };
}

// ── Import Projects ───────────────────────────────────────────────────────────
export async function importProjects(validRows) {
  const results = { created: 0, failed: 0, errors: [] };
  const COLORS = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626'];

  try {
    for (const row of validRows) {
      try {
        const projData = {
          name: row.Name,
          client: row.Client || '',
          budget: row.Budget || '',
          charge_out_rate: row['Charge-out Rate'] || '',
          total_input: row['Total Input'] || '',
          total_unit: row.Unit === 'hours' ? 'hours' : 'days',
          staff_mode: row['Staff Mode'] || 'flexible',
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
        };

        const id = 'proj_' + Math.random().toString(36).slice(2, 8);
        await supabase.from('projects').insert({ id, ...projData });
        results.created++;
      } catch (e) {
        results.failed++;
        results.errors.push(`Line ${row._lineNumber}: ${e.message}`);
      }
    }

    return results;
  } catch (e) {
    throw new Error(`Project import failed: ${e.message}`);
  }
}

// ── Download Template ─────────────────────────────────────────────────────────
export function downloadEmployeeTemplate() {
  const csv = `Name,Role,Type,Rate,Available Days,Max Hours/Month,Skills,Email,Phone
John Smith,Electrician,Full-time,50,Mon;Tue;Wed;Thu;Fri,160,Electrical;Safety,john@example.com,0400123456
Jane Doe,Plumber,Part-time,45,Mon;Wed;Thu;Fri,80,Plumbing;Gas,jane@example.com,0400234567`;

  downloadCSV(csv, 'employee_template.csv');
}

export function downloadProjectTemplate() {
  const csv = `Name,Client,Budget,Charge-out Rate,Total Input,Unit,Staff Mode
Project A,Acme Inc,50000,100,500,hours,flexible
Project B,Tech Corp,75000,120,40,days,flexible`;

  downloadCSV(csv, 'project_template.csv');
}

function downloadCSV(content, filename) {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
