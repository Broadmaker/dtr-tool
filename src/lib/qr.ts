// Real QR payload for the printed DTR (replaces the old decorative placeholder).
// Kept deliberately SHORT: the printed code is only ~9.5mm, so a dense QR
// would be unscannable. Payload = human-readable summary + integrity checksum.
// Anyone can verify: recompute FNV-1a over the canonical day-times string and
// compare with CHK.
import type { EmployeeInfo, ResolvedDay } from './types';
import { totalUndertime } from './rules';

/** Canonical day-times string: "2026-08-01:07:32,12:00,13:00,17:04;…" */
export function canonicalDayString(days: ResolvedDay[]): string {
  return [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => `${d.date}:${d.entry.amIn},${d.entry.amOut},${d.entry.pmIn},${d.entry.pmOut}`)
    .join(';');
}

/** FNV-1a 32-bit → 8 hex chars. Tiny, dependency-free, fine for tamper-evidence. */
export function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** e.g. "DTR-TOOLv1|DELA CRUZ, JUAN|2026-08|PRESENT:22|UT:01h15m|CHK:9f3ac21e" */
export function buildQRPayload(info: EmployeeInfo, month: number, year: number, days: ResolvedDay[]): string {
  const name = (info.name || 'EMPLOYEE').toUpperCase().replace(/\s+/g, ' ').trim();
  const period = `${year}-${String(month).padStart(2, '0')}`;
  const present = days.filter((d) => d.hasPunch).length;
  const ut = totalUndertime(days);
  const canonical = `${name}|${period}|${canonicalDayString(days)}`;
  const chk = shortHash(canonical);
  const uth = String(ut.h).padStart(2, '0');
  const utm = String(ut.m).padStart(2, '0');
  return `DTR-TOOLv1|${name}|${period}|PRESENT:${present}|UT:${uth}h${utm}m|CHK:${chk}`;
}
