import { describe, expect, it } from 'vitest';
import type { DayMap } from './types';
import type { ExportBundle } from './export';
import { resolveMonth } from './rules';
import { buildDtrPdf, bundleToPdfBytes } from './pdf';

function bundle(
  month: number,
  year: number,
  opts: { name?: string; days?: DayMap; holidays?: ExportBundle['holidays']; leaves?: ExportBundle['leaves'] } = {},
): ExportBundle {
  const holidays = opts.holidays ?? [];
  const leaves = opts.leaves ?? [];
  return {
    info: {
      name: opts.name ?? 'JUAN DELA CRUZ',
      position: 'Teacher III',
      office: 'San Example Elementary School',
      officialHours: '8:00AM–12:00NN & 1:00PM–5:00PM',
      verifier: 'MARIA SANTOS',
    },
    month,
    year,
    days: resolveMonth(opts.days ?? {}, month, year, holidays, leaves),
    holidays,
    leaves,
  };
}

describe('buildDtrPdf', () => {
  it('uses A4 portrait geometry', async () => {
    const doc = await buildDtrPdf(bundle(9, 2026));
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(210, 1);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(297, 1);
  });

  it('prints two identical copies per page, like the print sheet', async () => {
    const doc = await buildDtrPdf(bundle(9, 2026), { compress: false });
    const raw = new TextDecoder('latin1').decode(doc.output('arraybuffer') as ArrayBuffer);
    // The title is drawn once per copy → exactly two copies on the page.
    expect(raw.split('(DAILY TIME RECORD)').length - 1).toBe(2);
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('fits a 31-day month on exactly one page', async () => {
    const doc = await buildDtrPdf(bundle(8, 2026)); // August: 31 days
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('fits February (28 days) on exactly one page', async () => {
    const doc = await buildDtrPdf(bundle(2, 2026));
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('renders punches, holidays and leaves on one page without throwing', async () => {
    const days: DayMap = {
      '2026-09-01': { amIn: '07:32', amOut: '12:01', pmIn: '12:59', pmOut: '17:04', corrected: false },
      '2026-09-02': { amIn: '07:41', amOut: '12:00', pmIn: '13:01', pmOut: '17:02', corrected: true },
    };
    const doc = await buildDtrPdf(
      bundle(9, 2026, {
        days,
        holidays: [{ date: '2026-09-08', description: 'Feast of the Nativity', type: 'Special' }],
        leaves: [{ date: '2026-09-12', leaveType: 'VL' }],
      }),
    );
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('handles very long names/offices without throwing or spilling pages', async () => {
    const doc = await buildDtrPdf(
      bundle(8, 2026, {
        name: 'DELA CRUZ, JUAN MIGUEL SANTOS REYES VILLANUEVA GARCIA FERNANDEZ',
      }),
    );
    expect(doc.getNumberOfPages()).toBe(1);
  });
});

describe('bundleToPdfBytes', () => {
  it('produces a real PDF document', async () => {
    const buf = await bundleToPdfBytes(bundle(9, 2026));
    expect(buf.byteLength).toBeGreaterThan(2000);
    expect(new TextDecoder().decode(buf.slice(0, 5))).toBe('%PDF-');
  });
});
