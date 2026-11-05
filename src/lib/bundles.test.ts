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

  it('prints no verifier position while the Setup toggle is off (classic layout)', () => {
    const b = buildBundles({
      employees: [{ name: 'amy', days: {} }],
      overrides: {},
      leaves: {},
      empInfos: { amy: { position: 'Teacher III', verifier: 'MARIA SANTOS', verifierPosition: 'Principal I' } },
      prefs: { ...prefs, showVerifierPosition: false },
      month: 9,
      year: 2026,
      holidays: [],
      selected: new Set(['amy']),
    });
    expect(b[0].info.verifierPosition).toBe('');
  });

  it('never borrows the employee position as a hidden default for the verifier', () => {
    const base = {
      employees: [{ name: 'amy', days: {} }, { name: 'zed', days: {} }],
      overrides: {},
      leaves: {},
      month: 9,
      year: 2026,
      holidays: [],
      selected: new Set(['amy', 'zed']),
      prefs: { ...prefs, verifierPosition: '', showVerifierPosition: true },
    };
    // Own verifier position is used as typed…
    const own = buildBundles({
      ...base,
      empInfos: { amy: { verifierPosition: 'Principal I' } },
    });
    expect(own[0].info.verifierPosition).toBe('Principal I');

    // …but a cleared box stays empty — it must not snap back to 'Teacher III'
    // (the person's Position) or any other stored default.
    const cleared = buildBundles({
      ...base,
      empInfos: { amy: { verifierPosition: '' }, zed: { position: 'Head Teacher III' } },
    });
    expect(cleared[0].info.verifierPosition).toBe('');
    expect(cleared[1].info.verifierPosition).toBe('');
    expect(cleared[1].info.position).toBe('Head Teacher III');
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
