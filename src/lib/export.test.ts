import { describe, expect, it } from 'vitest';
import type { ExportBundle } from './export';
import { buildBatchWorkbook, loadJSZip, safeCell, uniqueSheetName, uniqueZipName } from './export';

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

function bundle(name: string): ExportBundle {
  return {
    info: { name, position: '', office: '', officialHours: '', verifier: '', verifierPosition: '' },
    month: 9,
    year: 2026,
    days: [],
    holidays: [],
    leaves: [],
  };
}

describe('uniqueSheetName', () => {
  it('passes through a fresh name', () => {
    expect(uniqueSheetName('JUAN DELA CRUZ', new Set())).toBe('JUAN DELA CRUZ');
  });

  it('suffixes exact duplicates instead of throwing in book_append_sheet', () => {
    const used = new Set<string>();
    expect(uniqueSheetName('JUAN DELA CRUZ', used)).toBe('JUAN DELA CRUZ');
    expect(uniqueSheetName('JUAN DELA CRUZ', used)).toBe('JUAN DELA CRUZ (2)');
    expect(uniqueSheetName('JUAN DELA CRUZ', used)).toBe('JUAN DELA CRUZ (3)');
  });

  it('treats names as case-insensitive (Excel requirement)', () => {
    const used = new Set<string>();
    uniqueSheetName('DTR', used);
    expect(uniqueSheetName('dtr', used)).toBe('dtr (2)');
  });

  it('falls back for empty names and keeps them unique', () => {
    const used = new Set<string>();
    expect(uniqueSheetName('', used)).toBe('DTR');
    expect(uniqueSheetName('', used)).toBe('DTR (2)');
  });

  it('keeps suffixed names within the 31-char Excel limit', () => {
    const used = new Set<string>();
    const long = 'A'.repeat(40);
    const first = uniqueSheetName(long, used);
    const second = uniqueSheetName(long, used);
    expect(first.length).toBeLessThanOrEqual(31);
    expect(second.length).toBeLessThanOrEqual(31);
    expect(second).not.toBe(first);
  });
});

describe('buildBatchWorkbook (duplicate employees)', () => {
  it('exports same-name employees as separate sheets without throwing', async () => {
    const wb = await buildBatchWorkbook([bundle('JUAN DELA CRUZ'), bundle('JUAN DELA CRUZ')]);
    expect(wb.SheetNames).toEqual(['JUAN DELA CRUZ', 'JUAN DELA CRUZ (2)']);
  });

  it('prints the verifier position directly under the verifier name, only when set', async () => {
    const XLSX = await import('xlsx');
    const withPos = bundle('JUAN DELA CRUZ');
    withPos.info.verifier = 'MARIA SANTOS';
    withPos.info.verifierPosition = 'Principal I';
    const withoutPos = bundle('PEDRO REYES');
    withoutPos.info.verifier = 'MARIA SANTOS';

    const wb = await buildBatchWorkbook([withPos, withoutPos]);
    const rowsWith = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['JUAN DELA CRUZ'], { header: 1 });
    const rowsWithout = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['PEDRO REYES'], { header: 1 });
    const flatWith = rowsWith.map((r) => r[0]);
    const flatWithout = rowsWithout.map((r) => r[0]);

    const vi = flatWith.indexOf('Verified as to the prescribed office hours');
    expect(flatWith.slice(vi + 1, vi + 3)).toEqual(['MARIA SANTOS', 'Principal I']);
    const vj = flatWithout.indexOf('Verified as to the prescribed office hours');
    expect(flatWithout.slice(vj + 1)).toEqual(['MARIA SANTOS']);
  });
});

describe('uniqueZipName', () => {
  it('suffixes colliding filenames instead of overwriting in the ZIP', () => {
    const used = new Set<string>();
    expect(uniqueZipName('DTR_JUAN.xlsx', used)).toBe('DTR_JUAN.xlsx');
    expect(uniqueZipName('DTR_JUAN.xlsx', used)).toBe('DTR_JUAN (2).xlsx');
  });
});

describe('loadJSZip', () => {
  it('resolves to a constructable ZIP engine', async () => {
    const Ctor = await loadJSZip();
    expect(typeof Ctor).toBe('function');
    const zip = new Ctor();
    expect(typeof zip.file).toBe('function');
    expect(typeof zip.generateAsync).toBe('function');
  });
});
