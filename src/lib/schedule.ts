// Schedule engine: parses printed officialHours into real times and
// computes late / undertime against that schedule (was a fixed 480 min).
import { toMinutes } from './dateUtils';

export interface ScheduleTimes {
  amIn: string;
  amOut: string;
  pmIn: string;
  pmOut: string;
}

export const DEFAULT_SCHEDULE: ScheduleTimes = {
  amIn: '08:00',
  amOut: '12:00',
  pmIn: '13:00',
  pmOut: '17:00',
};

/** Parse officialHours like "8:00AM–12:00NN & 1:00PM–5:00PM" into 4 slots. */
export function parseOfficialHours(s: string): ScheduleTimes {
  if (!s) return { ...DEFAULT_SCHEDULE };
  const tokens = s.match(/\d{1,2}:\d{2}\s*(?:AM|PM|NN|MN)?/gi);
  if (!tokens || tokens.length < 2) return { ...DEFAULT_SCHEDULE };
  const norm = tokens
    .map((t) => {
      let v = t.trim().toUpperCase().replace('NN', 'PM').replace('MN', 'AM');
      if (!/AM|PM/.test(v)) {
        const [h] = v.split(':').map(Number);
        v = `${v} ${h < 12 ? 'AM' : 'PM'}`;
      }
      const m = v.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/);
      if (!m) return '';
      let h = Number(m[1]);
      const min = m[2];
      const ap = m[3];
      if (ap === 'PM' && h < 12) h += 12;
      if (ap === 'AM' && h === 12) h = 0;
      return `${String(h).padStart(2, '0')}:${min}`;
    })
    .filter(Boolean);
  if (norm.length >= 4) return { amIn: norm[0], amOut: norm[1], pmIn: norm[2], pmOut: norm[3] };
  if (norm.length === 2) return { amIn: norm[0], amOut: DEFAULT_SCHEDULE.amOut, pmIn: DEFAULT_SCHEDULE.pmIn, pmOut: norm[1] };
  return { ...DEFAULT_SCHEDULE };
}

/** Required minutes per day from the schedule (default 480). */
export function requiredMinutes(s: ScheduleTimes): number {
  const am = toMinutes(s.amOut) - toMinutes(s.amIn);
  const pm = toMinutes(s.pmOut) - toMinutes(s.pmIn);
  const total = (Number.isNaN(am) ? 240 : am) + (Number.isNaN(pm) ? 240 : pm);
  return total > 0 ? total : 480;
}

export interface Lateness {
  amLate: number;
  pmLate: number;
  total: number;
}

/** Minutes late vs schedule (arrival after scheduled IN). Missing punch = not late here (flagged as incomplete instead). */
export function lateForDay(
  entry: { amIn: string; pmIn: string },
  scheduleStr?: string,
): Lateness {
  const sched = parseOfficialHours(scheduleStr ?? '');
  const amLate = Math.max(
    0,
    toMinutes(entry.amIn) - toMinutes(sched.amIn),
  );
  const pmLate = Math.max(
    0,
    toMinutes(entry.pmIn) - toMinutes(sched.pmIn),
  );
  const clean = (n: number) => (Number.isNaN(n) || n < 0 ? 0 : n);
  // If a punch is missing, toMinutes is NaN → contributes 0 (incomplete warning covers it).
  const a = Number.isNaN(amLate) ? 0 : amLate;
  const p = Number.isNaN(pmLate) ? 0 : pmLate;
  return { amLate: clean(a), pmLate: clean(p), total: clean(a) + clean(p) };
}

export type DayAttendance = 'full' | 'half-am' | 'half-pm' | 'absent' | 'incomplete';

export interface AttendanceBreakdown {
  status: DayAttendance;
  workedMinutes: number;
  requiredMinutes: number;
  amWorked: number;
  pmWorked: number;
}

function halfWorked(entry: { amIn: string; amOut: string; pmIn: string; pmOut: string }): { am: number; pm: number } {
  const amIn = toMinutes(entry.amIn);
  const amOut = toMinutes(entry.amOut);
  const pmIn = toMinutes(entry.pmIn);
  const pmOut = toMinutes(entry.pmOut);
  const am = !Number.isNaN(amIn) && !Number.isNaN(amOut) && amOut > amIn ? amOut - amIn : 0;
  const pm = !Number.isNaN(pmIn) && !Number.isNaN(pmOut) && pmOut > pmIn ? pmOut - pmIn : 0;
  return { am, pm };
}

/**
 * Classify a day's attendance: a half is "worked" when both its IN and OUT
 * are present. One complete half + one empty half = clean half-day (legit,
 * not an error). Anything partially filled = incomplete.
 */
export function classifyDay(
  entry: { amIn: string; amOut: string; pmIn: string; pmOut: string },
  scheduleStr?: string,
): AttendanceBreakdown {
  const sched = parseOfficialHours(scheduleStr ?? '');
  const required = requiredMinutes(sched);
  const { am, pm } = halfWorked(entry);
  const amComplete = Boolean(entry.amIn && entry.amOut);
  const pmComplete = Boolean(entry.pmIn && entry.pmOut);
  const anyPunch = Boolean(entry.amIn || entry.amOut || entry.pmIn || entry.pmOut);
  let status: DayAttendance;
  if (!anyPunch) status = 'absent';
  else if (amComplete && pmComplete) status = 'full';
  else if (amComplete && !entry.pmIn && !entry.pmOut) status = 'half-am';
  else if (pmComplete && !entry.amIn && !entry.amOut) status = 'half-pm';
  else status = 'incomplete';
  return { status, workedMinutes: am + pm, requiredMinutes: required, amWorked: am, pmWorked: pm };
}
