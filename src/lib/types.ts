// ─── Core DTR data model (see set-up.md §4, §17) ─────────────────────────────
// Pipeline: Excel → RawPunch[] → Normalized Attendance → DTR Document → Renderer

export interface RawPunch {
  employee: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM 24-hour */
  time: string;
  kind: 'IN' | 'OUT' | null;
  sourceRow: number;
}

export interface DayEntry {
  amIn: string;
  amOut: string;
  pmIn: string;
  pmOut: string;
  /** true when AO manually edited the cell (set-up.md §7) */
  corrected: boolean;
}

export type DayMap = Record<string, DayEntry>;

export interface EmployeeAttendance {
  /** Display name as found in file */
  name: string;
  days: DayMap;
}

export type HolidayType = 'Regular' | 'Special';

export interface HolidayEntry {
  /** YYYY-MM-DD */
  date: string;
  description: string;
  type: HolidayType;
}

export interface LeaveEntry {
  /** YYYY-MM-DD */
  date: string;
  leaveType: string;
}

export interface EmployeeInfo {
  name: string;
  position: string;
  office: string;
  /** e.g. "8:00AM–12:00NN & 1:00PM–5:00PM" printed on CSC form */
  officialHours: string;
}

export type DayKind =
  | 'workday'
  | 'weekend'
  | 'holiday'
  | 'leave'
  | 'empty';

export interface ResolvedDay {
  date: string;
  dayOfMonth: number;
  weekday: number; // 0=Sun
  kind: DayKind;
  entry: DayEntry;
  holiday?: HolidayEntry;
  leaveType?: string;
  hasPunch: boolean;
  incomplete: boolean;
}

export interface ValidationIssue {
  level: 'error' | 'warning' | 'info';
  date: string;
  message: string;
}

export const emptyDay = (): DayEntry => ({
  amIn: '',
  amOut: '',
  pmIn: '',
  pmOut: '',
  corrected: false,
});
