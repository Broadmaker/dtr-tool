// Pure bundle builder — resolves per-employee export data (edits + holidays +
// leaves + per-person info). Extracted from App.tsx with no behavior change.
import { resolveMonth } from './rules';
import type { EmployeeAttendance, EmployeeInfo, HolidayEntry, LeaveEntry } from './types';
import type { DayEntry } from './types';
import type { ExportBundle } from './export';
import type { Prefs } from './storage';

export interface BundleInput {
  /** Remapped employees (see useAttendanceReview) */
  employees: EmployeeAttendance[];
  /** Remapped overrides keyed by employee then ISO date */
  overrides: Record<string, Record<string, DayEntry>>;
  leaves: Record<string, LeaveEntry[]>;
  empInfos: Record<string, Partial<EmployeeInfo>>;
  prefs: Prefs;
  month: number;
  year: number;
  holidays: HolidayEntry[];
  selected: Set<string>;
}

export function buildBundles(input: BundleInput): ExportBundle[] {
  const { employees, overrides, leaves, empInfos, prefs, month, year, holidays, selected } = input;
  return employees
    .filter((e) => selected.has(e.name))
    .map((e) => {
      const empMerged = { ...e.days, ...(overrides[e.name] ?? {}) };
      const empLv = leaves[e.name] ?? [];
      const s = empInfos[e.name] ?? {};
      return {
        info: {
          name: (s.name ?? e.name).toUpperCase(),
          position: s.position ?? prefs.position,
          office: s.office ?? prefs.office,
          officialHours: s.officialHours ?? prefs.officialHours,
          verifier: s.verifier ?? prefs.verifier ?? '',
        },
        month,
        year,
        days: resolveMonth(empMerged, month, year, holidays, empLv),
        holidays,
        leaves: empLv,
      };
    });
}
