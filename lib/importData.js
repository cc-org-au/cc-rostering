/**
 * Import functions for bulk data loading
 * - CSV parsing and validation
 * - Duplicate detection and handling
 * - Error reporting
 */

const HPD = 8;

/**
 * Parse CSV string into array of objects
 * Handles quoted fields and escaped quotes
 */
export function parseCSV(csvText) {
  const lines = csvText.split('\n').filter(l => l.trim());
  if (lines.length < 1) return { headers: [], rows: [] };
  
  // Parse header
  const headers = parseCSVLine(lines[0]);
  
  // Parse data rows
  const rows = lines.slice(1).map((line, idx) => {
    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h.trim()] = values[i] ? values[i].trim() : '';
    });
    return { ...row, _lineNum: idx + 2 }; // Line number in file (1-indexed, +1 for header)
  });
  
  return { headers, rows };
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result;
}

/**
 * Validate and import employees from CSV
 * Expected columns: Name, Role, Type, Rate, Available Days, Max Hours/Month, Skills, Email, Phone
 * Returns: { valid: [], errors: [], duplicates: [], summary }
 */
export function validateEmployeesCSV(csvText, existingEmployees = []) {
  const { headers, rows } = parseCSV(csvText);
  const result = { valid: [], errors: [], duplicates: [], summary: {} };
  
  // Validate headers
  const requiredHeaders = ['Name'];
  const hasRequired = requiredHeaders.every(h => 
    headers.some(hh => hh.toLowerCase() === h.toLowerCase())
  );
  
  if (!hasRequired) {
    result.errors.push({
      row: 0,
      message: `Missing required columns. Must include: ${requiredHeaders.join(', ')}`
    });
    return result;
  }
  
  // Normalize header keys
  const headerMap = {};
  headers.forEach(h => {
    const lower = h.toLowerCase();
    headerMap[lower] = h;
  });
  
  rows.forEach(row => {
    const errors = [];
    const name = row[headerMap['name']]?.trim();
    
    // Validation
    if (!name) {
      errors.push('Name is required');
    }
    
    // Rate validation (if provided)
    const rate = row[headerMap['rate']];
    if (rate && isNaN(parseFloat(rate))) {
      errors.push('Rate must be a number');
    }
    
    // Max hours validation (if provided)
    const maxHours = row[headerMap['max hours/month']];
    if (maxHours && isNaN(parseInt(maxHours))) {
      errors.push('Max hours must be a number');
    }
    
    // Check for duplicates
    const isDuplicate = existingEmployees.some(e => 
      e.name.toLowerCase() === name?.toLowerCase()
    );
    
    if (isDuplicate) {
      result.duplicates.push({
        name,
        row: row._lineNum,
        action: 'skip'
      });
    } else if (errors.length === 0) {
      // Parse skills
      const skillsStr = row[headerMap['skills']] || '';
      const skills = skillsStr
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      
      // Parse availability
      const availStr = row[headerMap['available days']] || 'All';
      let availability = {
        Mon: true, Tue: true, Wed: true, Thu: true, Fri: true,
        Sat: false, Sun: false
      };
      
      if (availStr !== 'All') {
        availability = {
          Mon: false, Tue: false, Wed: false, Thu: false, Fri: false,
          Sat: false, Sun: false
        };
        availStr.split(';').forEach(day => {
          const d = day.trim();
          if (availability.hasOwnProperty(d)) {
            availability[d] = true;
          }
        });
      }
      
      result.valid.push({
        name,
        role: row[headerMap['role']]?.trim() || 'Labourer',
        type: row[headerMap['type']]?.trim() || 'Full-time',
        rate: rate ? parseFloat(rate) : '',
        email: row[headerMap['email']]?.trim() || '',
        phone: row[headerMap['phone']]?.trim() || '',
        availability,
        max_hours_per_month: maxHours ? parseInt(maxHours) : 160,
        strengths: skills,
        _lineNum: row._lineNum,
      });
    } else {
      result.errors.push({
        row: row._lineNum,
        name,
        message: errors.join('; ')
      });
    }
  });
  
  result.summary = {
    total: rows.length,
    valid: result.valid.length,
    errors: result.errors.length,
    duplicates: result.duplicates.length,
  };
  
  return result;
}

/**
 * Apply validated employee imports to database
 * Action: 'skip' (default), 'overwrite'
 */
