import { describe, expect, it } from 'vitest';
import { resolveMonth, undertimeForDay, validateDays } from './rules';
import type { DayEntry } from './types';

const day = (p: Partial<DayEntry>): DayEntry => ({
  amIn: '',
  amOut: '',
  pmIn: '',
  pmOut: '',
  corrected: false,
  ...p,
});

describe('resolveMonth', () => {
  it('marks weekends even with no punches', () => {
    // 2026-09-06 is a Sunday
    const days = resolveMonth({}, 9, 2026, [], []);
    const sun = days.find((d) => d.date === '2026-09-06');
    expect(sun?.kind).toBe('weekend');
  });

  it('holiday beats weekend, leave beats weekend', () => {
    const days = resolveMonth(
      {},
      9,
      2026,
      [{ date: '2026-09-06', description: 'X', type: 'Regular' }],
      [{ date: '2026-09-12', leaveType: 'VL' }],
    );
    expect(days.find((d) => d.date === '2026-09-06')?.kind).toBe('holiday');
    expect(days.find((d) => d.date === '2026-09-12')?.kind).toBe('leave');
  });

  it('weekday with no punches is empty, with punches is workday', () => {
    // 2026-09-01 is a Tuesday
    const empty = resolveMonth({}, 9, 2026, [], []);
    expect(empty.find((d) => d.date === '2026-09-01')?.kind).toBe('empty');
    const worked = resolveMonth({ '2026-09-01': day({ amIn: '07:32', amOut: '12:00', pmIn: '13:00', pmOut: '17:00' }) }, 9, 2026, [], []);
    const d = worked.find((x) => x.date === '2026-09-01');
    expect(d?.kind).toBe('workday');
    expect(d?.hasPunch).toBe(true);
    expect(d?.incomplete).toBe(false);
  });

  it('flags incomplete when fewer than 4 slots filled', () => {
    const days = resolveMonth({ '2026-09-01': day({ amIn: '07:32' }) }, 9, 2026, [], []);
    expect(days.find((d) => d.date === '2026-09-01')?.incomplete).toBe(true);
  });
});

describe('validateDays', () => {
  it('warns on incomplete workday but not incomplete-flag on holiday/leave', () => {
    const days = resolveMonth(
      {
        '2026-09-01': day({ amIn: '07:32' }),
        '2026-09-02': day({ amIn: '07:32' }),
      },
      9,
      2026,
      [{ date: '2026-09-02', description: 'H', type: 'Regular' }],
      [],
    );
    const issues = validateDays(days);
    expect(issues.some((i) => i.level === 'warning' && i.date === '2026-09-01')).toBe(true);
    // Holiday punches get their own "holiday punch" warning, never the generic incomplete one.
    expect(issues.some((i) => i.date === '2026-09-02' && i.message.startsWith('Incomplete'))).toBe(false);
    expect(issues.some((i) => i.date === '2026-09-02' && /Holiday punch/.test(i.message))).toBe(true);
  });

  it('emits info for empty weekdays', () => {
    const issues = validateDays(resolveMonth({}, 9, 2026, [], []));
    expect(issues.some((i) => i.level === 'info' && i.date === '2026-09-01')).toBe(true);
  });

  it('flags weekend punches so AOs can verify', () => {
    const days = resolveMonth({ '2026-09-06': day({ amIn: '08:00', amOut: '12:00', pmIn: '13:00', pmOut: '17:00' }) }, 9, 2026, [], []);
    const issues = validateDays(days);
    expect(issues.some((i) => i.date === '2026-09-06')).toBe(true);
  });

  it('treats a clean half-day as info, not an incomplete warning', () => {    const days = resolveMonth(
      {
        '2026-09-01': day({ amIn: '08:00', amOut: '12:00', pmIn: '', pmOut: '' }),
        '2026-09-02': day({ amIn: '08:00', amOut: '', pmIn: '', pmOut: '' }),
      },
      9,
      2026,
      [],
      [],
    );
    const issues = validateDays(days);
    const half = issues.filter((i) => i.date === '2026-09-01');
    expect(half.some((i) => i.level === 'info' && /Half-day \(AM only\)/.test(i.message))).toBe(true);
    expect(half.some((i) => i.message.startsWith('Incomplete'))).toBe(false);
    expect(issues.some((i) => i.date === '2026-09-02' && i.message.startsWith('Incomplete'))).toBe(true);
  });

  it('flags possible overnight shifts for verification, not as errors', () => {
    const days = resolveMonth(
      {
        // 2026-09-01 is a Tuesday
        '2026-09-01': day({ amIn: '02:00', amOut: '06:00', pmIn: '13:00', pmOut: '17:00' }),
        '2026-09-02': day({ amIn: '08:00', amOut: '12:00', pmIn: '13:00', pmOut: '23:30' }),
        '2026-09-03': day({ amIn: '08:00', amOut: '12:00', pmIn: '13:00', pmOut: '17:00' }),
      },
      9,
      2026,
      [],
      [],
    );
    const issues = validateDays(days);
    const over1 = issues.filter((i) => i.date === '2026-09-01');
    expect(over1.some((i) => i.level === 'info' && /overnight/i.test(i.message))).toBe(true);
    expect(over1.every((i) => i.level !== 'error')).toBe(true);
    expect(issues.some((i) => i.date === '2026-09-02' && /overnight/i.test(i.message))).toBe(true);
    expect(issues.some((i) => i.date === '2026-09-03' && /overnight/i.test(i.message))).toBe(false);
  });
});

describe('undertimeForDay', () => {
  it('is zero for weekend/holiday/leave', () => {
    const days = resolveMonth(
      { '2026-09-06': day({ amIn: '08:00', amOut: '12:00', pmIn: '13:00', pmOut: '17:00' }) },
      9,
      2026,
      [],
      [],
    );
    const sun = days.find((d) => d.date === '2026-09-06');
    expect(sun && undertimeForDay(sun).total).toBe(0);
  });

  it('is 480 for empty workday, 0 for full 8h', () => {
    const days = resolveMonth(
      { '2026-09-02': day({ amIn: '08:00', amOut: '12:00', pmIn: '13:00', pmOut: '17:00' }) },
      9,
      2026,
      [],
      [],
    );
    const empty = days.find((d) => d.date === '2026-09-01');
    const full = days.find((d) => d.date === '2026-09-02');
    expect(empty && undertimeForDay(empty).total).toBe(480);
    expect(full && undertimeForDay(full).total).toBe(0);
  });
});
