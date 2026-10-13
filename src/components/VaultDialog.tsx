import { useEffect, useRef, useState } from 'react';
import { Btn } from './ui';

/** Password prompt for encrypted checkpoints — password is used once and never stored. */
export default function VaultDialog({
  mode,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  mode: 'save' | 'load';
  busy: boolean;
  error: string;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const prevFocus = useRef<Element | null>(null);

  useEffect(() => {
    prevFocus.current = document.activeElement;
    inputRef.current?.focus();
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
  }, [onCancel]);

  const submit = () => {
    const pw = password;
    setPassword('');
    onSubmit(pw);
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 p-4" onClick={onCancel}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'save' ? 'Save encrypted checkpoint' : 'Open encrypted checkpoint'}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
      >
        <h2 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">
          {mode === 'save' ? 'Save encrypted checkpoint' : 'Open encrypted checkpoint'}
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
          {mode === 'save'
            ? 'Protects attendance data with a password. Keep it — a forgotten password cannot be recovered.'
            : 'Enter the password used when this checkpoint was saved.'}
        </p>
        <label className="mt-3 flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-slate-700 dark:text-slate-200">Password</span>
          <input
            ref={inputRef}
            type="password"
            autoComplete={mode === 'save' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={4}
            required
            disabled={busy}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
        {error && (
          <p role="alert" className="mt-2 text-[13px] text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Btn
            size="sm"
            variant="ghost"
            onClick={() => {
              setPassword('');
              onCancel();
            }}
          >
            Cancel
          </Btn>
          <Btn size="sm" variant="primary" disabled={busy || password.length < 4} type="submit">
            {busy ? 'Working…' : mode === 'save' ? 'Save file' : 'Open'}
          </Btn>
        </div>
      </form>
    </div>
  );
}
