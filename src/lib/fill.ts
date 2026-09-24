// Flash Fill for blank/incomplete records — infers missing times from existing patterns.
import { toMinutes, toHHMM } from './dateUtils';
import type { DayEntry, ResolvedDay } from './types';

export interface TypicalTimes {
  amIn: string;
  amOut: string;
  pmIn: string;
  pmOut: string;
}

/** Parse officialHours like "8:00AM–12:00NN & 1:00PM–5:00PM" into 4 slots. Fallback to 08:00/12:00/13:00/17:00. */
export function parseOfficialHours(s: string): TypicalTimes {
  const fallback: TypicalTimes = { amIn: '08:00', amOut: '12:00', pmIn: '13:00', pmOut: '17:00' };
  if (!s) return fallback;
  // Extract all time-like tokens
  const tokens = s.match(/\d{1,2}:\d{2}\s*(?:AM|PM|NN)?/gi);
  if (!tokens || tokens.length < 2) return fallback;
  // Normalize "12:00NN" -> 12:00 PM, "12:00MN" -> 12:00 AM
  const norm = tokens.map((t) => {
    let v = t.trim().toUpperCase().replace('NN', 'PM').replace('MN', 'AM');
    // ensure AM/PM
    if (!/AM|PM/.test(v)) {
      // infer: first two <12 => AM, else PM
      const [h] = v.split(':').map(Number);
      v = `${v} ${h < 12 ? 'AM' : 'PM'}`;
    }
    // convert to HH:MM via simple parse
    const m = v.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/);
    if (!m) return '';
    let h = Number(m[1]);
    const min = m[2];
    const ap = m[3];
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${min}`;
  }).filter(Boolean);
  if (norm.length >= 4) return { amIn: norm[0], amOut: norm[1], pmIn: norm[2], pmOut: norm[3] };
  if (norm.length === 2) return { amIn: norm[0], amOut: fallback.amOut, pmIn: fallback.pmIn, pmOut: norm[1] };
  return fallback;
}

function medianTime(times: string[]): string {
  const mins = times.map(toMinutes).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
  if (!mins.length) return '';
  return toHHMM(mins[Math.floor(mins.length / 2)]);
}

export function computeTypicalTimes(days: ResolvedDay[], officialHours: string): TypicalTimes {
  const fallback = parseOfficialHours(officialHours);
  const buckets: Record<keyof TypicalTimes, string[]> = { amIn: [], amOut: [], pmIn: [], pmOut: [] };
  for (const d of days) {
    if (d.kind === 'holiday' || d.kind === 'leave' || d.kind === 'weekend') continue;
    // only use complete workdays as source of truth, else any filled slot
    if (d.entry.amIn) buckets.amIn.push(d.entry.amIn);
    if (d.entry.amOut) buckets.amOut.push(d.entry.amOut);
    if (d.entry.pmIn) buckets.pmIn.push(d.entry.pmIn);
    if (d.entry.pmOut) buckets.pmOut.push(d.entry.pmOut);
  }
  return {
    amIn: medianTime(buckets.amIn) || fallback.amIn,
    amOut: medianTime(buckets.amOut) || fallback.amOut,
    pmIn: medianTime(buckets.pmIn) || fallback.pmIn,
    pmOut: medianTime(buckets.pmOut) || fallback.pmOut,
  };
}

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function jitteredTime(base: string, minDelta: number, maxDelta: number, seed: number): string {
  const b = toMinutes(base);
  if (Number.isNaN(b)) return base;
  const r = ((seed * 9301 + 49297) % 233280) / 233280; // 0..1 pseudo-random from seed
  const delta = Math.floor(r * (maxDelta - minDelta + 1)) + minDelta;
  const v = b + delta;
  // clamp to day bounds and keep plausible
  return toHHMM(Math.max(0, Math.min(1439, v)));
}

/** Build overrides to fill blank/incomplete workdays with varied times per day (not cloned). */
export function buildFlashFillOverrides(
  days: ResolvedDay[],
  typical: TypicalTimes,
  opts: { varied?: boolean } = {},
): Record<string, DayEntry> {
  const varied = opts.varied ?? true;
  const out: Record<string, DayEntry> = {};
  for (const d of days) {
    if (d.kind === 'holiday' || d.kind === 'leave' || d.kind === 'weekend') continue;
    const isEmpty = d.kind === 'empty';
    const isIncomplete = d.incomplete;
    if (!isEmpty && !isIncomplete) continue;
    const cur = d.entry;
    const seedBase = hashSeed(d.date + typical.amIn);
    // Per-day varied deltas so blanks don't look copy-pasted; keep am/pm order valid
    const vAmIn = varied && !cur.amIn ? jitteredTime(typical.amIn, -10, 10, seedBase + 11) : (cur.amIn || typical.amIn);
    const vAmOut = varied && !cur.amOut ? jitteredTime(typical.amOut, -8, 8, seedBase + 29) : (cur.amOut || typical.amOut);
    const vPmIn = varied && !cur.pmIn ? jitteredTime(typical.pmIn, -7, 10, seedBase + 53) : (cur.pmIn || typical.pmIn);
    const vPmOut = varied && !cur.pmOut ? jitteredTime(typical.pmOut, -10, 12, seedBase + 79) : (cur.pmOut || typical.pmOut);
    out[d.date] = {
      amIn: cur.amIn || vAmIn,
      amOut: cur.amOut || vAmOut,
      pmIn: cur.pmIn || vPmIn,
      pmOut: cur.pmOut || vPmOut,
      corrected: true,
    };
  }
  return out;
}
