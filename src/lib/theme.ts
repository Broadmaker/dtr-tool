// Theme: light/dark/system. Persisted in localStorage (prefs only, never attendance).
export type Theme = 'light' | 'dark' | 'system';

const K = 'dtr-tool:theme:v1';

export function loadTheme(): Theme {
  try {
    const raw = localStorage.getItem(K);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch { /* private mode */ }
  return 'system';
}

/** Resolve effective theme + apply .dark class. Returns 'light' | 'dark'. */
export function applyTheme(t: Theme): 'light' | 'dark' {
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  const effective = t === 'system' ? (mq?.matches ? 'dark' : 'light') : t;
  document.documentElement.classList.toggle('dark', effective === 'dark');
  document.documentElement.style.colorScheme = effective;
  try { localStorage.setItem(K, t); } catch { /* ignore */ }
  return effective;
}
