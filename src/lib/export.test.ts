import { describe, expect, it } from 'vitest';
import { safeCell } from './export';

describe('safeCell (formula-injection guard)', () => {
  it('prefixes Excel formula triggers', () => {
    expect(safeCell('=CMD()')).toBe("'=CMD()");
    expect(safeCell('+123')).toBe("'+123");
    expect(safeCell('-2+3')).toBe("'-2+3");
    expect(safeCell('@user')).toBe("'@user");
  });

  it('leaves normal names untouched', () => {
    expect(safeCell('JUAN DELA CRUZ')).toBe('JUAN DELA CRUZ');
    expect(safeCell('')).toBe('');
  });
});
