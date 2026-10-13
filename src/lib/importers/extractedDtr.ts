// Template 1 — Extracted DTR block layout ("Personnel Att. details Report").
import { toISODate } from '../dateUtils';
import type { EmployeeAttendance, RawPunch } from '../types';
import { cellTime, cleanName, type BlockParseResult } from './common';

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
export function parseExtractedDTRGrid(
  grid: unknown[][],
  sheetName: string,
): BlockParseResult | null {
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