export async function applyEmployeeImport(validRows, duplicateRows, supabase, action = 'skip') {
  const results = { imported: 0, skipped: 0, errors: [] };
  
  try {
    // Filter duplicates based on action
    let toImport = validRows;
    if (action === 'skip') {
      const duplicateNames = duplicateRows.map(d => d.name);
      toImport = validRows.filter(v => !duplicateNames.includes(v.name));
      results.skipped = validRows.length - toImport.length;
    }
    
    // Generate IDs
    const rows = toImport.map(r => ({
      id: `emp_${Math.random().toString(36).slice(2, 8)}`,
      name: r.name,
      role: r.role,
      type: r.type,
      rate: r.rate,
      email: r.email,
      phone: r.phone,
      availability: r.availability,
      max_hours_per_month: r.max_hours_per_month,
      strengths: r.strengths,
    }));
    
    if (rows.length === 0) {
      return results;
    }
    
    const { error } = await supabase
      .from('employees')
      .insert(rows);
    
    if (error) {
      results.errors.push(error.message);
    } else {
      results.imported = rows.length;
    }
  } catch (err) {
    results.errors.push(err.message);
  }
  
  return results;
}

const PROJECT_IMPORT_COLORS = ["#4f46e5", "#0891b2", "#059669", "#d97706", "#dc2626"];

/**
 * Validate project rows for CSV import.
 * Recognized headers (case-insensitive): Name (or Site, Project), Client, Budget,
 * Charge-out Rate, Total Input, Unit (days|hours), Staff Mode (flexible|fixed), Notes.
 */
export function validateProjectsCSV(csvText, existingProjects = []) {
  const { headers, rows } = parseCSV(csvText);
  const result = { valid: [], errors: [], duplicates: [], summary: {} };

  const headerMap = {};
  headers.forEach((h) => {
    const t = String(h).trim();
    if (t) headerMap[t.toLowerCase()] = t;
  });

  const get = (row, ...aliases) => {
    for (const a of aliases) {
      const key = headerMap[a.toLowerCase()];
      if (key !== undefined && row[key] !== undefined && String(row[key]).trim() !== "") {
        return String(row[key]).trim();
      }
    }
    return "";
  };

  const hasNameLike = ["name", "site", "project"].some((a) => headerMap[a]);
  if (!hasNameLike) {
    result.errors.push({
      row: 0,
      message: 'Missing a project name column. Use "Name", "Site", or "Project".',
    });
    return result;
  }

  const existingNames = new Set(
    (existingProjects || []).map((p) => (p.name || "").toLowerCase().trim()).filter(Boolean)
  );

  rows.forEach((row) => {
    const name = get(row, "name", "site", "project");
    if (!name) {
      result.errors.push({ row: row._lineNum, message: "Project name is required" });
      return;
    }

    const budget = get(row, "budget");
    const rate = get(row, "charge-out rate", "charge out rate");
    const totalIn = get(row, "total input");
    if (budget && isNaN(parseFloat(budget))) {
      result.errors.push({ row: row._lineNum, message: "Budget must be a number" });
      return;
    }
    if (rate && isNaN(parseFloat(rate))) {
      result.errors.push({ row: row._lineNum, message: "Charge-out rate must be a number" });
      return;
    }

    const dup = existingNames.has(name.toLowerCase());
    if (dup) {
      result.duplicates.push({ name, row: row._lineNum });
    }
    const unitRaw = get(row, "unit") || "days";
    const staffRaw = get(row, "staff mode") || "flexible";
    result.valid.push({
      name,
      client: get(row, "client"),
      budget,
      charge_out_rate: rate,
      total_input: totalIn,
      total_unit: unitRaw.toLowerCase() === "hours" ? "hours" : "days",
      staff_mode: staffRaw.toLowerCase() === "fixed" ? "fixed" : "flexible",
      notes: get(row, "notes", "description"),
      _lineNum: row._lineNum,
    });
  });

  result.summary = {
    total: rows.length,
    valid: result.valid.length,
    errors: result.errors.length,
    duplicates: result.duplicates.length,
  };

  return result;
}

/**
 * Insert validated projects. duplicateRows lists names that already exist (from validateProjectsCSV).
 * action: 'skip' | 'overwrite'
 */
export async function applyProjectImport(validRows, _duplicateRows, supabase, action = "skip") {
  const results = { imported: 0, skipped: 0, errors: [] };

  try {
    let idx = 0;
    for (const r of validRows) {
      const color = PROJECT_IMPORT_COLORS[idx % PROJECT_IMPORT_COLORS.length];
      idx += 1;
      const payload = {
        name: r.name,
        client: r.client || "",
        notes: r.notes || "",
        budget: r.budget || "",
        charge_out_rate: r.charge_out_rate || "",
        total_input: r.total_input || "",
        total_unit: r.total_unit || "days",
        staff_mode: r.staff_mode || "flexible",
        color,
      };

      const { data: existing, error: selErr } = await supabase
        .from("projects")
        .select("id")
        .ilike("name", r.name)
        .maybeSingle();
      if (selErr) {
        results.errors.push(`Line ${r._lineNum}: ${selErr.message}`);
        continue;
      }

      if (existing?.id) {
        if (action === "overwrite") {
          const { color: _c, ...updatePayload } = payload;
          const { error } = await supabase.from("projects").update(updatePayload).eq("id", existing.id);
          if (error) results.errors.push(`Line ${r._lineNum}: ${error.message}`);
          else results.imported += 1;
        } else {
          results.skipped += 1;
        }
        continue;
      }

      const id = `proj_${Math.random().toString(36).slice(2, 10)}`;
      const { error } = await supabase.from("projects").insert({ id, ...payload });
      if (error) results.errors.push(`Line ${r._lineNum}: ${error.message}`);
      else results.imported += 1;
    }
  } catch (err) {
    results.errors.push(err.message);
  }

  return results;
}

