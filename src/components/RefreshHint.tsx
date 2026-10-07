import { RotateCw } from 'lucide-react';

/**
 * Plain-language recovery hint for non-technical users. The app updates
 * itself, but a browser can occasionally show a saved (stale) copy —
 * a hard refresh fixes that without losing anything (work lives in
 * tab memory anyway until cleared).
 */
export default function RefreshHint() {
  return (
    <aside
      aria-label="Troubleshooting tip"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-slate-900 dark:text-white">
        <RotateCw className="h-3.5 w-3.5" aria-hidden /> Something looks off?
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        After an update your browser may show an old saved copy. Hold{' '}
        <kbd className="rounded border border-slate-200 bg-slate-50 px-1 font-sans font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">Ctrl</kbd>{' '}
        +{' '}
        <kbd className="rounded border border-slate-200 bg-slate-50 px-1 font-sans font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">Shift</kbd>{' '}
        and press{' '}
        <kbd className="rounded border border-slate-200 bg-slate-50 px-1 font-sans font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">R</kbd>{' '}
        <span className="text-slate-400 dark:text-slate-500">(Mac: ⌘ + Shift + R)</span> to reload fresh.
      </p>
    </aside>
  );
}
