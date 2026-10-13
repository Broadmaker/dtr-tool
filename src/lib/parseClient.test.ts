import { describe, expect, it } from 'vitest';
import { parseFile, readGrid } from './parseClient';
import { parseBiometricFile } from './parser';
import { makeSampleFile } from './sample';

describe('parseClient (worker-first with main-thread fallback)', () => {
  it('parses the sample workbook (via worker or identical fallback)', async () => {
    const f = await makeSampleFile();
    const [a, b] = await Promise.all([parseFile(f), parseBiometricFile(f)]);
    expect(a.employees.length).toBe(2);
    expect(a).toEqual(b);
  });

  it('reads the header grid for mapping', async () => {
    const f = await makeSampleFile();
    const grid = await readGrid(f);
    expect(grid.headers.length).toBeGreaterThan(0);
    expect(grid.totalRows).toBeGreaterThan(0);
  });

  it('preserves mapper-grade error messages for unreadable files', async () => {
    const bad = new File(['<html>not a workbook</html>'], 'bad.html', { type: 'text/html' });
    const via = await parseFile(bad).then(
      () => 'parsed?!',
      (e) => (e instanceof Error ? e.message : String(e)),
    );
    const direct = await parseBiometricFile(bad).then(
      () => 'parsed?!',
      (e) => (e instanceof Error ? e.message : String(e)),
    );
    expect(via).toBe(direct);
  });
});
