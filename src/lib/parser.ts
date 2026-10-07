// Workbook reading: long/tidy + wide-matrix formats.
// NOTE: keep xlsx lazy — the upload path dynamic-imports it on first use
// so the landing page ships a small initial bundle.
import type * as XLSXType from 'xlsx';
import { normalizeDate, normalizeTime, toISODate } from './dateUtils';
import { normalizePunches, assignFourSlots } from './slots';
import type { EmployeeAttendance, RawPunch } from './types';
import type { ColumnMap, SheetPreview } from './columns';

type WB = XLSXType.WorkBook;

async function xlsxLib() {
  return import('xlsx');
}

export interface ParseResult {
  punches: RawPunch[];
  employees: EmployeeAttendance[];
  sheetName: string;
  warnings: string[];
  preview: SheetPreview;
  /** Day-matrix files store day numbers; assumed period is needed to remap dates when user changes month/year */
  matrixAssumed?: { month: number; year: number };
}

const nh = (h: unknown) => String(h ?? '').trim().toLowerCase().replace(/[_\s]+/g, ' ');
const findCol = (hs: string[], ks: string[]) => {
  for (const k of ks) {
    const i = hs.findIndex((h) => h === k || h.includes(k));
    if (i >= 0) return i;
  }
  return -1;
};
const kindOf = (r: unknown): 'IN' | 'OUT' | null => {
  const s = String(r ?? '').trim().toUpperCase();
  if (!s) return null;
  if (s.startsWith('IN') || s === 'I' || s.includes('CHECK-IN') || s === 'C/IN') return 'IN';
  if (s.startsWith('OUT') || s === 'O' || s.includes('CHECK-OUT') || s === 'C/OUT') return 'OUT';
  return null;
};
const cellTimes = (c: unknown): string[] => {
  if (c instanceof Date && !Number.isNaN(c.getTime())) {
    const hh = String(c.getHours()).padStart(2, '0');
    const mm = String(c.getMinutes()).padStart(2, '0');
    return [`${hh}:${mm}`];
  }
  const s = String(c ?? '').trim();
  if (!s || s === '--') return [];
  const ts = s.split(/[\n;,/]+/).map((x) => normalizeTime(x.trim())).filter(Boolean);
  if (ts.length) return ts;
  const one = normalizeTime(s);
  return one ? [one] : [];
};

/** Single cell → "HH:MM" or ''. Handles Date objects, Excel fractions, strings. */
const cellTime = (c: unknown): string => {
  if (c instanceof Date && !Number.isNaN(c.getTime())) {
    return `${String(c.getHours()).padStart(2, '0')}:${String(c.getMinutes()).padStart(2, '0')}`;
  }
  return normalizeTime(c);
};

export function autoMap(headers: string[]): ColumnMap {
  return {
    employee: findCol(headers, ['employee', 'name', 'person', 'staff']),
    date: findCol(headers, ['date', 'logdate', 'attendance date']),
    time: findCol(headers, ['time', 'logtime', 'clock', 'checktime', 'datetime']),
    kind: findCol(headers, ['type', 'status', 'in/out', 'inout', 'state', 'mode']),
  };
}

/** Read a workbook into a header grid + data rows (shared by auto + manual parse). */
export async function readSheetGrid(file: File): Promise<SheetPreview> {
  const XLSX = await xlsxLib();
  const buf = await file.arrayBuffer();
  const wb: WB = XLSX.read(buf, { type: 'array', cellDates: true });
  if (!wb.SheetNames.length) throw new Error('Workbook has no sheets.');
  let name = wb.SheetNames[0];
  let grid: unknown[][] = [];
  for (const sn of wb.SheetNames) {
    const g = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, raw: true, defval: '' });
    if (g.length > grid.length) { grid = g; name = sn; }
  }
  if (grid.length < 2) throw new Error('No data rows found.');
  const hi = grid.findIndex((r) => r.some((c) => String(c ?? '').trim() !== ''));
  const headers = (grid[hi] as unknown[]).map((h) => String(h ?? '').trim());
  const rows = grid.slice(hi + 1).filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
  return { sheetName: name, headers, rows, totalRows: rows.length };
}

function punchesFromMap(rows: unknown[][], map: ColumnMap): RawPunch[] {
  const punches: RawPunch[] = [];
  rows.forEach((r, i) => {
    const emp = map.employee >= 0 ? String(r[map.employee] ?? '').trim() : '';
    if (!emp) return;
    let date = map.date >= 0 ? normalizeDate(r[map.date]) : '';
    let time = map.time >= 0 ? normalizeTime(r[map.time]) : '';
    if ((!date || !time) && map.time >= 0) {
      const cell = r[map.time];
      if (cell instanceof Date) {
        date = date || toISODate(cell.getFullYear(), cell.getMonth() + 1, cell.getDate());
        time = time || normalizeTime(`${cell.getHours()}:${cell.getMinutes()}`);
      }
    }
    if (!date || !time) return;
    punches.push({ employee: emp, date, time, kind: map.kind >= 0 ? kindOf(r[map.kind]) : null, sourceRow: i + 2 });
  });
  return punches;
}

