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

export async function parseBiometricFile(file: File, override?: ColumnMap): Promise<ParseResult> {
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
    const now = new Date();
    warnings.push(`Day-matrix detected — assumed ${now.getFullYear()}-${now.getMonth() + 1}. Fix month/year next.`);
    rows.forEach((r, i) => {
      const emp = String(r[cE] ?? '').trim();
      if (!emp) return;
      for (const { col, day } of days) {
        const ts = cellTimes(r[col]);
        if (!ts.length) continue;
        const date = toISODate(now.getFullYear(), now.getMonth() + 1, day);
        for (const t of assignFourSlots(ts)) {
          if (t) punches.push({ employee: emp, date, time: t, kind: null, sourceRow: i + 2 });
        }
      }
    });
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
