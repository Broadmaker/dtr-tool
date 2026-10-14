// Client-side exports: XLSX workbook — faithful to dtr-sample.pdf
import type JSZip from 'jszip';
import type { EmployeeInfo, HolidayEntry, LeaveEntry, ResolvedDay } from './types';
import { monthName } from './dateUtils';
import { totalUndertime, undertimeForDay } from './rules';

export interface ExportBundle {
  info: EmployeeInfo;
  month: number;
  year: number;
  days: ResolvedDay[];
  holidays: HolidayEntry[];
  leaves: LeaveEntry[];
}

function fmtTime(t: string): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

/**
 * CSV/formula-injection guard: SheetJS writes strings starting with
 * = + - @ (plus tab/CR) as live formulas when opened in Excel.
 * Employee names / offices come straight from the biometric file, so
 * prefix risky values with a single quote (Excel shows the text, not the quote).
 */
export function safeCell(s: string): string {
  if (!s) return s;
  if (/^[=+\-@\t\r]/.test(s)) return `'${s}`;
  return s;
}

function dayLabel(d: ResolvedDay): string {
  const wd = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.weekday];
  if (d.weekday === 0 || d.weekday === 6) return `${d.dayOfMonth} ${wd}`;
  return String(d.dayOfMonth);
}

const SHEET_NAME_MAX = 31;

/**
 * Excel sheet names: max 31 chars, unique case-insensitively (Excel itself
 * rejects `DTR` + `dtr`). Biometric files often contain duplicate display
 * names, so disambiguate with ` (2)`, ` (3)`, … — SheetJS throws
 * `Worksheet with name … already exists!` on duplicates and the whole export
 * dies with no file at all.
 */
export function uniqueSheetName(raw: string, used: Set<string>): string {
  const clean = (raw || 'DTR').replace(/[\\/?*[\]:]/g, '').slice(0, 28) || 'DTR';
  let name = clean;
  let n = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` (${n})`;
    name = `${clean.slice(0, SHEET_NAME_MAX - suffix.length)}${suffix}`;
    n += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

/** ZIP entries: same-name employees would silently overwrite each other. */
export function uniqueZipName(raw: string, used: Set<string>): string {
  const fallback = raw || 'DTR.xlsx';
  let name = fallback;
  let n = 2;
  while (used.has(name.toLowerCase())) {
    const dot = fallback.lastIndexOf('.');
    const stem = dot > 0 ? fallback.slice(0, dot) : fallback;
    const ext = dot > 0 ? fallback.slice(dot) : '';
    name = `${stem} (${n})${ext}`;
    n += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

export async function buildBatchWorkbook(bundles: ExportBundle[]) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  for (const b of bundles) {
    const capMonth = (() => {
      const up = monthName(b.month);
      return up.charAt(0) + up.slice(1).toLowerCase();
    })();
    const official = b.info.officialHours || '08:00:00-12:00:00 13:00:00-17:00:00';
    const rows: (string | number)[][] = [
      ['Civil Service Form No. 48'],
      ['DAILY TIME RECORD'],
      [`Name: ${safeCell(b.info.name)}`],
      [`Station: ${safeCell(b.info.office || '')}`],
      [`Official Hours: ${safeCell(official)}`],
      [`For the month of ${capMonth}, ${b.year}`],
      ['Official hours for arrival and departure'],
      ['Day', 'A.M. Arrival', 'A.M. Departure', 'P.M. Arrival', 'P.M. Departure', 'Undertime Hours', 'Undertime Min'],
    ];
    for (const d of b.days) {
      const u = undertimeForDay(d, b.info.officialHours);
      if (d.kind === 'holiday') {
        const desc = d.holiday?.description ? ` — ${safeCell(d.holiday.description)}` : '';
        const type = d.holiday?.type ? ` (${d.holiday.type})` : '';
        rows.push([dayLabel(d), `HOLIDAY${type}${desc}`, '', '', '', u.h, u.m]);
        continue;
      }
      if (d.kind === 'leave') {
        const lt = safeCell((d.leaveType ?? 'LEAVE').toUpperCase());
        rows.push([dayLabel(d), lt, '', '', '', u.h, u.m]);
        continue;
      }
      rows.push([
        dayLabel(d),
        fmtTime(d.entry.amIn),
        fmtTime(d.entry.amOut),
        fmtTime(d.entry.pmIn),
        fmtTime(d.entry.pmOut),
        u.h,
        u.m,
      ]);
    }
    const tot = totalUndertime(b.days, b.info.officialHours);
    rows.push(['Total Undertime', '', '', '', '', tot.h, tot.m]);
    rows.push([]);
    rows.push(['I certify on my honor that the above is a true and correct report of the hours of work performed, record of which was made daily at the time of arrival and departure from office.']);
    rows.push([safeCell(b.info.name)]);
    rows.push(['Verified as to the prescribed office hours']);
    rows.push([safeCell(b.info.verifier || '')]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 14 }, { wch: 13 }, { wch: 14 }, { wch: 13 }, { wch: 14 }, { wch: 10 }, { wch: 8 }];
    // merges for header area (optional visual)
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
    ];
    XLSX.utils.book_append_sheet(wb, ws, uniqueSheetName(b.info.name || 'DTR', usedNames));
  }
  return wb;
}

