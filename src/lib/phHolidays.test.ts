import { describe, expect, it } from 'vitest';
import { parseHolidayCsv } from './phHolidays';

describe('parseHolidayCsv', () => {
  it('parses header + rows, defaults unknown type to Special', () => {
    const { entries, skipped } = parseHolidayCsv(
      'date,description,type\n2026-09-01,Local Holiday,Special\n2026-09-08,Holiday,Regular\nbadline\n',
    );
    expect(entries).toEqual([
      { date: '2026-09-01', description: 'Local Holiday', type: 'Special' },
      { date: '2026-09-08', description: 'Holiday', type: 'Regular' },
    ]);
    expect(skipped).toBe(1);
  });

  it('accepts US slash dates and dedupes', () => {
    const { entries } = parseHolidayCsv('9/1/2026,X,Special\n2026-09-01,Y,Regular\n');
    expect(entries).toEqual([{ date: '2026-09-01', description: 'X', type: 'Special' }]);
  });
});
