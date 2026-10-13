import { describe, expect, it } from 'vitest';
import { normalizeDate, normalizeTime } from './dateUtils';

describe('normalizeTime', () => {
  it('parses common variants to HH:MM', () => {
    expect(normalizeTime('07:32')).toBe('07:32');
    expect(normalizeTime('7:32 AM')).toBe('07:32');
    expect(normalizeTime('07:32:00')).toBe('07:32');
    expect(normalizeTime('1:05 PM')).toBe('13:05');
    expect(normalizeTime(0.5)).toBe('12:00'); // Excel fraction = noon
  });

  it('returns empty for placeholders', () => {
    expect(normalizeTime('--')).toBe('');
    expect(normalizeTime('Absence')).toBe('');
    expect(normalizeTime('nonsense')).toBe('');
  });
});

describe('normalizeDate', () => {
  it('parses ISO, US slash, and Excel serials', () => {
    expect(normalizeDate('2026-09-01')).toBe('2026-09-01');
    expect(normalizeDate('9/1/2026')).toBe('2026-09-01');
    expect(normalizeDate(new Date(2026, 8, 1))).toBe('2026-09-01');
  });

  it('returns empty for blank', () => {
    expect(normalizeDate('')).toBe('');
    expect(normalizeDate(null)).toBe('');
  });
});
