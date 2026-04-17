/**
 * Shared roster math: monthly hour targets, spread from total allocation, budget caps.
 */
export const HPD_ALLOC = 8;

function daysInMo(y, m) {
  return new Date(y, m + 1, 0).getDate();
}
function dowOf(y, m, d) {
  return new Date(y, m, d).getDay();
}
function isWknd(y, m, d) {
  const w = dowOf(y, m, d);
  return w === 0 || w === 6;
}
export function pmKey(y, m) {
  return `${y}-${m}`;
}

export function wdInMonth(y, m) {
  let c = 0;
  for (let d = 1; d <= daysInMo(y, m); d++) if (!isWknd(y, m, d)) c++;
  return c;
}

export const DEFAULT_PROJECT_WORK_DAYS = {
  Mon: true,
  Tue: true,
  Wed: true,
  Thu: true,
  Fri: true,
  Sat: false,
  Sun: false,
};

export function getProjectMonths(p) {
  if (p.startMonth === "" || !p.startYear || p.endMonth === "" || !p.endYear) return [];
  const out = [];
  let y = +p.startYear;
  let m = +p.startMonth;
  const ey = +p.endYear;
  const em = +p.endMonth;
  while (y < ey || (y === ey && m <= em)) {
    out.push({ y, m });
    if (++m > 11) {
      m = 0;
      y++;
    }
  }
  return out;
}

export function totalBudgetHours(p) {
  if (!p.budget || !p.chargeOutRate) return null;
  return parseFloat(p.budget) / parseFloat(p.chargeOutRate);
}

export function totalInputHours(p) {
  if (!p.totalInput || parseFloat(p.totalInput) <= 0) return null;
  const v = parseFloat(p.totalInput);
  return p.totalUnit === "hours" ? v : v * HPD_ALLOC;
}

export function spreadAcrossMonths(p) {
  const months = getProjectMonths(p);
  if (!months.length) return {};
  const totalH = totalInputHours(p) || totalBudgetHours(p);
  const totalWd = months.reduce((a, { y, m }) => a + wdInMonth(y, m), 0);
  const result = {};
  const hoursMode = p.totalUnit === "hours";
  if (totalH !== null && totalWd > 0) {
    if (hoursMode) {
      let rem = totalH;
      months.forEach(({ y, m }, i) => {
        const k = pmKey(y, m);
        if (i === months.length - 1) {
          result[k] = Math.max(0.5, Math.round(rem * 10) / 10);
        } else {
          const h = Math.round((totalH * (wdInMonth(y, m) / totalWd)) * 10) / 10;
          result[k] = h;
          rem -= h;
        }
      });
    } else {
      let rem = Math.round(totalH / HPD_ALLOC) * HPD_ALLOC;
      months.forEach(({ y, m }, i) => {
        const k = pmKey(y, m);
        if (i === months.length - 1) {
          result[k] = Math.max(HPD_ALLOC, Math.round(rem / HPD_ALLOC) * HPD_ALLOC);
        } else {
          const days = Math.max(1, Math.round((totalH * (wdInMonth(y, m) / totalWd)) / HPD_ALLOC));
          result[k] = days * HPD_ALLOC;
          rem -= days * HPD_ALLOC;
        }
      });
    }
  } else {
    months.forEach(({ y, m }) => {
      result[pmKey(y, m)] = wdInMonth(y, m) * HPD_ALLOC;
    });
  }
  return result;
}

export function monthAllocH(p, y, m) {
  const k = pmKey(y, m);
  if (p.monthlyHours && p.monthlyHours[k] !== undefined) return p.monthlyHours[k];
  const spread = spreadAcrossMonths(p);
  if (spread[k] !== undefined) return spread[k];
  return wdInMonth(y, m) * HPD_ALLOC;
}

export function monthBudgetSlice(p, y, m) {
  const months = getProjectMonths(p);
  if (!months.length || !p.budget) return null;
  const tw = months.reduce((a, mm) => a + wdInMonth(mm.y, mm.m), 0);
  return tw > 0 ? Math.round((parseFloat(p.budget) * wdInMonth(y, m)) / tw) : null;
}

export function monthBudgetHoursCap(p, y, m) {
  const slice = monthBudgetSlice(p, y, m);
  const cor = parseFloat(p.chargeOutRate);
  if (slice != null && cor > 0) return slice / cor;
  return null;
}

export function monthlyTargetHoursCapped(p, y, m) {
  const alloc = monthAllocH(p, y, m);
  const cap = monthBudgetHoursCap(p, y, m);
  const safeAlloc = typeof alloc === "number" && !Number.isNaN(alloc) ? Math.max(0, alloc) : 0;
  if (cap == null || Number.isNaN(cap)) return safeAlloc;
  const safeCap = Math.max(0, cap);
  return Math.min(safeAlloc, safeCap);
}

export const SITE_SUPERVISOR_ROLE = "Site Supervisor";

export function isSiteSupervisor(emp) {
  return emp?.role === SITE_SUPERVISOR_ROLE;
}
