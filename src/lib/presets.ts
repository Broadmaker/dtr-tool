// Saved column-mapping presets — prefs only, never attendance data.
// A preset remembers which column is which for one biometric header layout,
// so the next upload from the same machine is zero-click.
import type { ColumnMap } from './columns';

export interface MappingPreset {
  name: string;
  fingerprint: string;
  map: ColumnMap;
}

const K = 'dtr-tool:presets:v1';

/** Normalize headers the same way the auto-mapper sees them. */
export function normalizeHeaders(headers: string[]): string[] {
  return headers.map((h) => h.toLowerCase().replace(/[_\s]+/g, ' ').trim());
}

/**
 * Fingerprint a header layout. Ordered (not sorted): column positions matter
 * because the saved map stores indices. Length is included so a truncated or
 * extended export never silently matches.
 */
export function fingerprintHeaders(headers: string[]): string {
  const norm = normalizeHeaders(headers);
  const sep = String.fromCharCode(31);
  const body = `${norm.length}:${norm.join(sep)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) {
    h ^= body.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `h${(h >>> 0).toString(16)}`;
}

function isValidMap(m: unknown): m is ColumnMap {
  if (!m || typeof m !== 'object') return false;
  const o = m as Record<string, unknown>;
  return (['employee', 'date', 'time', 'kind'] as const).every(
    (k) => typeof o[k] === 'number' && Number.isInteger(o[k]) && (o[k] as number) >= -1,
  );
}

function isValidPreset(p: unknown): p is MappingPreset {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return typeof o.name === 'string' && !!o.name && typeof o.fingerprint === 'string' && !!o.fingerprint && isValidMap(o.map);
}

export function loadPresets(): MappingPreset[] {
  try {
    const raw = localStorage.getItem(K);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(isValidPreset).slice(0, 50);
  } catch { return []; }
}

function persist(list: MappingPreset[]) {
  try { localStorage.setItem(K, JSON.stringify(list.slice(0, 50))); } catch { /* ignore */ }
}

/** A preset only matches the exact header layout it was saved from. */
export function findPreset(headers: string[]): MappingPreset | null {
  const fp = fingerprintHeaders(headers);
  return loadPresets().find((p) => p.fingerprint === fp) ?? null;
}

/** True when every mapped index points at a real column of this layout. */
export function presetFitsLayout(preset: MappingPreset, headerCount: number): boolean {
  return (Object.values(preset.map) as number[]).every((i) => i === -1 || (i >= 0 && i < headerCount));
}

export function savePreset(name: string, headers: string[], map: ColumnMap): MappingPreset[] {
  const clean = name.trim().slice(0, 60);
  if (!clean) return loadPresets();
  const fp = fingerprintHeaders(headers);
  const next = loadPresets().filter((p) => p.fingerprint !== fp);
  next.unshift({ name: clean, fingerprint: fp, map: { ...map } });
  persist(next);
  return next;
}

export function deletePreset(fingerprint: string): MappingPreset[] {
  const next = loadPresets().filter((p) => p.fingerprint !== fingerprint);
  persist(next);
  return next;
}
