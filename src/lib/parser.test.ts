import { describe, expect, it } from 'vitest';
import { guessPeriod, parseBiometricFile } from './parser';
import { makeSampleFile } from './sample';

describe('parseBiometricFile (sample workbook smoke test)', () => {
  it('parses the built-in 2-employee sample', async () => {
    const f = await makeSampleFile();
    const r = await parseBiometricFile(f);
    expect(r.employees.length).toBe(2);
    expect(r.punches.length).toBeGreaterThan(0);
    const g = guessPeriod(r.punches);
    expect(g.month).toBeGreaterThanOrEqual(1);
    expect(g.month).toBeLessThanOrEqual(12);
  });
});
