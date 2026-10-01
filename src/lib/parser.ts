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
  for (let i = 0; i < grid.length; i++) {
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
      // 1b) Template 2 — CSC Form 48 Daily Time Record (one employee per sheet)
      const fileDate = new Date(file.lastModified || Date.now());
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
        for (const { sheet, parsed } of hits2) {
          let nm = parsed.name;
          const n = (seen.get(nm) ?? 0) + 1;
          seen.set(parsed.name, n);
          if (n > 1) nm = `${parsed.name} (${sheet} ${n})`;
          else if (hits2.length > 1 && (!parsed.name || parsed.name === file.name.replace(/\.[^.]+$/, ''))) nm = `${parsed.name} (${sheet})`;
          const dayMap: EmployeeAttendance['days'] = {};
          for (const iso of Object.keys(parsed.days).sort()) {
            const d = parsed.days[iso];
            dayMap[iso] = { ...d, corrected: false };
            for (const t of [d.amIn, d.amOut, d.pmIn, d.pmOut]) {
              if (t) punches.push({ employee: nm, date: iso, time: t, kind: null, sourceRow: 0 });
            }
          }
          employees.push({ name: nm, days: dayMap });
        }
        employees.sort((a, b) => a.name.localeCompare(b.name));
        const freq = new Map<string, number>();
        for (const h of hits2) freq.set(`${h.parsed.year}-${h.parsed.month}`, (freq.get(`${h.parsed.year}-${h.parsed.month}`) ?? 0) + 1);
        let best = '', bn = -1;
        for (const [k, v] of freq) if (v > bn) { bn = v; best = k; }
        const [ay, am] = best.split('-').map(Number);
        const matrixAssumed = { month: am, year: ay };
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
