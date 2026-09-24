// Slot assignment + normalization.
import { toMinutes, toHHMM } from './dateUtils';
import type { DayMap, EmployeeAttendance, RawPunch } from './types';

/** Sorted punches for one day → AM-IN / AM-OUT / PM-IN / PM-OUT (time-only heuristic). */
export function assignFourSlots(times: string[]): [string, string, string, string] {
  const mins = times.map(toMinutes).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
  if (mins.length === 0) return ['', '', '', ''];
  if (mins.length === 1) return [toHHMM(mins[0]), '', '', ''];
  if (mins.length === 2) {
    const [a, b] = mins;
    if (b < 12 * 60) return [toHHMM(a), toHHMM(b), '', ''];
    if (a >= 12 * 60) return ['', '', toHHMM(a), toHHMM(b)];
    return [toHHMM(a), '', '', toHHMM(b)];
  }
  if (mins.length === 3) {
    const [a, b, c] = mins;
    if (c < 12 * 60) return [toHHMM(a), toHHMM(c), '', ''];
    if (a >= 12 * 60) return ['', '', toHHMM(a), toHHMM(c)];
    return [toHHMM(a), toHHMM(b), '', toHHMM(c)];
  }
  const first = mins[0];
  const last = mins[mins.length - 1];
  const middle = mins.slice(1, -1);
  let amOut = middle[0];
  let pmIn = middle[middle.length - 1];
  if (middle.length > 2) {
    let best = 0;
    let bestGap = -1;
    for (let i = 0; i < middle.length - 1; i++) {
      const gap = middle[i + 1] - middle[i];
      if (gap > bestGap) { bestGap = gap; best = i; }
    }
    amOut = middle[best];
    pmIn = middle[best + 1];
  }
  return [toHHMM(first), toHHMM(amOut), toHHMM(pmIn), toHHMM(last)];
}