/**
 * Validate and preview holiday dates
 * Expected format: { date: "YYYY-MM-DD", name: "Holiday Name" }
 */
export function validateHolidayCSV(csvText, country = 'AU') {
  const { headers, rows } = parseCSV(csvText);
  const result = { valid: [], errors: [], summary: {} };
  
  rows.forEach(row => {
    const date = row['Date'] || row['date'];
    const name = row['Name'] || row['name'];
    
    if (!date) {
      result.errors.push({
        row: row._lineNum,
        message: 'Date is required'
      });
      return;
    }
    
    if (!name) {
      result.errors.push({
        row: row._lineNum,
        message: 'Holiday name is required'
      });
      return;
    }
    
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      result.errors.push({
        row: row._lineNum,
        message: `Invalid date format: ${date}. Use YYYY-MM-DD`
      });
      return;
    }
    
    result.valid.push({
      date,
      name,
      country,
      _lineNum: row._lineNum,
    });
  });
  
  result.summary = {
    total: rows.length,
    valid: result.valid.length,
    errors: result.errors.length,
    duplicates: 0,
  };
  
  return result;
}

/**
 * Pre-built holiday templates by country
 */
export const HOLIDAY_TEMPLATES = {
  AU: [
    { date: '2024-01-01', name: 'New Year\'s Day' },
    { date: '2024-01-26', name: 'Australia Day' },
    { date: '2024-03-29', name: 'Good Friday' },
    { date: '2024-03-30', name: 'Easter Saturday' },
    { date: '2024-04-01', name: 'Easter Monday' },
    { date: '2024-04-25', name: 'ANZAC Day' },
    { date: '2024-06-10', name: 'Queen\'s Birthday' },
    { date: '2024-12-25', name: 'Christmas Day' },
    { date: '2024-12-26', name: 'Boxing Day' },
  ],
  US: [
    { date: '2024-01-01', name: 'New Year\'s Day' },
    { date: '2024-01-15', name: 'Martin Luther King Jr. Day' },
    { date: '2024-02-19', name: 'Presidents\' Day' },
    { date: '2024-03-31', name: 'Easter Sunday' },
    { date: '2024-05-27', name: 'Memorial Day' },
    { date: '2024-06-19', name: 'Juneteenth' },
    { date: '2024-07-04', name: 'Independence Day' },
    { date: '2024-09-02', name: 'Labor Day' },
    { date: '2024-11-28', name: 'Thanksgiving' },
    { date: '2024-12-25', name: 'Christmas' },
  ],
  UK: [
    { date: '2024-01-01', name: 'New Year\'s Day' },
    { date: '2024-03-29', name: 'Good Friday' },
    { date: '2024-04-01', name: 'Easter Monday' },
    { date: '2024-05-06', name: 'Early May Bank Holiday' },
    { date: '2024-05-27', name: 'Spring Bank Holiday' },
    { date: '2024-08-26', name: 'Summer Bank Holiday' },
    { date: '2024-12-25', name: 'Christmas Day' },
    { date: '2024-12-26', name: 'Boxing Day' },
  ],
};

/**
 * Create CSV download template for project import (Settings → Import)
 */
export function downloadProjectTemplate() {
  const header =
    "Name,Client,Budget,Charge-out Rate,Total Input,Unit,Staff Mode,Notes";
  const example =
    "Parrots Farm,Camden Council,,,,days,flexible,Imported from planning spreadsheet";
  const csv = [header, example].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "project_template.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Create CSV download template for employee import
 */
export function downloadEmployeeTemplate() {
  const header = 'Name,Role,Type,Rate,Available Days,Max Hours/Month,Skills,Email,Phone';
  const example = 'John Smith,Electrician,Full-time,50,Mon;Tue;Wed;Thu;Fri,160,Electrical;Safety,john@example.com,0412345678';
  const csv = [header, example].join('\n');
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'employee_template.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Create CSV download template for holidays
 */
export function downloadHolidayTemplate() {
  const header = 'Date,Name';
  const examples = [
    '2024-01-01,New Year\'s Day',
    '2024-01-26,Australia Day',
  ];
  const csv = [header, ...examples].join('\n');
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'holiday_template.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
