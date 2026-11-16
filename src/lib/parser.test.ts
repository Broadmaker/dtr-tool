import { describe, expect, it } from 'vitest';
import { autoMap, guessPeriod, parseBiometricFile } from './parser';
import { makeSampleFile } from './sample';

describe('autoMap', () => {
  it('separates an employee-id column from the name column', () => {
    const map = autoMap(['employee id', 'name', 'date', 'time', 'type']);
    expect(map.employeeNo).toBe(0);
    expect(map.employee).toBe(1);
    expect(map.date).toBe(2);
    expect(map.time).toBe(3);
    expect(map.kind).toBe(4);
  });

  it('detects a bare ID column only alongside a name column', () => {
    expect(autoMap(['id', 'employee name', 'date', 'time']).employeeNo).toBe(0);
    expect(autoMap(['employee', 'date', 'time']).employeeNo).toBe(-1);
  });

  it('does not mistake an employee-id header for the employee name', () => {
    const map = autoMap(['employee no.', 'employee', 'date', 'time']);
    expect(map.employeeNo).toBe(0);
    expect(map.employee).toBe(1);
  });
});

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
