// Philippine holidays preset — regular & special non-working days.
// Source: Official Gazette proclamations; keep year-keyed so February 2026 etc. don't bleed.
// Add new years as they are proclaimed; UI gracefully handles missing years.
import type { HolidayEntry } from './types';
import { normalizeDate } from './dateUtils';

export const PH_HOLIDAYS: Record<number, HolidayEntry[]> = {
  2025: [
    { date: '2025-01-01', description: "New Year's Day", type: 'Regular' },
    { date: '2025-04-17', description: 'Maundy Thursday', type: 'Regular' },
    { date: '2025-04-18', description: 'Good Friday', type: 'Regular' },
    { date: '2025-05-01', description: 'Labor Day', type: 'Regular' },
    { date: '2025-06-12', description: 'Independence Day', type: 'Regular' },
    { date: '2025-08-21', description: 'Ninoy Aquino Day', type: 'Special' },
    { date: '2025-08-25', description: 'National Heroes Day', type: 'Regular' },
    { date: '2025-11-30', description: 'Bonifacio Day', type: 'Regular' },
    { date: '2025-12-25', description: 'Christmas Day', type: 'Regular' },
    { date: '2025-12-30', description: 'Rizal Day', type: 'Regular' },
  ],
  2026: [
    { date: '2026-01-01', description: "New Year's Day", type: 'Regular' },
    { date: '2026-04-02', description: 'Maundy Thursday', type: 'Regular' },
    { date: '2026-04-03', description: 'Good Friday', type: 'Regular' },
    { date: '2026-05-01', description: 'Labor Day', type: 'Regular' },
    { date: '2026-06-12', description: 'Independence Day', type: 'Regular' },
    { date: '2026-08-21', description: 'Ninoy Aquino Day', type: 'Special' },
    { date: '2026-08-31', description: 'National Heroes Day', type: 'Regular' },
    { date: '2026-11-30', description: 'Bonifacio Day', type: 'Regular' },
    { date: '2026-12-25', description: 'Christmas Day', type: 'Regular' },
    { date: '2026-12-30', description: 'Rizal Day', type: 'Regular' },
  ],
  2027: [
    { date: '2027-01-01', description: "New Year's Day", type: 'Regular' },
    { date: '2027-03-25', description: 'Maundy Thursday', type: 'Regular' },
    { date: '2027-03-26', description: 'Good Friday', type: 'Regular' },
    { date: '2027-05-01', description: 'Labor Day', type: 'Regular' },
    { date: '2027-06-12', description: 'Independence Day', type: 'Regular' },
    { date: '2027-08-21', description: 'Ninoy Aquino Day', type: 'Special' },
    { date: '2027-08-30', description: 'National Heroes Day', type: 'Regular' },
    { date: '2027-11-30', description: 'Bonifacio Day', type: 'Regular' },
    { date: '2027-12-25', description: 'Christmas Day', type: 'Regular' },
    { date: '2027-12-30', description: 'Rizal Day', type: 'Regular' },
  ],
};

export function holidaysForMonth(year: number, month: number): HolidayEntry[] {
  const all = PH_HOLIDAYS[year] ?? [];
  const mm = String(month).padStart(2, '0');
  const prefix = `${year}-${mm}-`;
  return all.filter((h) => h.date.startsWith(prefix));
}

export function holidaysForYear(year: number): HolidayEntry[] {
  return PH_HOLIDAYS[year] ?? [];
}

/**
 * Parse an office-proclamation CSV locally: `date,description,type` per line,
 * header row optional. Type defaults to Special when unrecognized.
 * Returns { added, skipped } counts — never throws on bad lines.
 */
export function parseHolidayCsv(text: string): { entries: HolidayEntry[]; skipped: number } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const entries: HolidayEntry[] = [];
  let skipped = 0;
  for (const [i, line] of lines.entries()) {
    // Skip a header row (first line mentioning date + description/type)
    if (i === 0 && /date/i.test(line) && /(desc|type|holiday|name)/i.test(line)) continue;
    // Split on comma/semicolon/tab, strip surrounding quotes
    const cells = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, ''));
    if (cells.length < 1) { skipped++; continue; }
    const iso = normalizeDate(cells[0]);
    if (!iso) { skipped++; continue; }
    const description = (cells[1] || 'Holiday').slice(0, 80);
    const typeRaw = (cells[2] || '').toLowerCase();
    const type: HolidayEntry['type'] = typeRaw.startsWith('reg') ? 'Regular' : 'Special';
    entries.push({ date: iso, description, type });
  }
  // Dedupe by date, keep first
  const seen = new Set<string>();
  const deduped = entries.filter((e) => {
    if (seen.has(e.date)) return false;
    seen.add(e.date);
    return true;
  });
  return { entries: deduped, skipped };
}
