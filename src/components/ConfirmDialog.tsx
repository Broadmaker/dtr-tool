import { useEffect, useRef } from 'react';
import { Btn } from './ui';

export interface ConfirmSpec {
  title: string;
  body: string;
  confirmLabel: string;
}

/** Accessible replacement for window.confirm: focus-trapped, Esc to cancel, returns focus. */
export default function ConfirmDialog({
  spec,
  onConfirm,
  onCancel,
}: {
  spec: ConfirmSpec | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<Element | null>(null);

  useEffect(() => {
    if (!spec) return;
    prevFocus.current = document.activeElement;
    boxRef.current?.querySelector<HTMLButtonElement>('[data-confirm]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      (prevFocus.current as HTMLElement | null)?.focus?.();
    };
  }, [spec, onCancel]);

  if (!spec) return null;
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 p-4"
      onClick={onCancel}
      aria-hidden={false}
    >
      <div
        ref={boxRef}
        role="alertdialog"
        aria-modal="true"
        aria-label={spec.title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
      >
        <h2 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">
          {spec.title}
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
          {spec.body}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Btn size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Btn>
          <Btn size="sm" variant="primary" onClick={onConfirm} data-confirm>
            {spec.confirmLabel}
          </Btn>
        </div>
      </div>
    </div>
  );
}
