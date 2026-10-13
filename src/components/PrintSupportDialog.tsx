import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Printer } from 'lucide-react';
import { SUPPORT } from '../lib/support';
import { Btn } from './ui';

/**
 * WinRAR-style support reminder: shown on every print, never blocking.
 * Every dismissal path (Continue, Skip, Esc, backdrop) proceeds to print —
 * the QR is an invitation, not a gate. Free forever.
 */
export default function PrintSupportDialog({
  title,
  onProceed,
}: {
  title: string;
  onProceed: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<Element | null>(null);
  const [expanded, setExpanded] = useState(false);
  // Shareware-style beat: the button unlocks after a short pause.
  const [remaining, setRemaining] = useState(5);

  useEffect(() => {
    if (remaining <= 0) {
      boxRef.current?.querySelector<HTMLButtonElement>('[data-proceed]')?.focus();
      return;
    }
    const timer = window.setTimeout(() => setRemaining((n) => n - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [remaining]);

  useEffect(() => {
    prevFocus.current = document.activeElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (expanded) setExpanded(false);
        else onProceed();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (!expanded) (prevFocus.current as HTMLElement | null)?.focus?.();
    };
  }, [onProceed, expanded]);

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 p-4"
      onClick={onProceed}
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-label="Support the project (optional)"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-xl dark:border-slate-700 dark:bg-slate-900"
      >
        <h2 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">
          {title}
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
          DTR Tool stays free through user support. If it saved you time today, please scan to contribute.
        </p>
        {SUPPORT.donateUrl && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label="Enlarge donation QR code"
            title="Click to enlarge"
            className="mx-auto mt-3 block w-fit cursor-zoom-in rounded-xl border border-slate-200 bg-white p-2 transition hover:border-slate-300 hover:shadow dark:border-slate-700 dark:bg-slate-950"
          >
            <QRCodeSVG
              value={SUPPORT.donateUrl}
              size={160}
              level="H"
              bgColor="#FFFFFF"
              fgColor="#000000"
              marginSize={4}
              aria-hidden
            />
          </button>
        )}
        {expanded && SUPPORT.donateUrl && (
          <div
            className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/70 p-4"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Donation QR code enlarged"
              className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-2xl dark:border-slate-700 dark:bg-slate-950"
            >
              <QRCodeSVG
                value={SUPPORT.donateUrl}
                size={300}
                level="H"
                bgColor="#FFFFFF"
                fgColor="#000000"
                marginSize={4}
              />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Scan to support · click anywhere to go back
              </p>
            </div>
          </div>
        )}
        {SUPPORT.donateOptions.length > 1 && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Prefer{' '}
            {SUPPORT.donateOptions.slice(1).map((opt, i) => (
              <span key={opt.label}>
                {i > 0 && ' or '}
                <a
                  href={opt.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="font-medium underline decoration-slate-300 underline-offset-2 hover:text-slate-700 dark:decoration-slate-600 dark:hover:text-slate-200"
                >
                  {opt.label}
                </a>
              </span>
            ))}
            ?
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2">
          <Btn
            size="sm"
            variant="primary"
            onClick={onProceed}
            data-proceed
            className="w-full"
            disabled={remaining > 0}
          >
            <Printer className="h-3.5 w-3.5" />{' '}
            {remaining > 0 ? `Continue to print (${remaining}s)` : 'Continue to print'}
          </Btn>
        </div>
        <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
          Contributions keep this tool free for every school.
        </p>
      </div>
    </div>
  );
}
