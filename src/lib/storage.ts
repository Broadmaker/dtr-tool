// Local preferences only (never attendance data) — set-up.md §19.
const K = 'dtr-tool:prefs:v1';
const K_UNDO = 'dtr-tool:undo:v1';

export interface Prefs {
  position: string;
  office: string;
  officialHours: string;
  fileBase: string;
}

const DEFAULTS: Prefs = {
  position: '',
  office: '',
  officialHours: '8:00AM–12:00NN & 1:00PM–5:00PM',
  fileBase: 'DTR',
};

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(K);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* private mode */ }
  return { ...DEFAULTS };
}

export function savePrefs(p: Prefs) {
  try { localStorage.setItem(K, JSON.stringify(p)); } catch { /* ignore */ }
}

/** Last attendance snapshot for session Undo (kept tiny: only when user edits). */
export function saveUndoSnapshot(emp: string, days: Record<string, { amIn: string; amOut: string; pmIn: string; pmOut: string }>) {
  try { localStorage.setItem(K_UNDO, JSON.stringify({ emp, days, at: Date.now() })); } catch { /* ignore */ }
}

export function loadUndoSnapshot(): { emp: string; days: Record<string, { amIn: string; amOut: string; pmIn: string; pmOut: string }> } | null {
  try {
    const raw = localStorage.getItem(K_UNDO);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v?.emp || !v?.days) return null;
    return v;
  } catch { return null; }
}

export function clearUndoSnapshot() {
  try { localStorage.removeItem(K_UNDO); } catch { /* ignore */ }
}
