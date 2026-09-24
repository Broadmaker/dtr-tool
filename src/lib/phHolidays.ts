// Philippine holidays preset — regular & special non-working days.
// Source: Official Gazette proclamations; keep year-keyed so February 2026 etc. don't bleed.
// Add new years as they are proclaimed; UI gracefully handles missing years.
import type { HolidayEntry } from './types';

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
