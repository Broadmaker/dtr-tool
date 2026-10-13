// Template 2 — CSC Form No. 48 "DAILY TIME RECORD" (one employee per sheet).
import { toISODate } from '../dateUtils';
import { cellTime, cleanName, type SheetEmployeeResult } from './common';

// ─── Template 2: CSC Form No. 48 "DAILY TIME RECORD" ─────────────────────────
// Single-employee-per-sheet layout:
//
//   Civil Service Form No. 48 / DAILY TIME RECORD
//   Department | … | Name | <EMPLOYEE>
//   Date | <PERIOD?> | … | No | …
//   Attendance Table
//   dd/ww | AM … | PM … | Over …
//         | In | Out | In | Out
//   01 Tu | 07:15 | 12:06 | 12:16 | 17:01
//   …31 rows… ("Absence" or blank = no punches)
//
// Day cells have no month/year, so the period is inferred from the Date field
// when present, else the file date (remappable via Period step).
export function parseCSCForm48Sheet(
  grid: unknown[][],
  opts: { fileName: string; fileDate: Date },
): SheetEmployeeResult | null {
  const flat = grid
    .slice(0, 12)
    .map((r) => (r ?? []).map((c) => String(c ?? '').trim().toLowerCase()).join(' | '))
    .join('\n');
  const hasForm48 = /civil service form no\.?\s*48/.test(flat);
  const hasDTR = /daily time record/.test(flat);
  const hasTable = /attendance table/.test(flat) || /dd\s*\/\s*ww/.test(flat);
  if (!((hasForm48 && hasDTR) || (hasDTR && hasTable))) return null;

  let name = '';
  // Header area: find "Name" label, take first non-empty cell to its right
  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    const r = grid[i] ?? [];
    for (let c = 0; c < r.length; c++) {
      if (String(r[c] ?? '').trim().toLowerCase().replace(/[:\s]+$/, '') === 'name') {
        for (let k = c + 1; k < r.length; k++) {
          if (cleanName(r[k])) { name = cleanName(r[k]); break; }
        }
        if (name) break;
      }
    }
    if (name) break;
  }
  if (!name) {
    const base = opts.fileName.replace(/\.[^.]+$/, '').trim();
    name = base || 'Employee';
  }

  // Period: try Date row cells, else header-area text, else file date
  let year = 0, month = 0;
  const MONTHS: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  };
  const periodFromText = (t: string): { year: number; month: number } | null => {
    let m = t.match(/(\d{4})\s*[-/]\s*(\d{1,2})/);
    if (m) return { year: Number(m[1]), month: Number(m[2]) };
    // Full "MM-DD-YYYY" range ("08-01-2026 ~08-31-2026", PH/US order).
    // Must precede the MM-YYYY fallback so the DD part is never read as a month.
    m = t.match(/(\d{1,2})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(\d{4})/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      const mo = a <= 12 ? a : b;
      if (mo >= 1 && mo <= 12) return { year: Number(m[3]), month: mo };
    }
    m = t.match(/(\d{1,2})\s*[-/]\s*(\d{4})/);
    if (m) return { year: Number(m[2]), month: Number(m[1]) };
    m = t.match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{4})/i);
    if (m) {
      const mo = MONTHS[m[1].toLowerCase()];
      if (mo) return { year: Number(m[2]), month: mo };
    }
    return null;
  };
  outer: for (let i = 0; i < Math.min(grid.length, 10); i++) {
    const r = grid[i] ?? [];
    const isDateRow = r.some((c) => String(c ?? '').trim().toLowerCase().replace(/[:\s]+$/, '') === 'date');
    const cells = isDateRow ? r : r.slice(0, 8);
    for (const c of cells) {
      if (c instanceof Date && !Number.isNaN(c.getTime())) {
        // Excel serial date in header = period hint (ignore 1899 time-only cells)
        if (c.getFullYear() > 1900) { year = c.getFullYear(); month = c.getMonth() + 1; break outer; }
        continue;
      }
      if (typeof c === 'number' && c > 20000 && c < 80000) {
        const d = new Date(new Date(1899, 11, 30).getTime() + c * 86400000);
        year = d.getFullYear(); month = d.getMonth() + 1; break outer;
      }
      const hit = periodFromText(String(c ?? ''));
      if (hit && hit.month >= 1 && hit.month <= 12) { year = hit.year; month = hit.month; break outer; }
    }
  }
  if (!year || !month) {
    year = opts.fileDate.getFullYear();
    month = opts.fileDate.getMonth() + 1;
  }

  const days: Record<string, { amIn: string; amOut: string; pmIn: string; pmOut: string }> = {};
  // Day rows start below the In/Out sub-header (classic "dd/ww" and
  // "Time Card / Before Noon" variants both have one). Summary rows above
  // it (Absence/Leave counts, whose numeric cells would otherwise parse as
  // a phantom "00:00" day) must never be scanned.
  let dayStart = 0;
  for (let i = 0; i < Math.min(grid.length, 16); i++) {
    const r = grid[i] ?? [];
    let io = 0;
    for (let c = 1; c < Math.min(r.length, 12); c++) {
      const s = String(r[c] ?? '').trim().toLowerCase();
      if (s === 'in' || s === 'out') io++;
    }
    if (io >= 2) { dayStart = i + 1; break; }
  }
  for (let i = dayStart; i < grid.length; i++) {
    const r = grid[i] ?? [];
    const dayM = String(r[0] ?? '').trim().match(/^(\d{1,2})\b/);
    if (!dayM) continue;
    const day = Number(dayM[1]);
    if (!Number.isInteger(day) || day < 1 || day > 31) continue;
    // AM In=c1, AM Out=c3, PM In=c6, PM Out=c8 (merged pairs: 1-2, 3-5, 6-7, 8-9)
    let amIn = cellTime(r[1]);
    let amOut = cellTime(r[3]);
    let pmIn = cellTime(r[6]);
    let pmOut = cellTime(r[8]);
    if (!amIn && !amOut && !pmIn && !pmOut) {
      const all: string[] = [];
      for (let c = 1; c < Math.min(r.length, 10); c++) {
        const t = cellTime(r[c]);
        if (t && !all.includes(t)) all.push(t);
      }
      if (!all.length) continue;
      if (all.length === 2) {
        [amIn, amOut, pmIn, pmOut] = [all[0] ?? '', '', '', all[1] ?? ''];
      } else {
        [amIn, amOut, pmIn, pmOut] = [all[0] ?? '', all[1] ?? '', all[2] ?? '', all[3] ?? ''];
      }
    }
    if (!amIn && !amOut && !pmIn && !pmOut) continue;
    days[toISODate(year, month, day)] = { amIn, amOut, pmIn, pmOut };
  }
  if (Object.keys(days).length < 1) return null;
  return { name, year, month, days };
}
