/**
 * Export functions for CSV downloads
 * - Roster data (assignments by month/day)
 * - Employees (staff with rates, availability, skills)
 * - Projects (projects with budgets, timeline, staffing)
 * - Timesheets (hours worked aggregated by employee)
 */

const HPD = 8; // Hours per day

/**
 * Convert array of objects to CSV string
 */
function toCSV(rows, columns) {
  if (!rows || rows.length === 0) return '';
  
  const header = columns.join(',');
  const lines = rows.map(row => {
    return columns.map(col => {
      const val = row[col];
      // Escape quotes and wrap if contains comma/newline
      if (typeof val === 'string') {
        if (val.includes(',') || val.includes('\n') || val.includes('"')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
      }
      return val ?? '';
    }).join(',');
  });
  
  return [header, ...lines].join('\n');
}

/**
 * Download file helper
 */
function downloadFile(content, filename, type = 'text/csv') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export roster assignments to CSV
 * year, month, day, day_of_week, employee_name, project_name, hours
 */
export function exportRoster(assignments, employees, projects, year, month) {
  const rows = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  for (let day = 1; day <= daysInMonth; day++) {
    const dow = dowNames[new Date(year, month, day).getDay()];
    const dayAssignments = assignments.filter(
      a => a.year === year && a.month === month && a.day === day
    );
    
    if (dayAssignments.length > 0) {
      dayAssignments.forEach(assign => {
        const emp = employees.find(e => e.id === assign.employee_id);
        const proj = projects.find(p => p.id === assign.project_id);
        
        rows.push({
          'Date': `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          'Day': dow,
          'Employee': emp?.name || assign.employee_id,
          'Project': proj?.name || assign.project_id,
          'Hours': HPD,
        });
      });
    }
  }
  
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `roster_${year}-${String(month + 1).padStart(2, '0')}_${timestamp}.csv`;
  const csv = toCSV(rows, ['Date', 'Day', 'Employee', 'Project', 'Hours']);
  downloadFile(csv, filename);
  
  return { filename, rows: rows.length };
}

/**
 * Export all employees to CSV
 * name, role, type, rate, availability (comma-separated days), max_hours_per_month, strengths
 */
export function exportEmployees(employees) {
  const rows = employees.map(e => {
    const availDays = e.availability
      ? Object.entries(e.availability)
        .filter(([, avail]) => avail)
        .map(([day]) => day)
        .join(';')
      : 'All';
    
    return {
      'Name': e.name,
      'Role': e.role || 'Labourer',
      'Type': e.type || 'Full-time',
      'Rate': e.rate || '',
      'Available Days': availDays,
      'Max Hours/Month': e.max_hours_per_month || 160,
      'Skills': (e.strengths || []).join(';'),
      'Email': e.email || '',
      'Phone': e.phone || '',
    };
  });
  
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `employees_${timestamp}.csv`;
  const csv = toCSV(rows, [
    'Name', 'Role', 'Type', 'Rate', 'Available Days',
    'Max Hours/Month', 'Skills', 'Email', 'Phone'
  ]);
  downloadFile(csv, filename);
  
  return { filename, rows: rows.length };
}

/**
 * Export projects to CSV
 * name, client, budget, charge_out_rate, total_input, total_unit, timeline, staff_mode, fixed_staff, strengths_required
 */
export function exportProjects(projects) {
  const rows = projects.map(p => {
    const timeline = p.start_month && p.start_year && p.end_month && p.end_year
      ? `${p.start_month}/${p.start_year} - ${p.end_month}/${p.end_year}`
      : '';
    
    return {
      'Name': p.name,
      'Client': p.client || '',
      'Budget': p.budget || '',
      'Charge-out Rate': p.charge_out_rate || '',
      'Total Input': p.total_input || '',
      'Unit': p.total_unit || 'days',
      'Timeline': timeline,
      'Staff Mode': p.staff_mode || 'flexible',
      'Fixed Headcount': p.fixed_staff || '',
      'Required Skills': (p.strengths_required || []).join(';'),
      'Status': p.status || 'active',
    };
  });
  
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `projects_${timestamp}.csv`;
  const csv = toCSV(rows, [
    'Name', 'Client', 'Budget', 'Charge-out Rate', 'Total Input',
    'Unit', 'Timeline', 'Staff Mode', 'Fixed Headcount', 'Required Skills', 'Status'
  ]);
  downloadFile(csv, filename);
  
  return { filename, rows: rows.length };
}

/**
 * Export timesheets: employee hours aggregated across all assignments
 * employee_name, role, rate, total_hours_worked, assignments_count, avg_hours_per_day
 */
export function exportTimesheets(assignments, employees, year, month) {
  const empHours = {};
  
  assignments.forEach(a => {
    if (a.year === year && a.month === month) {
      if (!empHours[a.employee_id]) {
        empHours[a.employee_id] = { count: 0, hours: 0 };
      }
      empHours[a.employee_id].count += 1;
      empHours[a.employee_id].hours += HPD;
    }
  });
  
  const rows = Object.entries(empHours).map(([empId, data]) => {
    const emp = employees.find(e => e.id === empId);
    return {
      'Employee': emp?.name || empId,
      'Role': emp?.role || '',
      'Rate': emp?.rate || '',
      'Days Worked': data.count,
      'Total Hours': data.hours,
      'Avg Hours/Day': (data.hours / data.count).toFixed(1),
    };
  });
  
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `timesheets_${year}-${String(month + 1).padStart(2, '0')}_${timestamp}.csv`;
  const csv = toCSV(rows, [
    'Employee', 'Role', 'Rate', 'Days Worked', 'Total Hours', 'Avg Hours/Day'
  ]);
  downloadFile(csv, filename);
  
  return { filename, rows: rows.length };
}

/**
 * Export full monthly summary
 * Combines roster, employees, projects, timesheets into a single ZIP or multiple CSVs
 */
export function exportMonthlyBundle(assignments, employees, projects, year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  const exports = {
    roster: [],
    timesheets: [],
  };
  
  // Build roster and aggregate timesheets
  for (let day = 1; day <= daysInMonth; day++) {
    const dow = dowNames[new Date(year, month, day).getDay()];
    const dayAssignments = assignments.filter(
      a => a.year === year && a.month === month && a.day === day
    );
    
    dayAssignments.forEach(assign => {
      const emp = employees.find(e => e.id === assign.employee_id);
      const proj = projects.find(p => p.id === assign.project_id);
      
      exports.roster.push({
        'Date': `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        'Day': dow,
        'Employee': emp?.name || assign.employee_id,
        'Project': proj?.name || assign.project_id,
        'Hours': HPD,
      });
    });
  }
  
  // Build timesheets from roster
  const empHours = {};
  exports.roster.forEach(r => {
    if (!empHours[r.Employee]) {
      empHours[r.Employee] = { count: 0, hours: 0 };
    }
    empHours[r.Employee].count += 1;
    empHours[r.Employee].hours += r.Hours;
  });
  
  Object.entries(empHours).forEach(([empName, data]) => {
    const emp = employees.find(e => e.name === empName);
    exports.timesheets.push({
      'Employee': empName,
      'Role': emp?.role || '',
      'Rate': emp?.rate || '',
      'Days Worked': data.count,
      'Total Hours': data.hours,
      'Avg Hours/Day': (data.hours / data.count).toFixed(1),
    });
  });
  
  // Download both as separate files
  const timestamp = new Date().toISOString().slice(0, 10);
  const ym = `${year}-${String(month + 1).padStart(2, '0')}`;
  
  const rosterCSV = toCSV(exports.roster, ['Date', 'Day', 'Employee', 'Project', 'Hours']);
  downloadFile(rosterCSV, `roster_${ym}_${timestamp}.csv`);
  
  const timesheetCSV = toCSV(exports.timesheets, 
    ['Employee', 'Role', 'Rate', 'Days Worked', 'Total Hours', 'Avg Hours/Day']);
  downloadFile(timesheetCSV, `timesheets_${ym}_${timestamp}.csv`);
  
  return {
    timestamp,
    rosterRows: exports.roster.length,
    timesheetRows: exports.timesheets.length,
  };
}
