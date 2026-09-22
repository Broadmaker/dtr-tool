// Design primitives — modern, professional, quiet.
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

type Variant = 'primary' | 'ghost' | 'danger' | 'soft' | 'subtle';
type Size = 'md' | 'sm' | 'xs';

const btnBase =
  'inline-flex items-center justify-center gap-1.5 font-[550] rounded-xl border tracking-[-0.01em] transition-all duration-150 ' +
  'active:translate-y-px disabled:opacity-50 disabled:pointer-events-none ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500';

const btnSizes: Record<Size, string> = {
  md: 'h-9 px-4 text-[13.5px]',
  sm: 'h-8 px-3 text-xs',
  xs: 'h-7 px-2.5 text-xs',
};

const btnVariants: Record<Variant, string> = {
  primary:
    'border-brand-600 bg-brand-600 text-white shadow-sm hover:bg-brand-700 hover:border-brand-700 hover:shadow dark:bg-brand-600 dark:hover:bg-brand-700',
  ghost:
    'border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
  soft:
    'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:border-slate-600',
  subtle:
    'border-transparent bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
  danger:
    'border-slate-200 bg-white text-slate-700 hover:border-red-300 hover:text-red-700 hover:bg-red-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-red-900/50 dark:hover:text-red-300',
};

export function Btn({
  variant = 'ghost',
  size = 'md',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={`${btnBase} ${btnSizes[size]} ${btnVariants[variant]} ${className}`} {...rest} />;
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <section className={`card-elevated rounded-2xl border border-slate-200/70 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      {children}
    </section>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  hint,
  action,
}: {
  eyebrow?: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex gap-4">
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">
            {eyebrow}
          </p>
        )}
        <h2 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-slate-50">{title}</h2>
        {hint && <p className="mt-1 max-w-[60ch] text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">{hint}</p>}
      </div>
      {action && <div className="shrink-0 self-start">{action}</div>}
    </div>
  );
}

const fieldCls =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13.5px] text-slate-900 shadow-sm transition-all ' +
  'placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 ' +
  'dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:hover:border-slate-600 dark:focus:ring-brand-500/15';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-[550] tracking-tight text-slate-700 dark:text-slate-200">
        {label} {hint && <span className="font-normal text-slate-500 dark:text-slate-400">· {hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldCls} ${props.className ?? ''}`} />;
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${fieldCls} ${props.className ?? ''}`} />;
}

export function Divider({ className = '' }: { className?: string }) {
  return <hr className={`border-slate-200 dark:border-slate-800 ${className}`} />;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'success' | 'warn' }) {
  const map = {
    neutral: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
    brand: 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-900/50 dark:bg-brand-950/40 dark:text-sky-300',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300',
    warn: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300',
  } as const;
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${map[tone]}`}>{children}</span>;
}