/** Kind-aware slot assignment — uses IN/OUT when available, falls back to heuristic. */
export function assignFourSlotsWithKind(punches: RawPunch[]): [string, string, string, string] {
  const hasKind = punches.some((p) => p.kind === 'IN' || p.kind === 'OUT');
  if (!hasKind) return assignFourSlots(punches.map((p) => p.time));

  type P = RawPunch & { mins: number };
  const sorted: P[] = punches
    .map((p) => ({ ...p, mins: toMinutes(p.time) }))
    .filter((p) => !Number.isNaN(p.mins))
    .sort((a, b) => a.mins - b.mins);
  if (!sorted.length) return ['', '', '', ''];

  // Single punch: respect kind (OUT late-day -> pmOut, not amIn)
  if (sorted.length === 1) {
    const p = sorted[0];
    if (p.kind === 'OUT' && p.mins >= 12 * 60) return ['', '', '', p.time];
    if (p.kind === 'OUT' && p.mins < 12 * 60) return ['', p.time, '', ''];
    if (p.kind === 'IN' && p.mins >= 12 * 60) return ['', '', p.time, ''];
    return [p.time, '', '', ''];
  }

  const ins = sorted.filter((p) => p.kind === 'IN');
  const outs = sorted.filter((p) => p.kind === 'OUT');
  const unks = sorted.filter((p) => p.kind == null);

  // Pick amIn: earliest IN (prefer before 1pm) else earliest unk before noon
  let amInP: P | undefined;
  if (ins.length) {
    amInP = ins.find((p) => p.mins < 13 * 60) ?? ins[0];
  } else if (unks.length) {
    amInP = unks.find((p) => p.mins < 12 * 60);
  }
  // Pick pmOut: latest OUT (prefer after 11am) else latest unk after noon
  let pmOutP: P | undefined;
  if (outs.length) {
    pmOutP = [...outs].reverse().find((p) => p.mins >= 11 * 60) ?? outs[outs.length - 1];
  } else if (unks.length) {
    pmOutP = [...unks].reverse().find((p) => p.mins >= 12 * 60);
  }
  // Avoid using same punch for both
  if (amInP && pmOutP && amInP === pmOutP) {
    if (sorted.length === 2) {
      // Two punches with same object shouldn't happen; split them
      amInP = sorted[0];
      pmOutP = sorted[1];
    } else {
      pmOutP = undefined;
    }
  }

  const used = new Set<P>();
  if (amInP) used.add(amInP);
  if (pmOutP) used.add(pmOutP);

  let remaining = sorted.filter((p) => !used.has(p));

  // If we failed to pick amIn/pmOut (e.g. only OUTs for amIn), pick from sorted extremes
  if (!amInP && remaining.length + used.size > 0) {
    // Fallback: earliest punch as amIn if it's IN-ish
    const fallback = sorted[0];
    if (!used.has(fallback)) {
      amInP = fallback;
      used.add(fallback);
      remaining = sorted.filter((p) => !used.has(p));
    }
  }
  if (!pmOutP && remaining.length > 0) {
    const fallback = sorted[sorted.length - 1];
    if (!used.has(fallback)) {
      pmOutP = fallback;
      used.add(fallback);
      remaining = sorted.filter((p) => !used.has(p));
    }
  }

  let amOut = '';
  let pmIn = '';

  if (remaining.length === 1) {
    const p = remaining[0];
    if (p.kind === 'OUT') {
      amOut = p.mins < 14 * 60 ? p.time : '';
      if (!amOut) pmIn = p.time;
    } else if (p.kind === 'IN') {
      pmIn = p.mins >= 11 * 60 ? p.time : '';
      if (!pmIn) amOut = p.time;
    } else {
      // unk: decide by time
      if (p.mins < 12 * 60) amOut = p.time;
      else if (p.mins >= 12 * 60 && !pmIn) pmIn = p.time;
      else amOut = p.time;
    }
  } else if (remaining.length >= 2) {
    const remOuts = remaining.filter((p) => p.kind === 'OUT');
    const remIns = remaining.filter((p) => p.kind === 'IN');
    const remUnks = remaining.filter((p) => p.kind == null);

    // amOut: latest OUT before 2pm, else latest unk before 2pm
    if (remOuts.length) {
      const cand = [...remOuts].sort((a, b) => a.mins - b.mins).reverse().find((p) => p.mins < 14 * 60) ?? remOuts[remOuts.length - 1];
      if (cand.mins < 14 * 60 || remOuts.length === 1) amOut = cand.time;
    } else if (remUnks.length) {
      const cand = remUnks.find((p) => p.mins < 13 * 60);
      if (cand) amOut = cand.time;
    }

    // pmIn: earliest IN after 11am, else earliest unk after 11am
    const pmInOutsFiltered = remIns.filter((p) => p.time !== amOut);
    const pmInUnksFiltered = remUnks.filter((p) => p.time !== amOut);
    if (pmInOutsFiltered.length) {
      const cand = pmInOutsFiltered.slice().sort((a, b) => a.mins - b.mins).find((p) => p.mins >= 11 * 60) ?? pmInOutsFiltered[0];
      pmIn = cand.time;
    } else if (pmInUnksFiltered.length) {
      const cand = pmInUnksFiltered.find((p) => p.mins >= 11 * 60);
      if (cand) pmIn = cand.time;
    }

    // Handle >2 remaining with largest-gap fallback when both slots still empty or kind mismatch
    if (remaining.length > 2 && (!amOut || !pmIn)) {
      // Use largest gap among remaining to split amOut/pmIn
      const mids = remaining.map((p) => p.mins).sort((a, b) => a - b);
      let bestGap = -1;
      let bestIdx = 0;
      for (let i = 0; i < mids.length - 1; i++) {
        const gap = mids[i + 1] - mids[i];
        if (gap > bestGap) { bestGap = gap; bestIdx = i; }
      }
      // Try gap boundaries that respect kind
      const leftMins = mids[bestIdx];
      const rightMins = mids[bestIdx + 1];
      const leftP = remaining.find((p) => p.mins === leftMins);
      const rightP = remaining.find((p) => p.mins === rightMins);
      if (!amOut && leftP && (leftP.kind === 'OUT' || leftP.kind == null)) amOut = leftP.time;
      if (!pmIn && rightP && (rightP.kind === 'IN' || rightP.kind == null)) pmIn = rightP.time;
      // If still empty, fill with gap sides regardless
      if (!amOut && leftP) amOut = leftP.time;
      if (!pmIn && rightP && rightP.time !== amOut) pmIn = rightP.time;
    }

    // If both middle punches are same kind, correct over-assignment
    if (amOut && pmIn) {
      const amOutP = remaining.find((p) => p.time === amOut);
      const pmInP = remaining.find((p) => p.time === pmIn);
      if (amOutP?.kind === 'IN' && pmInP?.kind === 'IN') amOut = '';
      if (amOutP?.kind === 'OUT' && pmInP?.kind === 'OUT') pmIn = '';
    }

    // Ensure amOut != pmIn and both not same as amIn/pmOut
    if (amOut && amOut === pmIn) pmIn = '';
    // Deduplicate against extremes
    if (amOut === amInP?.time) amOut = '';
    if (pmIn === pmOutP?.time) pmIn = '';
  }

  return [amInP?.time ?? '', amOut, pmIn, pmOutP?.time ?? ''];
}

/** Collapse RawPunch[] into per-employee per-day 4-slot attendance. */
export function normalizePunches(punches: RawPunch[]): EmployeeAttendance[] {
  const byEmp = new Map<string, Map<string, RawPunch[]>>();
  for (const p of punches) {
    if (!p.employee || !p.date || !p.time) continue;
    let days = byEmp.get(p.employee);
    if (!days) { days = new Map(); byEmp.set(p.employee, days); }
    let list = days.get(p.date);
    if (!list) { list = []; days.set(p.date, list); }
    list.push(p);
  }
  const out: EmployeeAttendance[] = [];
  for (const [name, days] of byEmp) {
    const dayMap: DayMap = {};
    for (const [date, list] of days) {
      const hasKind = list.some((p) => p.kind != null);
      const [amIn, amOut, pmIn, pmOut] = hasKind
        ? assignFourSlotsWithKind(list)
        : assignFourSlots(list.map((p) => p.time));
      dayMap[date] = { amIn, amOut, pmIn, pmOut, corrected: false };
    }
    out.push({ name, days: dayMap });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
