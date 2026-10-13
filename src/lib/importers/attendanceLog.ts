// Template 5 — attendance log export ("Exception Stat." day rows, fallback "Att.log" grid).
import { normalizeDate, normalizeTime, toISODate } from '../dateUtils';
import { assignFourSlots } from '../slots';
import { cellTime, cleanName } from './common';

// ─── Template 5a: "Exception Stat." day-row log ────────────────────────────
// ("Template Number 5 - Extracted DTR.xls"): one row per employee per day
// with complete ISO dates — the most reliable source in this export:
//
//   Exception Statistic Report … | Stat.Date: | 2026-09-01 ~ 2026-09-10
//   ID | Name | Department | Date | First time zone | … | Second time zone …
//                            | On-duty | Off-duty | On-duty | Off-duty
//   1 | jekyll | Company | 2026-09-02 | 07:46 | 12:00 | 12:43 | …
type T5Day = { amIn: string; amOut: string; pmIn: string; pmOut: string };
export interface T5Employee { id: string; name: string; days: Record<string, T5Day> }

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

export function parseExceptionStatSheet(
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
export function parseAttLogSheet(
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
