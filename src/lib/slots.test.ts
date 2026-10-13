import { describe, expect, it } from 'vitest';
import { assignFourSlots, assignFourSlotsWithKind, normalizePunches } from './slots';

describe('assignFourSlots (time-only heuristic)', () => {
  it('returns blanks for no punches', () => {
    expect(assignFourSlots([])).toEqual(['', '', '', '']);
  });

  it('single punch goes to AM-IN', () => {
    expect(assignFourSlots(['07:32'])).toEqual(['07:32', '', '', '']);
  });

  it('two morning punches stay in AM', () => {
    expect(assignFourSlots(['07:32', '11:30'])).toEqual(['07:32', '11:30', '', '']);
  });

  it('two afternoon punches stay in PM', () => {
    expect(assignFourSlots(['13:00', '17:04'])).toEqual(['', '', '13:00', '17:04']);
  });

  it('two punches straddling noon become AM-IN + PM-OUT', () => {
    expect(assignFourSlots(['07:32', '17:04'])).toEqual(['07:32', '', '', '17:04']);
  });

  it('four punches map in order', () => {
    expect(assignFourSlots(['07:32', '12:01', '12:59', '17:04'])).toEqual([
      '07:32',
      '12:01',
      '12:59',
      '17:04',
    ]);
  });

  it('5+ punches split middle at largest middle gap (known heuristic limit)', () => {
    // NOTE: the gap search only runs over middle punches (excludes first/last),
    // so a duplicate morning scan splits early. Locked as current behavior —
    // see next-steps.md "slot assignment is heuristic".
    expect(assignFourSlots(['07:32', '07:35', '12:00', '12:59', '17:04'])).toEqual([
      '07:32',
      '07:35',
      '12:00',
      '17:04',
    ]);
  });
});

describe('assignFourSlotsWithKind', () => {
  it('single late OUT goes to PM-OUT, not AM-IN', () => {
    expect(assignFourSlotsWithKind([{ employee: 'A', date: '2026-09-01', time: '17:04', kind: 'OUT', sourceRow: 1 }])).toEqual([
      '',
      '',
      '',
      '17:04',
    ]);
  });

  it('single morning OUT goes to AM-OUT', () => {
    expect(assignFourSlotsWithKind([{ employee: 'A', date: '2026-09-01', time: '11:30', kind: 'OUT', sourceRow: 1 }])).toEqual([
      '',
      '11:30',
      '',
      '',
    ]);
  });

  it('falls back to heuristic when no kinds', () => {
    expect(
      assignFourSlotsWithKind([
        { employee: 'A', date: '2026-09-01', time: '07:32', kind: null, sourceRow: 1 },
        { employee: 'A', date: '2026-09-01', time: '17:04', kind: null, sourceRow: 2 },
      ]),
    ).toEqual(['07:32', '', '', '17:04']);
  });
});

describe('normalizePunches', () => {
  it('groups by employee/day and sorts employees', () => {
    const out = normalizePunches([
      { employee: 'Zed', date: '2026-09-01', time: '17:04', kind: null, sourceRow: 2 },
      { employee: 'Zed', date: '2026-09-01', time: '07:32', kind: null, sourceRow: 1 },
      { employee: 'Amy', date: '2026-09-01', time: '08:00', kind: null, sourceRow: 3 },
    ]);
    expect(out.map((e) => e.name)).toEqual(['Amy', 'Zed']);
    expect(out[1].days['2026-09-01']).toMatchObject({ amIn: '07:32', pmOut: '17:04' });
  });

  it('skips rows missing employee/date/time', () => {
    const out = normalizePunches([
      { employee: '', date: '2026-09-01', time: '08:00', kind: null, sourceRow: 1 },
      { employee: 'Amy', date: '', time: '08:00', kind: null, sourceRow: 2 },
    ]);
    expect(out).toEqual([]);
  });
});
