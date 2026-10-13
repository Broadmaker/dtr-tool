// Shared importer helpers — cell/time parsing used by all template parsers.
import type * as XLSXType from 'xlsx';
import { normalizeTime } from '../dateUtils';
import type { EmployeeAttendance, RawPunch } from '../types';

export type WB = XLSXType.WorkBook;

export async function xlsxLib() {
  return import('xlsx');
}

export const nh = (h: unknown) =>
  String(h ?? '').trim().toLowerCase().replace(/[_\s]+/g, ' ');

export const findCol = (hs: string[], ks: string[]) => {
  for (const k of ks) {
    const i = hs.findIndex((h) => h === k || h.includes(k));
    if (i >= 0) return i;
  }
  return -1;
};

export const kindOf = (r: unknown): 'IN' | 'OUT' | null => {
  const s = String(r ?? '').trim().toUpperCase();
  if (!s) return null;
  if (s.startsWith('IN') || s === 'I' || s.includes('CHECK-IN') || s === 'C/IN') return 'IN';
  if (s.startsWith('OUT') || s === 'O' || s.includes('CHECK-OUT') || s === 'C/OUT') return 'OUT';
  return null;
};

export const cellTimes = (c: unknown): string[] => {
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
export const cellTime = (c: unknown): string => {
  if (c instanceof Date && !Number.isNaN(c.getTime())) {
    return `${String(c.getHours()).padStart(2, '0')}:${String(c.getMinutes()).padStart(2, '0')}`;
  }
  return normalizeTime(c);
};

export const cleanName = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

export type FourSlots = { amIn: string; amOut: string; pmIn: string; pmOut: string };

export type SheetDayMap = Record<string, FourSlots>;

/** One employee block parsed from a sheet (day cells carry no attendance metadata yet). */
export interface SheetEmployeeResult {
  name: string;
  year: number;
  month: number;
  days: SheetDayMap;
}

/** Template 4 block: named-but-empty employees are kept so nobody disappears. */
export type SheetBlockResult = SheetEmployeeResult & { empty: boolean };

/** Normalized block result — the orchestrator (`parser.ts`) adds the preview. */
export interface BlockParseResult {
  punches: RawPunch[];
  employees: EmployeeAttendance[];
  sheetName: string;
  warnings: string[];
}
