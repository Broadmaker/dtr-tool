// Encrypted session checkpoint — explicit, user-initiated save/load of
// in-progress work as a password-protected `.dtrvault` file.
//
// Privacy model: nothing is auto-persisted. The file is encrypted locally
// with WebCrypto (PBKDF2-SHA256 → AES-GCM-256); the password never leaves
// the browser and is never stored.
import type { ParseResult } from './parser';
import type { DayEntry, EmployeeInfo, HolidayEntry, LeaveEntry } from './types';

export interface SessionSnapshot {
  version: 1;
  savedAt: number;
  /** Original upload name (display only) */
  fileName: string;
  month: number;
  year: number;
  activeEmp: string;
  selected: string[];
  overrides: Record<string, Record<string, DayEntry>>;
  holidays: HolidayEntry[];
  leaves: Record<string, LeaveEntry[]>;
  empInfos: Record<string, Partial<EmployeeInfo>>;
  employees: ParseResult['employees'];
  punches: ParseResult['punches'];
  sheetName: string;
  warnings: string[];
  matrixAssumed?: { month: number; year: number };
}

interface Envelope {
  v: 1;
  algo: 'PBKDF2-SHA256/AES-GCM-256';
  iter: number;
  salt: string;
  iv: string;
  data: string;
}

const ITERATIONS = 100_000;
const MIN_PASSWORD = 4;

function b64encode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s.trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function keyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Serialize + encrypt a snapshot. Throws on short password. */
export async function encryptSnapshot(snapshot: SessionSnapshot, password: string): Promise<string> {
  if (!password || password.length < MIN_PASSWORD) {
    throw new Error(`Password must be at least ${MIN_PASSWORD} characters.`);
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFromPassword(password, salt);
  const plain = new TextEncoder().encode(JSON.stringify(snapshot));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plain as BufferSource));
  const envelope: Envelope = {
    v: 1,
    algo: 'PBKDF2-SHA256/AES-GCM-256',
    iter: ITERATIONS,
    salt: b64encode(salt),
    iv: b64encode(iv),
    data: b64encode(cipher),
  };
  return JSON.stringify(envelope);
}

/** Decrypt + parse a checkpoint file. Wrong password and corruption share one message. */
export async function decryptSnapshot(fileText: string, password: string): Promise<SessionSnapshot> {
  const fail = () => new Error('Wrong password or corrupted checkpoint file.');
  let env: Envelope;
  try {
    env = JSON.parse(fileText) as Envelope;
  } catch {
    throw fail();
  }
  if (!env || env.v !== 1 || !env.salt || !env.iv || !env.data) throw fail();
  try {
    const key = await keyFromPassword(password, b64decode(env.salt));
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64decode(env.iv) as BufferSource },
      key,
      b64decode(env.data) as BufferSource,
    );
    const snap = JSON.parse(new TextDecoder().decode(plain)) as SessionSnapshot;
    if (!snap || snap.version !== 1 || !Array.isArray(snap.employees) || !Array.isArray(snap.punches)) {
      throw fail();
    }
    return snap;
  } catch (e) {
    if (e instanceof Error && e.message === fail().message) throw e;
    throw fail();
  }
}

/** Rebuild a ParseResult from a snapshot (preview grid is synthetic). */
export function snapshotToParseResult(snap: SessionSnapshot): ParseResult {
  const rows: unknown[][] = [];
  for (const e of snap.employees) {
    for (const iso of Object.keys(e.days).sort()) {
      const d = e.days[iso];
      rows.push([e.name, iso, d.amIn, d.amOut, d.pmIn, d.pmOut]);
    }
  }
  return {
    punches: snap.punches,
    employees: snap.employees,
    sheetName: snap.sheetName,
    warnings: snap.warnings,
    preview: {
      sheetName: snap.sheetName,
      headers: ['Employee', 'Date', 'AM-IN', 'AM-OUT', 'PM-IN', 'PM-OUT'],
      rows,
      totalRows: rows.length,
    },
    matrixAssumed: snap.matrixAssumed,
  };
}

export function downloadTextFile(text: string, filename: string, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
