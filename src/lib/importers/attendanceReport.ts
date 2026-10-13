// Template 4 — "Attendance Report" with side-by-side employee blocks.
import { normalizeDate, toISODate } from '../dateUtils';
import { cellTime, cleanName, type SheetBlockResult } from './common';

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
export function parseAttendanceReportSheet(
  grid: unknown[][],
  opts: { fileName: string; fileDate: Date },
): SheetBlockResult[] | null {
  const topFlat = grid
    .slice(0, 12)
    .map((r) => (r ?? []).map((c) => String(c ?? '').trim().toLowerCase()).join(' | '))
    .join('\n');
  const hasReport = /attendance report/.test(topFlat);
  const hasTable = /attendance table/.test(topFlat);
  if (!(hasReport && hasTable)) return null;
  // Mutually exclusive with Template 2 (CSC Form 48 / Daily Time Record).
  if (/civil service form/.test(topFlat) || /daily time record/.test(topFlat)) return null;


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
