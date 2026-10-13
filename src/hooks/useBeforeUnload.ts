import { useEffect } from 'react';

/** Warn before refresh/close while attendance is in memory (privacy model = tab memory only). */
export function useBeforeUnload(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [active]);
}
