// Template 3 — Biometric "Record Report" with Segment IN/OUT (one employee per sheet).
import { normalizeDate, toISODate } from '../dateUtils';
import { cellTime, cleanName, type SheetEmployeeResult } from './common';

// ─── Template 3: Biometric "Record Report" with Segment IN/OUT ─────────────
// One-employee-per-sheet layout ("Template Number 3 - Extracted DTR.xls"):
//
//   Civil Service Form No. 48 (missing on some sheets)
//   Name | <EMPLOYEE> | .. | ID | .. | Shift | .. | Date | 2026-09
//   Duty(D) / Work(H.M) / … summary rows
//   Record Report
//   Date Week | Segment 1   | Segment 2   | Segment 3   | Day Stat. | Date Week | Segment 1 …
//             | IN  | OUT   | IN  | OUT   | IN  | OUT   | Work EWork|           | IN  | OUT …
//   01 D2 | 07:00 | 12:00 | 12:58 | 17:00 |     |     | 08:00 |     | 17 D4 | 07:00 | …
//   …left block days 01–16, right block days 17–30…
//
// Day cells look like "01 D2" (D0=Sun … D6=Sat). Times are positional:
// Segment 1 IN/OUT = AM-IN/AM-OUT, Segment 2 IN/OUT = PM-IN/PM-OUT
// (Segment 3 is always empty). Only the day number carries the date, so the
// period comes from the "Date | 2026-09" header cell (else the file date) and
// stays remappable via the Period step like Template 2.
export function parseSegmentRecordSheet(
  grid: unknown[][],
  opts: { fileName: string; fileDate: Date },
): SheetEmployeeResult | null {
  const topRows = grid.slice(0, 12);
  const flat = topRows
    .map((r) => (r ?? []).map((c) => String(c ?? '').trim().toLowerCase()).join(' | '))
    .join('\n');
  const hasSegment = /segment/.test(flat);
  const hasDateWeek = /date\s*week/.test(flat);
  const hasRecord = /record report/.test(flat);
  if (!((hasSegment && hasDateWeek) || (hasRecord && hasSegment))) return null;

  // Header row holding the "Date Week" column labels; day rows start below it.
  let headerRow = -1;
  for (let i = 0; i < Math.min(grid.length, 12); i++) {
    const r = grid[i] ?? [];
    if (r.some((c) => String(c ?? '').trim().toLowerCase() === 'date week')) { headerRow = i; break; }
  }
  if (headerRow < 0) return null;

  let name = '';
  for (let i = 0; i < Math.min(grid.length, 8); i++) {
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

  // Period: "Date" label cell (exact match so "Date Week" is skipped) in the
  // header area; the value is usually "YYYY-MM" (e.g. 2026-09).
  let year = 0, month = 0;
  const periodFromText = (t: string): { year: number; month: number } | null => {
    let m = t.match(/(\d{4})\s*[-/.]\s*(\d{1,2})/);
    if (m) {
      const mo = Number(m[2]);
      if (mo >= 1 && mo <= 12) return { year: Number(m[1]), month: mo };
    }
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
    if (m) {
      const mo = Number(m[1]);
      if (mo >= 1 && mo <= 12) return { year: Number(m[2]), month: mo };
    }
    m = t.match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{4})/i);
    if (m) {
      const MONTHS: Record<string, number> = {
        january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
        july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
        jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
      };
      const mo = MONTHS[m[1].toLowerCase()];
      if (mo) return { year: Number(m[2]), month: mo };
    }
    return null;
  };
  outer: for (let i = 0; i < Math.min(grid.length, 8); i++) {
    const r = grid[i] ?? [];
    for (let c = 0; c < r.length; c++) {
      if (String(r[c] ?? '').trim().toLowerCase().replace(/[:\s]+$/, '') !== 'date') continue;
      for (let k = c + 1; k < r.length; k++) {
        const v = r[k];
        if (v instanceof Date && !Number.isNaN(v.getTime())) {
          if (v.getFullYear() > 1900) { year = v.getFullYear(); month = v.getMonth() + 1; break outer; }
          continue;
        }
        if (typeof v === 'number' && v > 20000 && v < 80000) {
          const d = new Date(new Date(1899, 11, 30).getTime() + v * 86400000);
          year = d.getFullYear(); month = d.getMonth() + 1; break outer;
        }
        const s = String(v ?? '').trim();
        if (!s) continue;
        const hit = periodFromText(s) ?? ({ year: 0, month: 0 } as { year: number; month: number });
        if (hit.year && hit.month) { year = hit.year; month = hit.month; break outer; }
        const iso = normalizeDate(s);
        if (iso) { year = Number(iso.slice(0, 4)); month = Number(iso.slice(5, 7)); break outer; }
        break;
      }
    }
  }
  if (!year || !month) {
    year = opts.fileDate.getFullYear();
    month = opts.fileDate.getMonth() + 1;
  }

  // Day rows: scan every cell for "DD" / "DD Dd" and read the 4 positional
  // Segment times to its right. This picks up both the left (01–16) and the
  // right (17–30) day blocks without hardcoding column offsets.
  const days: Record<string, { amIn: string; amOut: string; pmIn: string; pmOut: string }> = {};
  for (let i = headerRow + 1; i < grid.length; i++) {
    const r = grid[i] ?? [];
    for (let c = 0; c < r.length; c++) {
      const dayM = String(r[c] ?? '').trim().match(/^(\d{1,2})(?:\s*D[0-6])?\s*$/i);
      if (!dayM) continue;
      const day = Number(dayM[1]);
      if (!Number.isInteger(day) || day < 1 || day > 31) continue;
      // The 4 cells to the right must be time-like or empty; otherwise this
      // is a count row (e.g. Duty "0 | 26") rather than a day row.
      const ahead = [r[c + 1], r[c + 2], r[c + 3], r[c + 4]];
      const looksTimeLike = (v: unknown) => {
        const s = String(v ?? '').trim();
        return !s || cellTime(v) !== '' || /^(--)?$/.test(s);
      };
      if (!ahead.every(looksTimeLike)) continue;
      const amIn = cellTime(r[c + 1]);
      const amOut = cellTime(r[c + 2]);
      const pmIn = cellTime(r[c + 3]);
      const pmOut = cellTime(r[c + 4]);
      if (!amIn && !amOut && !pmIn && !pmOut) continue;
      days[toISODate(year, month, day)] = { amIn, amOut, pmIn, pmOut };
    }
  }
  if (Object.keys(days).length < 1) return null;
  return { name, year, month, days };
}