export async function downloadXlsx(bundles: ExportBundle[], filename: string) {
  const XLSX = await import('xlsx');
  const wb = await buildBatchWorkbook(bundles);
  XLSX.writeFile(wb, filename);
}

/**
 * jszip ships as pure CJS (`module.exports = JSZip`), so the shape of
 * `await import('jszip')` depends on the bundler's interop: `{ default }`
 * under Node, a getter-wrapped namespace in dev, or a raw chunk namespace
 * with the constructor under an arbitrary named export in the prod build
 * (which has no `default` at all). Scan for the constructor by its prototype
 * instead of assuming one shape — otherwise `new JSZip()` blows up with
 * "JSZip is not a constructor" and the whole ZIP dies with no file.
 */
function isJSZipCtor(v: unknown): v is typeof JSZip {
  if (typeof v !== 'function') return false;
  const proto = (v as { prototype?: { file?: unknown; generateAsync?: unknown } }).prototype;
  return typeof proto?.file === 'function' && typeof proto?.generateAsync === 'function';
}

export async function loadJSZip(): Promise<typeof JSZip> {
  const mod = (await import('jszip')) as unknown as Record<string, unknown>;
  const first: unknown[] = [mod.default, ...Object.values(mod)];
  for (const c of first) if (isJSZipCtor(c)) return c;
  for (const c of first) {
    if (c && (typeof c === 'object' || typeof c === 'function')) {
      for (const v of Object.values(c as Record<string, unknown>)) {
        if (isJSZipCtor(v)) return v;
      }
    }
  }
  // Dev-server fallback: jszip is excluded from pre-bundling, so dev serves
  // the raw UMD build, which assigns itself to the global instead of
  // exporting anything (empty module namespace, no `default`).
  const fromGlobal = (globalThis as Record<string, unknown>).JSZip;
  if (isJSZipCtor(fromGlobal)) return fromGlobal;
  throw new Error('Could not load the ZIP engine. Please reload the app and try again.');
}

export async function downloadZip(bundles: ExportBundle[], filename: string, fileBase: string) {
  const JSZipCtor = await loadJSZip();
  const { bundleToPdfBytes } = await import('./pdf');
  const zip = new JSZipCtor();
  const usedFiles = new Set<string>();
  for (const b of bundles) {
    // Print-ready PDF per employee (replaces the old per-employee .xlsx files —
    // batch Excel stays available via the Excel export button).
    const buf = await bundleToPdfBytes(b);
    const safe = (b.info.name || 'DTR').replace(/[\\/?*[\]:]/g, '_').slice(0, 60) || 'DTR';
    zip.file(uniqueZipName(`${fileBase}_${safe}.pdf`, usedFiles), buf);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
