import { Coffee, ExternalLink, MessageCircle } from 'lucide-react';
import { SUPPORT } from '../lib/support';

/**
 * Visible-but-optional support card. Lives beside the upload dropzone so
 * first-time users see it, with clear "free forever" wording so it never
 * reads as a toll. Links are external and maintainer-owned (see support.ts).
 */
export default function SupportCard() {
  if (!SUPPORT.donateUrl && !SUPPORT.helpUrl) return null;
  return (
    <aside
      aria-label="Support the project"
      className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-500 text-white shadow-sm"
        >
          <Coffee className="h-5 w-5" />
        </span>
        <div>
          <p className="text-[13px] font-semibold tracking-tight text-slate-900 dark:text-white">
            Enjoying the tool?
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Free forever · donations optional</p>
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
        Chip in to keep it running — voluntary, never required, and not payment for any official service.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {SUPPORT.donateUrl && (
          <a
            href={SUPPORT.donateUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-600"
          >
            <Coffee className="h-3.5 w-3.5" aria-hidden /> Buy me a coffee
            <ExternalLink className="h-3 w-3 opacity-70" aria-hidden />
          </a>
        )}
        {SUPPORT.helpUrl && (
          <a
            href={SUPPORT.helpUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:text-white"
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden /> Report an issue
          </a>
        )}
      </div>
    </aside>
  );
}
