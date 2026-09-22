import { useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CalendarOff,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Leaf,
  Printer,
} from 'lucide-react';
import type { EmployeeInfo, HolidayEntry, LeaveEntry, ResolvedDay, ValidationIssue } from '../lib/types';
import DtrSheet from './DtrSheet';
import { Btn, Card, SectionTitle } from './ui';

export default function PreviewStep({
  info,
  month,
  year,
  days,
  holidays,
  leaves,
  issues,
  selectedCount,
  fileBase,
  onFileBase,
  onPrint,
  onXlsx,
  onZip,
}: {
  info: EmployeeInfo;
  month: number;
  year: number;
  days: ResolvedDay[];
  holidays: HolidayEntry[];
  leaves: LeaveEntry[];
  issues: ValidationIssue[];
  selectedCount: number;
  fileBase: string;
  onFileBase: (v: string) => void;
  onPrint: () => void;
  onXlsx: () => void;
  onZip: () => void;
}) {
  const [busy, setBusy] = useState('');
  const warns = issues.filter((i) => i.level === 'warning');
  const complete = days.filter((d) => d.hasPunch && !d.incomplete).length;

  const run = async (label: string, fn: () => void | Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } finally {
      setBusy('');
    }
  };

  return (
    <Card className="dtr-preview-card">
      <SectionTitle
        eyebrow={`Export · ${selectedCount} employee${selectedCount > 1 ? 's' : ''}`}
        title="Preview & export"
        hint="Review the CSC layout. Excel and ZIP bundle every selected employee; Print is for the current one."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Complete', value: complete, icon: CheckCircle2, bg: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300' },
          { label: 'Incomplete', value: warns.length, icon: AlertTriangle, bg: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300' },
          { label: 'Holidays', value: holidays.length, icon: CalendarOff, bg: 'bg-slate-900 dark:bg-slate-700', text: 'text-slate-900 dark:text-slate-100' },
          { label: 'Leaves', value: leaves.length, icon: Leaf, bg: 'bg-sky-500', text: 'text-sky-700 dark:text-sky-300' },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-900">
            <span className={`grid h-9 w-9 place-items-center rounded-xl text-white ${s.bg}`}>
              <s.icon className="h-4.5 w-4.5" />
            </span>
            <div>
              <p className={`text-lg font-semibold leading-none ${s.text}`}>{s.value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{s.label.toLowerCase()}</p>
            </div>
          </div>
        ))}
      </div>

      {warns.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/30 dark:bg-amber-950/20">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" /> Attention · {warns.length} incomplete
          </p>
          <ul className="space-y-1 text-sm text-amber-900 dark:text-amber-200">
            {warns.slice(0, 6).map((w) => (
              <li key={w.date} className="flex gap-2">
                <span className="text-amber-400">·</span> {w.message}
              </li>
            ))}
            {warns.length > 6 && <li className="text-xs text-amber-700 dark:text-amber-300">+ {warns.length - 6} more</li>}
          </ul>
        </div>
      )}

      <div className="dtr-preview-wrap overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <DtrSheet info={info} month={month} year={year} days={days} holidays={holidays} leaves={leaves} />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Btn variant="primary" onClick={onPrint}>
          <Printer className="h-4 w-4" /> Print / PDF
        </Btn>
        <Btn disabled={!!busy} onClick={() => void run('xlsx', onXlsx)}>
          {busy === 'xlsx' ? (
            'Building…'
          ) : (
            <>
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </>
          )}
        </Btn>
        <Btn disabled={!!busy} onClick={() => void run('zip', onZip)}>
          {busy === 'zip' ? (
            'Zipping…'
          ) : (
            <>
              <Archive className="h-4 w-4" /> ZIP
            </>
          )}
        </Btn>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400 sm:inline-flex">
            <FileText className="h-3.5 w-3.5" /> Filename
          </span>
          <input
            className="h-9 w-44 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:border-slate-300 dark:focus:ring-white/15"
            value={fileBase}
            onChange={(e) => onFileBase(e.target.value)}
            aria-label="Export filename base"
            placeholder="DTR"
          />
        </div>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
        <Download className="h-3 w-3" /> Generated locally with SheetJS & JSZip · No network request
      </p>
    </Card>
  );
}
