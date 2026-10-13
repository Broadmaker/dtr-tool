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

import { parseExtractedDTRGrid } from './importers/extractedDtr';
import { parseCSCForm48Sheet } from './importers/cscForm48';
import { parseSegmentRecordSheet } from './importers/segmentRecord';
import { parseAttendanceReportSheet } from './importers/attendanceReport';
import { parseAttLogSheet, parseExceptionStatSheet } from './importers/attendanceLog';
import type { T5Employee } from './importers/attendanceLog';
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
