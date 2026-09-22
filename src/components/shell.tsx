// Shell — header, stepper, privacy, toast, page container.
import { memo, type ReactNode } from 'react';
import {
  Check,
  Clock3,
  Download,
  Laptop,
  Moon,
  ShieldCheck,
  Sun,
  Trash2,
} from 'lucide-react';
import { Btn } from './ui';
import type { Theme } from '../lib/theme';

const THEME_META: Record<Theme, { icon: typeof Sun; label: string }> = {
  light: { icon: Sun, label: 'Light' },
  dark: { icon: Moon, label: 'Dark' },
  system: { icon: Laptop, label: 'System' },
};

export const TopBar = memo(function TopBar({
  selected,
  theme,
  onTheme,
  onClear,
  onInstall,
  canInstall,
}: {
  selected: number;
  theme: Theme;
  onTheme: () => void;
  onClear: (() => void) | null;
  onInstall: () => void;
  canInstall: boolean;
}) {
  const ThemeIcon = THEME_META[theme].icon;
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/75 backdrop-blur-xl supports-[backdrop-filter]:bg-white/65 dark:border-slate-800 dark:bg-slate-950/70">
      <div className="mx-auto flex h-[56px] w-full max-w-[1160px] items-center gap-3 px-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900"
          >
            <Clock3 className="h-4 w-4" strokeWidth={2.2} />
          </span>
          <div className="min-w-0 leading-none">
            <div className="flex items-baseline gap-2">
              <h1 className="text-[14px] font-semibold tracking-tight">DTR Tool</h1>
              <span className="hidden rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 sm:inline">
                DepEd
              </span>
            </div>
            <p className="hidden text-xs text-slate-500 dark:text-slate-400 sm:block">Privacy-first DTR generator</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {selected > 0 && (
            <span className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {selected} selected
            </span>
          )}
          {canInstall && (
            <Btn size="sm" variant="ghost" onClick={onInstall} aria-label="Install app">
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Install</span>
            </Btn>
          )}
          <Btn size="sm" variant="ghost" onClick={onTheme} aria-label={`Theme ${THEME_META[theme].label}`}>
            <ThemeIcon className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">{THEME_META[theme].label}</span>
          </Btn>
          {onClear && (
            <>
              <span className="mx-1 hidden h-4 w-px bg-slate-200 dark:bg-slate-700 sm:block" aria-hidden />
              <Btn size="sm" variant="ghost" onClick={onClear} className="!text-slate-600 hover:!text-red-600 dark:!text-slate-300">
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Clear</span>
              </Btn>
            </>
          )}
        </div>
      </div>
    </header>
  );
});

export const PrivacyStrip = memo(function PrivacyStrip() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 w-fit">
      <span className="inline-flex items-center gap-1.5 font-semibold tracking-tight text-slate-900 dark:text-white">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white">
          <ShieldCheck className="h-3 w-3" />
        </span>
        Local-only
      </span>
      <span className="h-3 w-px bg-slate-200 dark:bg-slate-700" aria-hidden />
      <span className="inline-flex items-center gap-1">
        <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" /> In-browser
      </span>
      <span className="inline-flex items-center gap-1">
        <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" /> No upload
      </span>
      <span className="inline-flex items-center gap-1">
        <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" /> PWA offline
      </span>
    </div>
  );
});

export const Stepper = memo(function Stepper({
  labels,
  step,
  done,
  onGo,
}: {
  labels: string[];
  step: number;
  done: (s: number) => boolean;
  onGo: (s: number) => void;
}) {
  return (
    <nav aria-label="Progress" className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* Desktop: connected bubbles */}
      <ol className="hidden sm:flex items-start">
        {labels.map((label, i) => {
          const isActive = step === i;
          const isDone = done(i);
          const isPast = i < step || (isDone && !isActive);
          const isClickable = i <= step || isDone;
          const isLast = i === labels.length - 1;
          const connectorDone = i < step;
          return (
            <li key={label} className={`flex items-center ${isLast ? 'shrink-0' : 'flex-1'}`}>
              <button
                type="button"
                onClick={() => onGo(i)}
                disabled={!isClickable}
                aria-current={isActive ? 'step' : undefined}
                className="group flex flex-col items-center gap-2 text-center disabled:cursor-not-allowed"
              >
                <span
                  className={`grid h-9 w-9 place-items-center rounded-full border-2 text-xs font-bold transition-all ${
                    isActive
                      ? 'border-slate-900 bg-slate-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-slate-900'
                      : isPast
                        ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm dark:border-emerald-500 dark:bg-emerald-600'
                        : 'border-slate-300 bg-white text-slate-500 group-hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {isPast && !isActive ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <span>{i + 1}</span>}
                </span>
                <span
                  className={`max-w-[90px] text-xs font-medium leading-tight ${isActive ? 'text-slate-900 dark:text-white' : isPast ? 'text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  {label}
                </span>
              </button>
              {!isLast && (
                <div
                  className={`mx-2 hidden h-0.5 flex-1 rounded-full transition-colors sm:block ${connectorDone ? 'bg-slate-900 dark:bg-white' : 'bg-slate-200 dark:bg-slate-700'}`}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* Mobile: pills */}
      <ol className="flex gap-1.5 sm:hidden">
        {labels.map((label, i) => {
          const isActive = step === i;
          const isDone = done(i);
          const isPast = i < step || (isDone && !isActive);
          const isClickable = i <= step || isDone;
          return (
            <li key={label} className="shrink-0">
              <button
                type="button"
                onClick={() => onGo(i)}
                disabled={!isClickable}
                aria-current={isActive ? 'step' : undefined}
                className={`flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                  isActive
                    ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                    : isPast
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-300'
                      : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
                }`}
              >
                <span
                  className={`grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold ${isActive ? 'bg-white text-slate-900 dark:bg-slate-900 dark:text-white' : isPast ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}
                >
                  {isPast && !isActive ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
                </span>
                {label}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800 sm:hidden" aria-hidden>
        <div className="h-full bg-slate-900 transition-all duration-500 dark:bg-white" style={{ width: `${((step + 1) / labels.length) * 100}%` }} />
      </div>
    </nav>
  );
});

export const Toast = memo(function Toast({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 left-1/2 z-50 flex max-w-[90vw] -translate-x-1/2 items-center gap-3 rounded-full border border-slate-900 bg-slate-900 px-4 py-2.5 text-[13px] font-medium text-white shadow-xl dark:border-white dark:bg-white dark:text-slate-900"
    >
      <span className="grid h-6 w-6 place-items-center rounded-full bg-white/15 dark:bg-slate-900/10">
        <Check className="h-3.5 w-3.5" />
      </span>
      <span className="truncate pr-1">{msg}</span>
    </div>
  );
});

export function Page({ children }: { children: ReactNode }) {
  return <div className="page mx-auto flex w-full max-w-[1160px] flex-col gap-5 px-4 pb-16 pt-6 sm:px-5 sm:pt-8">{children}</div>;
}
