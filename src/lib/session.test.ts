import { describe, expect, it } from 'vitest';
import { decryptSnapshot, encryptSnapshot, snapshotToParseResult, type SessionSnapshot } from './session';

const snap: SessionSnapshot = {
  version: 1,
  savedAt: 123,
  fileName: 'bio.xlsx',
  month: 9,
  year: 2026,
  activeEmp: 'amy',
  selected: ['amy'],
  overrides: { amy: { '2026-09-01': { amIn: '08:00', amOut: '', pmIn: '', pmOut: '', corrected: true } } },
  holidays: [],
  leaves: {},
  empInfos: { amy: { position: 'Teacher III' } },
  employees: [{ name: 'amy', days: {} }],
  punches: [],
  sheetName: 'Sheet1',
  warnings: [],
};

describe('session checkpoint crypto', () => {
  it('round-trips through encrypt/decrypt', async () => {
    const text = await encryptSnapshot(snap, 'correct horse');
    expect(text).not.toContain('amy');
    const back = await decryptSnapshot(text, 'correct horse');
    expect(back).toEqual({ ...snap });
  });

  it('rejects short passwords', async () => {
    await expect(encryptSnapshot(snap, 'abc')).rejects.toThrow(/at least 4/);
  });

  it('wrong password and tampered files share one error', async () => {
    const text = await encryptSnapshot(snap, 'correct horse');
    await expect(decryptSnapshot(text, 'wrong password')).rejects.toThrow(/Wrong password or corrupted/);
    const tampered = text.slice(0, -5) + 'XXXXX';
    await expect(decryptSnapshot(tampered, 'correct horse')).rejects.toThrow(/Wrong password or corrupted/);
    await expect(decryptSnapshot('not json', 'correct horse')).rejects.toThrow(/Wrong password or corrupted/);
  });

  it('rebuilds a parse result with a synthetic preview', () => {
    const r = snapshotToParseResult(snap);
    expect(r.employees.length).toBe(1);
    expect(r.preview.headers).toContain('Employee');
  });
});
