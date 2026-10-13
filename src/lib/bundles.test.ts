import { describe, expect, it } from 'vitest';
import { buildBundles } from './bundles';
import { loadPrefs } from './storage';

const prefs = { ...loadPrefs(), position: 'Teacher III', office: 'Main', officialHours: '8:00AM–12:00NN & 1:00PM–5:00PM', verifier: 'Boss' };

describe('buildBundles', () => {
  it('resolves per-employee info with prefs fallback + uppercase name', () => {
    const b = buildBundles({
      employees: [
        { name: 'amy', days: { '2026-09-01': { amIn: '07:30', amOut: '12:00', pmIn: '13:00', pmOut: '17:00', corrected: false } } },
        { name: 'zed', days: {} },
      ],
      overrides: {},
      leaves: { zed: [{ date: '2026-09-01', leaveType: 'Sick Leave' }] },
      empInfos: { amy: { position: 'Principal' } },
      prefs,
      month: 9,
      year: 2026,
      holidays: [],
      selected: new Set(['amy', 'zed']),
    });
    expect(b.length).toBe(2);
    expect(b[0].info).toMatchObject({ name: 'AMY', position: 'Principal', office: 'Main' });
    expect(b[1].info.name).toBe('ZED');
    // Leave resolves to leave kind, not empty
    expect(b[1].days.find((d) => d.date === '2026-09-01')?.kind).toBe('leave');
    // Workday with full punches is complete
    const amyDay = b[0].days.find((d) => d.date === '2026-09-01');
    expect(amyDay?.kind).toBe('workday');
    expect(amyDay?.incomplete).toBe(false);
  });

  it('scopes to selected employees and applies overrides', () => {
    const b = buildBundles({
      employees: [
        { name: 'amy', days: {} },
        { name: 'zed', days: {} },
      ],
      overrides: { amy: { '2026-09-01': { amIn: '08:00', amOut: '', pmIn: '', pmOut: '', corrected: true } } },
      leaves: {},
      empInfos: {},
      prefs,
      month: 9,
      year: 2026,
      holidays: [{ date: '2026-09-02', description: 'X', type: 'Regular' }],
      selected: new Set(['amy']),
    });
    expect(b.length).toBe(1);
    expect(b[0].days.find((d) => d.date === '2026-09-01')?.incomplete).toBe(true);
    expect(b[0].days.find((d) => d.date === '2026-09-02')?.kind).toBe('holiday');
  });
});
