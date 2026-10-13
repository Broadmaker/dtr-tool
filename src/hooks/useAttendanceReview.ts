// Derived attendance data for the review/export steps — moved verbatim from
// App.tsx so the orchestrator only owns raw state + actions.
import { useMemo } from 'react';
import { remapMatrixEmployees } from '../lib/parser';
import type { ParseResult } from '../lib/parser';
import { resolveMonth, validateDays } from '../lib/rules';
import { computeTypicalTimes } from '../lib/fill';
import type { TypicalTimes } from '../lib/fill';
import { loadUndoSnapshot } from '../lib/storage';
import type { Prefs } from '../lib/storage';
import { toISODate } from '../lib/dateUtils';
import type {
  DayEntry,
  EmployeeInfo,
  HolidayEntry,
  LeaveEntry,
  ResolvedDay,
  ValidationIssue,
} from '../lib/types';

export interface AttendanceReviewInput {
  parsed: ParseResult | null;
  month: number;
  year: number;
  overrides: Record<string, Record<string, DayEntry>>;
  activeEmp: string;
  leaves: Record<string, LeaveEntry[]>;
  holidays: HolidayEntry[];
  empInfos: Record<string, Partial<EmployeeInfo>>;
  prefs: Prefs;
  history: unknown;
  selected: Set<string>;
}

export interface AttendanceReview {
  effectiveEmployees: ParseResult['employees'];
  effectiveOverrides: Record<string, Record<string, DayEntry>>;
  merged: Record<string, DayEntry>;
  hasUndoSnapshot: boolean;
  empLeaves: LeaveEntry[];
  days: ResolvedDay[];
  issues: ValidationIssue[];
  typical: TypicalTimes;
  typicalHint: string;
  info: EmployeeInfo;
  chosen: ParseResult['employees'];
}

export function useAttendanceReview(input: AttendanceReviewInput): AttendanceReview {
  const { parsed, month, year, overrides, activeEmp, leaves, holidays, empInfos, prefs, history, selected } = input;

  // Day-matrix: remap stored ISO dates when user changes period (day-number preserving)
  const effectiveEmployees = useMemo(() => {
    if (!parsed?.matrixAssumed) return parsed?.employees ?? [];
    return remapMatrixEmployees(parsed.employees, parsed.matrixAssumed, { month, year });
  }, [parsed, month, year]);

  const effectiveOverrides = useMemo(() => {
    if (!parsed?.matrixAssumed) return overrides;
    const a = parsed.matrixAssumed;
    if (a.month === month && a.year === year) return overrides;
    const out: Record<string, Record<string, DayEntry>> = {};
    for (const [emp, map] of Object.entries(overrides)) {
      const remapped: Record<string, DayEntry> = {};
      for (const [iso, entry] of Object.entries(map)) {
        const day = Number(iso.slice(8, 10));
        if (!Number.isFinite(day) || day < 1 || day > 31) continue;
        remapped[toISODate(year, month, day)] = entry;
      }
      out[emp] = remapped;
    }
    return out;
  }, [overrides, parsed, month, year]);

  const baseDays = useMemo(() => {
    const emp = effectiveEmployees.find((e) => e.name === activeEmp);
    return emp?.days ?? {};
  }, [effectiveEmployees, activeEmp]);

  const merged: Record<string, DayEntry> = useMemo(
    () => ({ ...baseDays, ...(effectiveOverrides[activeEmp] ?? {}) }),
    [baseDays, effectiveOverrides, activeEmp],
  );

  const hasUndoSnapshot = useMemo(() => {
    void history;
    void activeEmp;
    return !!loadUndoSnapshot();
  }, [history, activeEmp]);

  const empLeaves = useMemo(() => leaves[activeEmp] ?? [], [leaves, activeEmp]);
  const days = useMemo(
    () => resolveMonth(merged, month, year, holidays, empLeaves),
    [merged, month, year, holidays, empLeaves],
  );
  const scheduleStr = empInfos[activeEmp]?.officialHours ?? prefs.officialHours;
  const issues = useMemo(() => validateDays(days, scheduleStr), [days, scheduleStr]);
  const typical = useMemo(
    () => computeTypicalTimes(days, empInfos[activeEmp]?.officialHours ?? prefs.officialHours),
    [days, empInfos, activeEmp, prefs.officialHours],
  );
  const typicalHint = `${typical.amIn} · ${typical.amOut} · ${typical.pmIn} · ${typical.pmOut}`;

  const activeStored = empInfos[activeEmp] ?? {};
  const info: EmployeeInfo = useMemo(
    () => ({
      name: (activeStored.name ?? activeEmp).toUpperCase(),
      position: activeStored.position ?? prefs.position,
      office: activeStored.office ?? prefs.office,
      officialHours: activeStored.officialHours ?? prefs.officialHours,
      verifier: activeStored.verifier ?? prefs.verifier ?? '',
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [empInfos, activeEmp, prefs.position, prefs.office, prefs.officialHours, prefs.verifier],
  );

  const chosen = useMemo(
    () => effectiveEmployees.filter((e) => selected.has(e.name)),
    [effectiveEmployees, selected],
  );

  return {
    effectiveEmployees,
    effectiveOverrides,
    merged,
    hasUndoSnapshot,
    empLeaves,
    days,
    issues,
    typical,
    typicalHint,
    info,
    chosen,
  };
}