// ─── Extracted DTR block layout ─────────────────────────────────────────────
// Template Number 1 - Extracted DTR.xls / "Personnel Att. details Report":
//
//   Name | <EMPLOYEE> | .. | Date | 2026-08-01 ~ 2026-08-31
//   <summary rows…>
//   Day Week | DutyT1 … | DutyT2 …
//            | ON | OFF | ON | OFF
//   01 6 | 07:xx | | 12:xx | | 12:xx | | 16:xx
//   …31 rows…
//   (blank)
//   Name | <NEXT EMPLOYEE> …
function parseExtractedDTRGrid(
  grid: unknown[][],
  sheetName: string,
): Omit<ParseResult, 'preview'> | null {
  // Not this layout: the Segment IN/OUT "Record Report" (Template 3) also has
  // "Name" rows + numbered day rows, but its times need the two-block
  // positional parser (parseSegmentRecordSheet). Bail early so its
  // Work/EWork stat columns are never misread as PM times.
  const topFlat = grid
    .slice(0, 12)
    .map((r) => (r ?? []).map((c) => String(c ?? '').trim().toLowerCase()).join(' | '))
    .join('\n');
  if (/segment/.test(topFlat) && (/date\s*week/.test(topFlat) || /record report/.test(topFlat))) return null;

  interface Block { name: string; year: number; month: number; days: Record<string, { amIn: string; amOut: string; pmIn: string; pmOut: string }> }
  const blocks: Block[] = [];
  let cur: Block | null = null;

  const cleanName = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

  for (let i = 0; i < grid.length; i++) {
    const r = grid[i] ?? [];
    const c0 = String(r[0] ?? '').trim().toLowerCase();

    // New employee block: first col "Name", second col non-empty person name
    if (c0 === 'name' && cleanName(r[1])) {
      const name = cleanName(r[1]);
      // Skip summary/header echoes like "Employee Name"
      if (/employee/i.test(name)) continue;
      const rowText = r.map((c) => String(c ?? '')).join(' ');
      const dm = rowText.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
      let year = 0, month = 0;
      if (dm) {
        year = Number(dm[1]);
        month = Number(dm[2]);
      }
      cur = { name, year, month, days: {} };
      blocks.push(cur);
      continue;
    }

    if (!cur) continue;

    // Day row: first col like "01 6", "3 1", "31 1"
    const dayM = String(r[0] ?? '').trim().match(/^(\d{1,2})\b/);
    if (!dayM) continue;
    const day = Number(dayM[1]);
    if (!Number.isInteger(day) || day < 1 || day > 31) continue;

    // Standard columns: 1=AM-IN, 3=AM-OUT, 5=PM-IN, 7=PM-OUT
    let amIn = cellTime(r[1]);
    let amOut = cellTime(r[3]);
    let pmIn = cellTime(r[5]);
    let pmOut = cellTime(r[7]);
    if (!amIn && !amOut && !pmIn && !pmOut) {
      // Fallback: collect any times left-to-right (handles shifted/merged sheets)
      const all: string[] = [];
      for (let c = 1; c < Math.min(r.length, 12); c++) {
        const t = cellTime(r[c]);
        if (t) all.push(t);
      }
      if (!all.length) continue;
      [amIn, amOut, pmIn, pmOut] = [all[0] ?? '', all[1] ?? '', all[2] ?? '', all[3] ?? ''];
      // If only 2 punches straddling noon, treat as AM-IN + PM-OUT
      if (all.length === 2) {
        const [a, b] = all;
        amIn = a; amOut = ''; pmIn = ''; pmOut = b;
      }
    }
    if (!amIn && !amOut && !pmIn && !pmOut) continue;
    const iso = toISODate(cur.year, cur.month, day);
    cur.days[iso] = { amIn, amOut, pmIn, pmOut };
  }

  // Backfill missing period (truncated header row) from the dominant block period
  const freq = new Map<string, number>();
  for (const b of blocks) {
    if (b.year && b.month) freq.set(`${b.year}-${b.month}`, (freq.get(`${b.year}-${b.month}`) ?? 0) + 1);
  }
  let domYear = 0, domMonth = 0, domN = 0;
  for (const [k, n] of freq) {
    if (n > domN) {
      domN = n;
      const [y, m] = k.split('-').map(Number);
      domYear = y; domMonth = m;
    }
  }
  if (!domYear) {
    const d2 = new Date();
    domYear = d2.getFullYear();
    domMonth = d2.getMonth() + 1;
  }
  for (const b of blocks) {
    if (!b.year || !b.month) { b.year = domYear; b.month = domMonth; }
  }

  if (blocks.length < 1) return null;
  // Require at least a couple of day rows overall to avoid false positives
  const totalDays = blocks.reduce((n, b) => n + Object.keys(b.days).length, 0);
  if (totalDays < 2) return null;

  const punches: RawPunch[] = [];
  // Keep employees with zero punches too (blank DTR) so no one silently disappears
  const employees: EmployeeAttendance[] = blocks
    .map((b) => {
      const dayMap: EmployeeAttendance['days'] = {};
      const sortedDays = Object.keys(b.days).sort();
      for (const iso of sortedDays) {
        const d = b.days[iso];
        dayMap[iso] = { ...d, corrected: false };
        for (const t of [d.amIn, d.amOut, d.pmIn, d.pmOut]) {
          if (t) punches.push({ employee: b.name, date: iso, time: t, kind: null, sourceRow: 0 });
        }
      }
      return { name: b.name, days: dayMap };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const months = [...new Set(blocks.map((b) => `${b.year}-${String(b.month).padStart(2, '0')}`))];
  const emptyCount = blocks.length - blocks.filter((b) => Object.keys(b.days).length > 0).length;
  const warnings = [
    `Extracted DTR detected — ${blocks.length} employee${blocks.length > 1 ? 's' : ''} · ${months.join(', ')} · times mapped as AM-IN / AM-OUT / PM-IN / PM-OUT.` +
      (emptyCount ? ` ${emptyCount} employee${emptyCount > 1 ? 's' : ''} had no punches for this period.` : ''),
  ];
  return { punches, employees, sheetName, warnings };
}

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
function parseCSCForm48Sheet(
  grid: unknown[][],
  opts: { fileName: string; fileDate: Date },
): { name: string; year: number; month: number; days: Record<string, { amIn: string; amOut: string; pmIn: string; pmOut: string }> } | null {
  const flat = grid
    .slice(0, 12)
    .map((r) => (r ?? []).map((c) => String(c ?? '').trim().toLowerCase()).join(' | '))
    .join('\n');
  const hasForm48 = /civil service form no\.?\s*48/.test(flat);
  const hasDTR = /daily time record/.test(flat);
  const hasTable = /attendance table/.test(flat) || /dd\s*\/\s*ww/.test(flat);
  if (!((hasForm48 && hasDTR) || (hasDTR && hasTable))) return null;

  const cleanName = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
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
    let m = t.match(/(\d{4})\s*[-\/]\s*(\d{1,2})/);
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
    m = t.match(/(\d{1,2})\s*[-\/]\s*(\d{4})/);
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
function parseSegmentRecordSheet(
  grid: unknown[][],
  opts: { fileName: string; fileDate: Date },
): { name: string; year: number; month: number; days: Record<string, { amIn: string; amOut: string; pmIn: string; pmOut: string }> } | null {
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

  const cleanName = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
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

// ─── Template 4: "Attendance Report" with side-by-side employee blocks ─────
// ("Template Number 4 - Extracted DTR.xls"): each sheet holds up to 3
// employees side-by-side (sheet names like "1.2.3", "4.5.6"), each block ~15
// columns wide:
//
//   Attendance Report
//   Period : | … | 2024/05/01 ~ 05/31
//   Department | … | Name | <EMPLOYEE>
//   Date | 2024/05/01 ~ 05/31 | … | No | <n>
//   AB | L | BT … Late … Early Leave …
//   1. 07:30-12:00, 13:00-04:30 (schedule row)
//   Attendance Table
//   dd/ww | AM … | PM … | Over …
//         | In | Out | In | Out
//   01 We | 07:14 | 12:05 | 12:35 | 16:43
//   …31 rows… ("Absence" or blank = no punches)
//
// Column geometry per block mirrors Template 2: dd/ww at (nameCol - 8),
// AM-IN=+1, AM-OUT=+3, PM-IN=+6, PM-OUT=+8. Day cells have no month/year,
// so the period comes from the "Period"/"Date" header cell (else file date)
// and stays remappable via the Period step like Templates 2–3.
function parseAttendanceReportSheet(
  grid: unknown[][],
  opts: { fileName: string; fileDate: Date },
): { name: string; year: number; month: number; days: Record<string, { amIn: string; amOut: string; pmIn: string; pmOut: string }>; empty: boolean }[] | null {
  const topFlat = grid
    .slice(0, 12)
    .map((r) => (r ?? []).map((c) => String(c ?? '').trim().toLowerCase()).join(' | '))
    .join('\n');
  const hasReport = /attendance report/.test(topFlat);
  const hasTable = /attendance table/.test(topFlat);
  if (!(hasReport && hasTable)) return null;
  // Mutually exclusive with Template 2 (CSC Form 48 / Daily Time Record).
  if (/civil service form/.test(topFlat) || /daily time record/.test(topFlat)) return null;

  const cleanName = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

  // One "Name" label per side-by-side block (row ~2, cols 8/23/38).
  interface Block { nameCol: number; name: string }
  const blocks: Block[] = [];
  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    const r = grid[i] ?? [];
    for (let c = 0; c < r.length; c++) {
      if (String(r[c] ?? '').trim().toLowerCase().replace(/[:\s]+$/, '') !== 'name') continue;
      let nm = '';
      for (let k = c + 1; k < Math.min(r.length, c + 4); k++) {
        if (cleanName(r[k])) { nm = cleanName(r[k]); break; }
      }
      // Skip the header echo ("Employee Name" style) — not a real block.
      if (nm && !/employee/i.test(nm)) blocks.push({ nameCol: c + 1, name: nm });
      else if (!nm) blocks.push({ nameCol: c + 1, name: '' });
    }
  }
  if (!blocks.length) return null;
  // Dedupe repeated scans of the same label cell across header rows.
  const uniq = new Map<number, Block>();
  for (const b of blocks) if (!uniq.has(b.nameCol)) uniq.set(b.nameCol, b);
  const cols = [...uniq.values()].sort((a, b) => a.nameCol - b.nameCol);

  // Period: "Period"/"Date" label cell in the header area; value is usually
  // "YYYY/MM/DD ~ MM/DD" (e.g. 2024/05/01 ~ 05/31).
  let year = 0, month = 0;
  const periodFromText = (t: string): { year: number; month: number } | null => {
    let m = t.match(/(\d{4})\s*[/.-]\s*(\d{1,2})/);
    if (m) {
      const mo = Number(m[2]);
      if (mo >= 1 && mo <= 12) return { year: Number(m[1]), month: mo };
    }
    m = t.match(/(\d{1,2})\s*[/-]\s*(\d{4})/);
    if (m) {
      const mo = Number(m[1]);
      if (mo >= 1 && mo <= 12) return { year: Number(m[2]), month: mo };
    }
    return null;
  };
  outer: for (let i = 0; i < Math.min(grid.length, 8); i++) {
    const r = grid[i] ?? [];
    for (let c = 0; c < r.length; c++) {
      const label = String(r[c] ?? '').trim().toLowerCase().replace(/[:\s]+$/, '');
      if (label !== 'period' && label !== 'date') continue;
      for (let k = c + 1; k < Math.min(r.length, c + 5); k++) {
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
        const hit = periodFromText(s);
        if (hit) { year = hit.year; month = hit.month; break outer; }
        const iso = normalizeDate(s);
        if (iso) { year = Number(iso.slice(0, 4)); month = Number(iso.slice(5, 7)); break outer; }
        break;
      }
    }
  }
  void opts;
  if (!year || !month) {
    year = opts.fileDate.getFullYear();
    month = opts.fileDate.getMonth() + 1;
  }

  const out: { name: string; year: number; month: number; days: Record<string, { amIn: string; amOut: string; pmIn: string; pmOut: string }>; empty: boolean }[] = [];
  for (const b of cols) {
    if (!b.name) continue;
    // dd/ww column sits 8 left of the Name value cell; fall back to a local
    // search in case of merged/shifted sheets.
    let ddCol = b.nameCol - 8;
    let headerRow = -1;
    for (let i = 0; i < Math.min(grid.length, 14); i++) {
      const r = grid[i] ?? [];
      if (String(r[ddCol] ?? '').trim().toLowerCase() === 'dd/ww') { headerRow = i; break; }
    }
    if (headerRow < 0) {
      for (let i = 0; i < Math.min(grid.length, 14); i++) {
        const r = grid[i] ?? [];
        for (let dc = Math.max(0, b.nameCol - 10); dc <= b.nameCol - 6; dc++) {
          if (String(r[dc] ?? '').trim().toLowerCase() === 'dd/ww') { ddCol = dc; headerRow = i; break; }
        }
        if (headerRow >= 0) break;
      }
    }
    if (headerRow < 0) continue;
    const days: Record<string, { amIn: string; amOut: string; pmIn: string; pmOut: string }> = {};
    for (let i = headerRow + 2; i < grid.length; i++) {
      const r = grid[i] ?? [];
      const dayM = String(r[ddCol] ?? '').trim().match(/^(\d{1,2})\b/);
      if (!dayM) {
        // Stop at the end of the 31-day block (blank trailing rows).
        if (Object.keys(days).length >= 28 && !String(r[ddCol] ?? '').trim()) break;
        continue;
      }
      const day = Number(dayM[1]);
      if (!Number.isInteger(day) || day < 1 || day > 31) continue;
      const amIn = cellTime(r[ddCol + 1]);
      const amOut = cellTime(r[ddCol + 3]);
      const pmIn = cellTime(r[ddCol + 6]);
      const pmOut = cellTime(r[ddCol + 8]);
      if (!amIn && !amOut && !pmIn && !pmOut) continue; // "Absence" / weekend
      days[toISODate(year, month, day)] = { amIn, amOut, pmIn, pmOut };
    }
    // Keep named-but-empty employees (all Absence) so nobody disappears.
    out.push({ name: b.name, year, month, days, empty: Object.keys(days).length === 0 });
  }
  if (!out.length) return null;
  return out;
}

// ─── Template 5a: "Exception Stat." day-row log ────────────────────────────
// ("Template Number 5 - Extracted DTR.xls"): one row per employee per day
// with complete ISO dates — the most reliable source in this export:
//
//   Exception Statistic Report … | Stat.Date: | 2026-09-01 ~ 2026-09-10
//   ID | Name | Department | Date | First time zone | … | Second time zone …
//                            | On-duty | Off-duty | On-duty | Off-duty
//   1 | jekyll | Company | 2026-09-02 | 07:46 | 12:00 | 12:43 | …
type T5Day = { amIn: string; amOut: string; pmIn: string; pmOut: string };
interface T5Employee { id: string; name: string; days: Record<string, T5Day> }

function t5ZoneCols(grid: unknown[][], headerRow: number): { id: number; name: number; date: number; zones: number[] } | null {
  const hr = grid[headerRow] ?? [];
  let id = -1, name = -1, date = -1;
  for (let c = 0; c < hr.length; c++) {
    const s = String(hr[c] ?? '').trim().toLowerCase().replace(/[:\s]+$/, '');
    if (s === 'id' && id < 0) id = c;
    else if (s === 'name' && name < 0) name = c;
    else if (s === 'date' && date < 0) date = c;
  }
  if (id < 0 || name < 0 || date < 0) return null;
  // Zone labels sit on the next row ("On-duty | Off-duty | On-duty | Off-duty").
  const zones: number[] = [];
  for (let i = headerRow + 1; i < Math.min(grid.length, headerRow + 3); i++) {
    const r = grid[i] ?? [];
    for (let c = 0; c < r.length; c++) {
      const s = String(r[c] ?? '').trim().toLowerCase();
      if (/^(on|off)[\s-]*duty$/.test(s) && !zones.includes(c)) zones.push(c);
    }
    if (zones.length >= 4) break;
  }
  zones.sort((a, b) => a - b);
  if (zones.length < 4) return null;
  return { id, name, date, zones: zones.slice(0, 4) };
}

function parseExceptionStatSheet(
  grid: unknown[][],
  opts: { fileName: string; fileDate: Date },
): { employees: T5Employee[]; year: number; month: number; source: string } | null {
  const topFlat = grid
    .slice(0, 8)
    .map((r) => (r ?? []).map((c) => String(c ?? '').trim().toLowerCase()).join(' | '))
    .join('\n');
  if (!(/exception statistic/.test(topFlat) && /on[\s-]*duty/.test(topFlat))) return null;

  let headerRow = -1;
  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    const r = grid[i] ?? [];
    if (String(r[0] ?? '').trim().toLowerCase() === 'id' && r.some((c) => String(c ?? '').trim().toLowerCase() === 'name')) {
      headerRow = i;
      break;
    }
  }
  if (headerRow < 0) return null;
  const cols = t5ZoneCols(grid, headerRow);
  if (!cols) return null;

  // Period from the "Stat.Date:" row; else dominant data month; else file date.
  let year = 0, month = 0;
  outer: for (let i = 0; i < Math.min(grid.length, 6); i++) {
    const r = grid[i] ?? [];
    for (let c = 0; c < r.length; c++) {
      if (String(r[c] ?? '').trim().toLowerCase().replace(/[:\s]+$/, '') !== 'stat.date') continue;
      for (let k = c + 1; k < r.length; k++) {
        const s = String(r[k] ?? '').trim();
        if (!s) continue;
        let m = s.match(/(\d{4})\s*[-/.]\s*(\d{1,2})/);
        if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) { year = Number(m[1]); month = Number(m[2]); break outer; }
        const iso = normalizeDate(s);
        if (iso) { year = Number(iso.slice(0, 4)); month = Number(iso.slice(5, 7)); break outer; }
        break;
      }
    }
  }

  const byId = new Map<string, T5Employee>();
  const order: string[] = [];
  for (let i = headerRow + 2; i < grid.length; i++) {
    const r = grid[i] ?? [];
    const id = String(r[cols.id] ?? '').trim();
    if (!/^\d+$/.test(id)) continue; // skips sub-headers / junk rows
    const cleanName = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
    const name = cleanName(r[cols.name]);
    if (!name || /employee/i.test(name)) continue;
    const iso = normalizeDate(r[cols.date]);
    if (!iso) continue;
    const [amIn, amOut, pmIn, pmOut] = [cols.zones[0], cols.zones[1], cols.zones[2], cols.zones[3]].map((c) => cellTime(r[c]));
    let emp = byId.get(id);
    if (!emp) {
      emp = { id, name, days: {} };
      byId.set(id, emp);
      order.push(id);
    }
    if (amIn || amOut || pmIn || pmOut) emp.days[iso] = { amIn, amOut, pmIn, pmOut };
  }
  if (!order.length) return null;
  const employees = order.map((id) => byId.get(id) as T5Employee);
  if (!year || !month) {
    const freq = new Map<string, number>();
    for (const e of employees) {
      for (const iso of Object.keys(e.days)) freq.set(iso.slice(0, 7), (freq.get(iso.slice(0, 7)) ?? 0) + 1);
    }
    let bk = '', bn = -1;
    for (const [k, v] of freq) if (v > bn) { bn = v; bk = k; }
    if (bk) {
      year = Number(bk.slice(0, 4));
      month = Number(bk.slice(5, 7));
    } else {
      year = opts.fileDate.getFullYear();
      month = opts.fileDate.getMonth() + 1;
    }
  }
  void opts.fileName;
  return { employees, year, month, source: 'Exception Stat.' };
}

// ─── Template 5b: "Att.log report" concatenated-time day grid (fallback) ────
// Same export as 5a, used when the Exception sheet is absent:
//
//   Attendance Record Report … | Att. Time | 2026-09-01 ~ 2026-09-10
//   1 | 2 | 3 … 10 (day-number header)
//   ID: | … | 1 | … | Name: | jekyll
//   <one concatenated punch string per day column, e.g. "07:5512:1812:3116:59">
function parseAttLogSheet(
  grid: unknown[][],
  opts: { fileName: string; fileDate: Date },
): { employees: T5Employee[]; year: number; month: number; source: string } | null {
  const topFlat = grid
    .slice(0, 8)
    .map((r) => (r ?? []).map((c) => String(c ?? '').trim().toLowerCase()).join(' | '))
    .join('\n');
  if (!/attendance record report/.test(topFlat)) return null;

  // Day-number header row: several 1..31 cells across the first columns.
  let dayRow = -1;
  const dayCols = new Map<number, number>(); // day -> col
  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    const r = grid[i] ?? [];
    const found = new Map<number, number>();
    for (let c = 0; c < Math.min(r.length, 33); c++) {
      const s = String(r[c] ?? '').trim();
      if (!/^\d{1,2}$/.test(s)) continue;
      const d = Number(s);
      if (d >= 1 && d <= 31 && !found.has(d)) found.set(d, c);
    }
    if (found.size >= 5) {
      dayRow = i;
      for (const [d, c] of found) dayCols.set(d, c);
      break;
    }
  }
  if (dayRow < 0 || !dayCols.size) return null;

  // Period from the "Att. Time" row; else file date.
  let year = 0, month = 0;
  outer: for (let i = 0; i < Math.min(grid.length, 8); i++) {
    const r = grid[i] ?? [];
    for (let c = 0; c < r.length; c++) {
      const label = String(r[c] ?? '').trim().toLowerCase().replace(/[:\s]+$/, '').replace(/\./g, '');
      if (label !== 'att time' && label !== 'atttime') continue;
      for (let k = c + 1; k < r.length; k++) {
        const s = String(r[k] ?? '').trim();
        if (!s) continue;
        const m = s.match(/(\d{4})\s*[-/.]\s*(\d{1,2})/);
        if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) { year = Number(m[1]); month = Number(m[2]); break outer; }
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

  const cleanName = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
  const employees: T5Employee[] = [];
  for (let i = dayRow + 1; i < grid.length; i++) {
    const r = grid[i] ?? [];
    if (String(r[0] ?? '').trim().toLowerCase().replace(/[:\s]+$/, '') !== 'id') continue;
    let id = '', name = '';
    for (let c = 0; c < r.length; c++) {
      if (String(r[c] ?? '').trim().toLowerCase().replace(/[:\s]+$/, '') === 'name') {
        for (let k = c + 1; k < r.length; k++) {
          if (cleanName(r[k])) { name = cleanName(r[k]); break; }
        }
        break;
      }
    }
    if (!name || /employee/i.test(name)) continue;
    for (let c = 1; c < Math.min(r.length, 4); c++) {
      const v = String(r[c] ?? '').trim();
      if (/^\d+$/.test(v)) { id = v; break; }
    }
    if (!id) id = name;
    const times = grid[i + 1] ?? [];
    const days: Record<string, T5Day> = {};
    for (const [day, col] of [...dayCols.entries()].sort((a, b) => a[0] - b[0])) {
      const raw = String(times[col] ?? '');
      if (!raw.trim()) continue;
      // Concatenated "HH:MM" runs ("07:5512:1812:3116:59"); strays like a
      // trailing count digit carry no colon and are ignored by the pattern.
      const toks = [...raw.matchAll(/(\d{1,2}:\d{2}(?::\d{2})?)/g)]
        .map((m) => normalizeTime(m[1]))
        .filter(Boolean);
      if (!toks.length) continue;
      // Machine repeats each punch (IN/OUT echo): collapse runs.
      const uniq = toks.filter((t, ix) => ix === 0 || t !== toks[ix - 1]);
      const [amIn, amOut, pmIn, pmOut] = assignFourSlots(uniq);
      if (!amIn && !amOut && !pmIn && !pmOut) continue;
      days[toISODate(year, month, day)] = { amIn, amOut, pmIn, pmOut };
    }
    // Keep named-but-empty employees so nobody disappears.
    employees.push({ id, name, days });
  }
  if (!employees.length) return null;
  void opts.fileName;
  return { employees, year, month, source: 'Att.log report' };
}

export async function parseBiometricFile(file: File, override?: ColumnMap): Promise<ParseResult> {
  // 1) Extracted-DTR block layout first ("Personnel Att. details Report",
  //    "Template Number 1 - Extracted DTR.xls"): repeating per-employee blocks
  //    with Name + Date range header and 1..31 day rows. This layout has no
  //    tabular Employee|Date|Time headers, so it must be tried before autoMap.
  //    Skip when the user explicitly mapped columns (override given).
  if (!override) {
    try {
      const XLSX = await xlsxLib();
      const buf = await file.arrayBuffer();
      const wb: WB = XLSX.read(buf, { type: 'array', cellDates: true });
      const sheets = wb.SheetNames.map((sn) => ({
        name: sn,
        grid: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, raw: true, defval: '' }),
      })).sort((a, b) => b.grid.length - a.grid.length);
      for (const s of sheets) {
        const hit = parseExtractedDTRGrid(s.grid, s.name);
        if (hit) {
          // Synthetic tidy preview (Employee | Date | AM-IN | AM-OUT | PM-IN | PM-OUT)
          const rows: unknown[][] = [];
          for (const e of hit.employees) {
            for (const iso of Object.keys(e.days).sort()) {
              const d = e.days[iso];
              rows.push([e.name, iso, d.amIn, d.amOut, d.pmIn, d.pmOut]);
            }
          }
          const preview: SheetPreview = {
            sheetName: s.name,
            headers: ['Employee', 'Date', 'AM-IN', 'AM-OUT', 'PM-IN', 'PM-OUT'],
            rows,
            totalRows: rows.length,
          };
          return { ...hit, preview };
        }
      }
      // 1b) Template 3 — Biometric "Record Report" with Segment IN/OUT
      // (one employee per sheet, two day blocks per sheet, period in the
      // "Date | 2026-09" header cell). Tried before Template 2; the layouts
      // are mutually exclusive (Segment+Date Week vs Attendance Table).
      const fileDate = new Date(file.lastModified || Date.now());
      const hits3: { sheet: string; parsed: NonNullable<ReturnType<typeof parseSegmentRecordSheet>> }[] = [];
      for (const s of sheets) {
        const p = parseSegmentRecordSheet(s.grid, { fileName: file.name, fileDate });
        if (p) hits3.push({ sheet: s.name, parsed: p });
      }
      if (hits3.length) {
        const seen = new Map<string, number>();
        const employees: EmployeeAttendance[] = [];
        const punches: RawPunch[] = [];
        // Dominant period first: day cells carry no month/year, so every
        // sheet is normalized to it by day number (same basis as the
        // Period-step remap). Sheets stating a different month would
        // otherwise vanish from the default view.
        const freq3 = new Map<string, number>();
        for (const h of hits3) freq3.set(`${h.parsed.year}-${h.parsed.month}`, (freq3.get(`${h.parsed.year}-${h.parsed.month}`) ?? 0) + 1);
        let best3 = '', bn3 = -1;
        for (const [k, v] of freq3) if (v > bn3) { bn3 = v; best3 = k; }
        const [ay3, am3] = best3.split('-').map(Number);
        for (const { sheet, parsed } of hits3) {
          let nm = parsed.name;
          const n = (seen.get(nm) ?? 0) + 1;
          seen.set(parsed.name, n);
          if (n > 1) nm = `${parsed.name} (${sheet} ${n})`;
          else if (hits3.length > 1 && (!parsed.name || parsed.name === file.name.replace(/\.[^.]+$/, ''))) nm = `${parsed.name} (${sheet})`;
          const dayMap: EmployeeAttendance['days'] = {};
          for (const iso of Object.keys(parsed.days).sort()) {
            const d = parsed.days[iso];
            const norm = toISODate(ay3, am3, Number(iso.slice(8, 10)));
            dayMap[norm] = { ...d, corrected: false };
            for (const t of [d.amIn, d.amOut, d.pmIn, d.pmOut]) {
              if (t) punches.push({ employee: nm, date: norm, time: t, kind: null, sourceRow: 0 });
            }
          }
          employees.push({ name: nm, days: dayMap });
        }
        employees.sort((a, b) => a.name.localeCompare(b.name));
        const rows3: unknown[][] = [];
        for (const e of employees) {
          for (const iso of Object.keys(e.days).sort()) {
            const d = e.days[iso];
            rows3.push([e.name, iso, d.amIn, d.amOut, d.pmIn, d.pmOut]);
          }
        }
        return {
          punches,
          employees,
          sheetName: hits3.length > 1 ? `${hits3.length} sheets` : hits3[0].sheet,
          warnings: [
            `Record Report (Segment IN/OUT) detected — ${employees.length} employee${employees.length > 1 ? 's' : ''} · ${ay3}-${String(am3).padStart(2, '0')} · times mapped as AM-IN / AM-OUT / PM-IN / PM-OUT. ` +
              `Change Period below and dates will be remapped automatically.`,
          ],
          preview: {
            sheetName: hits3.length > 1 ? `${hits3.length} sheets` : hits3[0].sheet,
            headers: ['Employee', 'Date', 'AM-IN', 'AM-OUT', 'PM-IN', 'PM-OUT'],
            rows: rows3,
            totalRows: rows3.length,
          },
          matrixAssumed: { month: am3, year: ay3 },
        };
      }
      // 1c) Template 4 — "Attendance Report" (up to 3 employees per sheet,
      // side-by-side blocks, period in the "Period : | 2024/05/01 ~ 05/31"
      // header cell). Mutually exclusive with Templates 2–3
      // (Attendance Report vs Segment/Daily Time Record markers).
      const hits4: { sheet: string; parsed: NonNullable<ReturnType<typeof parseAttendanceReportSheet>>[number] }[] = [];
      for (const s of sheets) {
        const ps = parseAttendanceReportSheet(s.grid, { fileName: file.name, fileDate });
        if (ps) for (const p of ps) hits4.push({ sheet: s.name, parsed: p });
      }
      if (hits4.length) {
        const seen = new Map<string, number>();
        const employees: EmployeeAttendance[] = [];
        const punches: RawPunch[] = [];
        // Dominant period first: day cells carry no month/year, so every
        // block is normalized to it by day number (same basis as the
        // Period-step remap). Blocks stating a different month would
        // otherwise vanish from the default view.
        const freq4 = new Map<string, number>();
        for (const h of hits4) freq4.set(`${h.parsed.year}-${h.parsed.month}`, (freq4.get(`${h.parsed.year}-${h.parsed.month}`) ?? 0) + 1);
        let best4 = '', bn4 = -1;
        for (const [k, v] of freq4) if (v > bn4) { bn4 = v; best4 = k; }
        const [ay4, am4] = best4.split('-').map(Number);
        for (const { sheet, parsed } of hits4) {
          let nm = parsed.name;
          const n = (seen.get(nm) ?? 0) + 1;
          seen.set(parsed.name, n);
          if (n > 1) nm = `${parsed.name} (${sheet} ${n})`;
          else if (hits4.length > 1 && (!parsed.name || parsed.name === file.name.replace(/\.[^.]+$/, ''))) nm = `${parsed.name} (${sheet})`;
          const dayMap: EmployeeAttendance['days'] = {};
          for (const iso of Object.keys(parsed.days).sort()) {
            const d = parsed.days[iso];
            const norm = toISODate(ay4, am4, Number(iso.slice(8, 10)));
            dayMap[norm] = { ...d, corrected: false };
            for (const t of [d.amIn, d.amOut, d.pmIn, d.pmOut]) {
              if (t) punches.push({ employee: nm, date: norm, time: t, kind: null, sourceRow: 0 });
            }
          }
          employees.push({ name: nm, days: dayMap });
        }
        employees.sort((a, b) => a.name.localeCompare(b.name));
        const rows4: unknown[][] = [];
        for (const e of employees) {
          for (const iso of Object.keys(e.days).sort()) {
            const d = e.days[iso];
            rows4.push([e.name, iso, d.amIn, d.amOut, d.pmIn, d.pmOut]);
          }
        }
        const emptyCount4 = hits4.filter((h) => h.parsed.empty).length;
        const sheetCount4 = new Set(hits4.map((h) => h.sheet)).size;
        return {
          punches,
          employees,
          sheetName: sheetCount4 > 1 ? `${sheetCount4} sheets` : hits4[0].sheet,
          warnings: [
            `Attendance Report detected — ${employees.length} employee${employees.length > 1 ? 's' : ''} · ${ay4}-${String(am4).padStart(2, '0')} · times mapped as AM-IN / AM-OUT / PM-IN / PM-OUT.` +
              (emptyCount4 ? ` ${emptyCount4} employee${emptyCount4 > 1 ? 's' : ''} had no punches for this period (all Absence).` : '') +
              ` Change Period below and dates will be remapped automatically.`,
          ],
          preview: {
            sheetName: sheetCount4 > 1 ? `${sheetCount4} sheets` : hits4[0].sheet,
            headers: ['Employee', 'Date', 'AM-IN', 'AM-OUT', 'PM-IN', 'PM-OUT'],
            rows: rows4,
            totalRows: rows4.length,
          },
          matrixAssumed: { month: am4, year: ay4 },
        };
      }
      // 1d) Template 5 — attendance log export ("Exception Stat." day rows,
      // fallback "Att.log report" concatenated-time grid). Markers
      // ("Exception Statistic", "Attendance Record Report") collide with
      // none of Templates 1–4. Dates here are complete ISO dates, so they
      // are kept as-is; matrixAssumed still enables the Period-step remap.
      const hits5: { sheet: string; parsed: { employees: T5Employee[]; year: number; month: number; source: string } }[] = [];
      for (const s of sheets) {
        const p5a = parseExceptionStatSheet(s.grid, { fileName: file.name, fileDate });
        if (p5a) hits5.push({ sheet: s.name, parsed: p5a });
      }
      if (!hits5.length) {
        for (const s of sheets) {
          const p5b = parseAttLogSheet(s.grid, { fileName: file.name, fileDate });
          if (p5b) hits5.push({ sheet: s.name, parsed: p5b });
        }
      }
      if (hits5.length) {
        const seen5 = new Map<string, number>();
        const employees: EmployeeAttendance[] = [];
        const punches: RawPunch[] = [];
        for (const { sheet, parsed } of hits5) {
          for (const emp of parsed.employees) {
            let nm = emp.name;
            const n = (seen5.get(nm) ?? 0) + 1;
            seen5.set(emp.name, n);
            if (n > 1) nm = `${emp.name} (#${emp.id} · ${sheet})`;
            const dayMap: EmployeeAttendance['days'] = {};
            for (const iso of Object.keys(emp.days).sort()) {
              const d = emp.days[iso];
              dayMap[iso] = { ...d, corrected: false };
              for (const t of [d.amIn, d.amOut, d.pmIn, d.pmOut]) {
                if (t) punches.push({ employee: nm, date: iso, time: t, kind: null, sourceRow: 0 });
              }
            }
            employees.push({ name: nm, days: dayMap });
          }
        }
        employees.sort((a, b) => a.name.localeCompare(b.name));
        const freq5 = new Map<string, number>();
        for (const h of hits5) freq5.set(`${h.parsed.year}-${h.parsed.month}`, (freq5.get(`${h.parsed.year}-${h.parsed.month}`) ?? 0) + 1);
        let best5 = '', bn5 = -1;
        for (const [k, v] of freq5) if (v > bn5) { bn5 = v; best5 = k; }
        const [ay5, am5] = best5.split('-').map(Number);
        const rows5: unknown[][] = [];
        for (const e of employees) {
          for (const iso of Object.keys(e.days).sort()) {
            const d = e.days[iso];
            rows5.push([e.name, iso, d.amIn, d.amOut, d.pmIn, d.pmOut]);
          }
        }
        const emptyCount5 = employees.filter((e) => Object.keys(e.days).length === 0).length;
        const src5 = hits5[0].parsed.source;
        return {
          punches,
          employees,
          sheetName: hits5.length > 1 ? `${hits5.length} sheets` : hits5[0].sheet,
          warnings: [
            `Attendance log (${src5}) detected — ${employees.length} employee${employees.length > 1 ? 's' : ''} · ${ay5}-${String(am5).padStart(2, '0')} · times mapped as AM-IN / AM-OUT / PM-IN / PM-OUT.` +
              (emptyCount5 ? ` ${emptyCount5} employee${emptyCount5 > 1 ? 's' : ''} had no punches for this period.` : '') +
              ` Change Period below and dates will be remapped automatically.`,
          ],
          preview: {
            sheetName: hits5.length > 1 ? `${hits5.length} sheets` : hits5[0].sheet,
            headers: ['Employee', 'Date', 'AM-IN', 'AM-OUT', 'PM-IN', 'PM-OUT'],
            rows: rows5,
            totalRows: rows5.length,
          },
          matrixAssumed: { month: am5, year: ay5 },
        };
      }
      // 1e) Template 2 — CSC Form 48 Daily Time Record (one employee per sheet)
      const hits2: { sheet: string; parsed: NonNullable<ReturnType<typeof parseCSCForm48Sheet>> }[] = [];
      for (const s of sheets) {
        const p = parseCSCForm48Sheet(s.grid, { fileName: file.name, fileDate });
        if (p) hits2.push({ sheet: s.name, parsed: p });
      }
      if (hits2.length) {
        // Dedupe blank/duplicate names across sheets
        const seen = new Map<string, number>();
        const employees: EmployeeAttendance[] = [];
        const punches: RawPunch[] = [];
        // Dominant period first: day cells carry no month/year, so every
        // sheet is normalized to it by day number (same basis as the
        // Period-step remap). Sheets stating a different month would
        // otherwise vanish from the default view.
        const freq = new Map<string, number>();
        for (const h of hits2) freq.set(`${h.parsed.year}-${h.parsed.month}`, (freq.get(`${h.parsed.year}-${h.parsed.month}`) ?? 0) + 1);
        let best = '', bn = -1;
        for (const [k, v] of freq) if (v > bn) { bn = v; best = k; }
        const [ay, am] = best.split('-').map(Number);
        const matrixAssumed = { month: am, year: ay };
        for (const { sheet, parsed } of hits2) {
          let nm = parsed.name;
          const n = (seen.get(nm) ?? 0) + 1;
          seen.set(parsed.name, n);
          if (n > 1) nm = `${parsed.name} (${sheet} ${n})`;
          else if (hits2.length > 1 && (!parsed.name || parsed.name === file.name.replace(/\.[^.]+$/, ''))) nm = `${parsed.name} (${sheet})`;
          const dayMap: EmployeeAttendance['days'] = {};
          for (const iso of Object.keys(parsed.days).sort()) {
            const d = parsed.days[iso];
            const norm = toISODate(ay, am, Number(iso.slice(8, 10)));
            dayMap[norm] = { ...d, corrected: false };
            for (const t of [d.amIn, d.amOut, d.pmIn, d.pmOut]) {
              if (t) punches.push({ employee: nm, date: norm, time: t, kind: null, sourceRow: 0 });
            }
          }
          employees.push({ name: nm, days: dayMap });
        }
        employees.sort((a, b) => a.name.localeCompare(b.name));
        const rows: unknown[][] = [];
        for (const e of employees) {
          for (const iso of Object.keys(e.days).sort()) {
            const d = e.days[iso];
            rows.push([e.name, iso, d.amIn, d.amOut, d.pmIn, d.pmOut]);
          }
        }
        return {
          punches,
          employees,
          sheetName: hits2.length > 1 ? `${hits2.length} sheets` : hits2[0].sheet,
          warnings: [
            `CSC Form 48 DTR detected — ${employees.length} employee${employees.length > 1 ? 's' : ''} · assumed ${ay}-${String(am).padStart(2, '0')} (day numbers only in file). ` +
              `Change Period below and dates will be remapped automatically.`,
          ],
          preview: {
            sheetName: hits2.length > 1 ? `${hits2.length} sheets` : hits2[0].sheet,
            headers: ['Employee', 'Date', 'AM-IN', 'AM-OUT', 'PM-IN', 'PM-OUT'],
            rows,
            totalRows: rows.length,
          },
          matrixAssumed,
        };
      }
    } catch {
      // fall through to tabular parsing
    }
  }

  const preview = await readSheetGrid(file);
  const hs = preview.headers.map(nh);
  const rows = preview.rows;
  const auto = autoMap(hs);
  const cE = override?.employee ?? auto.employee;
  const cD = override?.date ?? auto.date;
  const cT = override?.time ?? auto.time;
  const cK = override?.kind ?? auto.kind;
  const warnings: string[] = [];
  let punches: RawPunch[] = [];
  if (cE >= 0 && (cD >= 0 || cT >= 0)) {
    punches = punchesFromMap(rows, { employee: cE, date: cD, time: cT, kind: cK });
  } else if (cE >= 0) {
    const days: { col: number; day: number }[] = [];
    hs.forEach((h, col) => {
      const n = Number(h);
      if (Number.isInteger(n) && n >= 1 && n <= 31) days.push({ col, day: n });
    });
    if (!days.length) throw new Error('Need headers like Employee | Date | Time, or Employee | 1 | 2 | 3 …');
    // Prefer file modification date for assumed period, fallback to now
    const fileDate = new Date(file.lastModified || Date.now());
    const assumedMonth = fileDate.getMonth() + 1;
    const assumedYear = fileDate.getFullYear();
    const matrixAssumed = { month: assumedMonth, year: assumedYear };
    // Try to infer from any parsable Date cells outside matrix (e.g. a "Date" column hidden)
    // If none, we'll use file date and warn user that remapping is automatic
    warnings.push(
      `Day-matrix detected — assumed ${assumedYear}-${String(assumedMonth).padStart(2, '0')}. ` +
        `Change Period below and dates will be remapped automatically.`
    );
    rows.forEach((r, i) => {
      const emp = String(r[cE] ?? '').trim();
      if (!emp) return;
      for (const { col, day } of days) {
        const ts = cellTimes(r[col]);
        if (!ts.length) continue;
        const date = toISODate(assumedYear, assumedMonth, day);
        for (const t of assignFourSlots(ts)) {
          if (t) punches.push({ employee: emp, date, time: t, kind: null, sourceRow: i + 2 });
        }
      }
    });
    if (!punches.length) throw new Error('No punches readable. Check Employee/Date/Time columns.');
    return {
      punches,
      employees: normalizePunches(punches),
      sheetName: preview.sheetName,
      warnings,
      preview,
      matrixAssumed,
    };
  } else {
    throw new Error('Need headers like Employee | Date | Time, or Employee | 1 | 2 | 3 …');
  }
  if (!punches.length) throw new Error('No punches readable. Check Employee/Date/Time columns.');
  return { punches, employees: normalizePunches(punches), sheetName: preview.sheetName, warnings, preview };
}

export function guessPeriod(p: RawPunch[]) {
  const c = new Map<string, number>();
  for (const x of p) c.set(x.date.slice(0, 7), (c.get(x.date.slice(0, 7)) ?? 0) + 1);
  let best = '', n = -1;
  for (const [k, v] of c) if (v > n) { n = v; best = k; }
  if (!best) { const d = new Date(); return { month: d.getMonth() + 1, year: d.getFullYear() }; }
  const [y, m] = best.split('-').map(Number);
  return { month: m, year: y };
}

/** For day-matrix files: remap stored ISO dates from assumed period to target period by day-of-month */
export function remapMatrixEmployees(
  employees: EmployeeAttendance[],
  assumed: { month: number; year: number },
  target: { month: number; year: number }
): EmployeeAttendance[] {
  if (assumed.month === target.month && assumed.year === target.year) return employees;
  return employees.map((e) => {
    const newDays: EmployeeAttendance['days'] = {};
    for (const [iso, entry] of Object.entries(e.days)) {
      const day = Number(iso.slice(8, 10));
      if (!Number.isFinite(day) || day < 1 || day > 31) continue;
      const newIso = toISODate(target.year, target.month, day);
      newDays[newIso] = entry;
    }
    return { ...e, days: newDays };
  });
}
