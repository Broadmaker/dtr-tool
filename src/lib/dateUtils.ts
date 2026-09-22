// Shared date helpers. Internal dates are always YYYY-MM-DD.

export function toISODate(y: number, m: number, d: number): string {
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

export function parseISODate(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

export function weekdayOf(iso: string): number {
  const { y, m, d } = parseISODate(iso);
  return new Date(y, m - 1, d).getDay();
}

export function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

export function monthName(month: number): string {
  return new Date(2000, month - 1, 1).toLocaleString('en-US', { month: 'long' }).toUpperCase();
}

export function prettyDate(iso: string): string {
  const { y, m, d } = parseISODate(iso);
  const name = new Date(y, m - 1, d).toLocaleString('en-US', { month: 'short' });
  return `${name}. ${d}`;
}

/** "07:32", "7:32 AM", "07:32:00" → "07:32". Returns '' when unparseable. */
export function normalizeTime(input: unknown): string {
  if (input == null) return '';
  if (typeof input === 'number') {
    // Excel fractional day (e.g. 0.314 = ~7:32 AM)
    if (input >= 0 && input < 1) {
      const totalMin = Math.round(input * 24 * 60);
      const h = Math.floor(totalMin / 60) % 24;
      const m = totalMin % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    return '';
  }
  const s = String(input).trim();
  if (!s || s === '--' || s === '—' || /^(rest|off|leave|holiday)$/i.test(s)) return '';
  // Excel serial datetime as string, or Date object string
  const d = new Date(s);
  const timeMatch = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([APap][Mm])?/);
  if (timeMatch) {
    let h = parseInt(timeMatch[1], 10);
    const min = timeMatch[2];
    const ampm = timeMatch[4]?.toUpperCase();
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${min}`;
  }
  if (!Number.isNaN(d.getTime()) && /\d{4}-\d{2}-\d{2}/.test(s)) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return '';
}

/** Accepts Date objects, Excel serials, "9/1/2026", "2026-09-01", "01-Sep-26". */
export function normalizeDate(input: unknown): string {
  if (input == null) return '';
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return toISODate(input.getFullYear(), input.getMonth() + 1, input.getDate());
  }
  if (typeof input === 'number') {
    // Excel date serial (days since 1899-12-30)
    if (input > 20000 && input < 80000) {
      const base = new Date(1899, 11, 30);
      const d = new Date(base.getTime() + input * 86400000);
      return toISODate(d.getFullYear(), d.getMonth() + 1, d.getDate());
    }
    return '';
  }
  const s = String(input).trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return toISODate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    return toISODate(y, Number(m[1]), Number(m[2]));
  }
  m = s.match(/^(\d{1,2})-([A-Za-z]{3,9})-(\d{2,4})/);
  if (m) {
    const months: Record<string, number> = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    };
    const mo = months[m[2].slice(0, 3).toLowerCase()];
    if (mo) {
      let y = Number(m[3]);
      if (y < 100) y += 2000;
      return toISODate(y, mo, Number(m[1]));
    }
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return toISODate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  return '';
}

/** "07:32" → minutes since midnight for ordering. */
export function toMinutes(t: string): number {
  if (!t) return Number.NaN;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return Number.NaN;
  return h * 60 + m;
}

/** minutes → "07:32". */
export function toHHMM(totalMin: number): string {
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
