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
  Users,
} from 'lucide-react';
import type { EmployeeInfo, HolidayEntry, LeaveEntry, ResolvedDay, ValidationIssue } from '../lib/types';
import type { ExportBundle } from '../lib/export';
import { lateForResolvedDay, totalUndertime } from '../lib/rules';
import DtrSheet from './DtrSheet';
import PersonPills from './PersonPills';
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
  selectedNames,
  activeEmp,
  fileBase,
  onFileBase,
  onPrint,
  onPrintAll,
  onXlsx,
  onZip,
  bundles,
  onSwitchEmp,
}: {
  info: EmployeeInfo;
  month: number;
  year: number;
  days: ResolvedDay[];
  holidays: HolidayEntry[];
  leaves: LeaveEntry[];
  issues: ValidationIssue[];
  selectedCount: number;
  selectedNames: string[];
  activeEmp: string;
  fileBase: string;
  onFileBase: (v: string) => void;
  onPrint: () => void;
  onPrintAll: () => void;
  onXlsx: () => void;
  onZip: () => void;
  bundles: ExportBundle[];
  onSwitchEmp: (name: string) => void;
}) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const warns = issues.filter((i) => i.level === 'warning');
  const complete = days.filter((d) => d.hasPunch && !d.incomplete).length;
  const under = totalUndertime(days, info.officialHours);
  const lateTotal = days.reduce((n, d) => n + lateForResolvedDay(d, info.officialHours).total, 0);
  const fmtDur = (total: number) => {
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (!total) return 'none';
    return `${h > 0 ? `${h}h ` : ''}${m}m`;
  };

  const run = async (label: string, fn: () => void | Promise<void>) => {
    setBusy(label);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed — please try again.');
    } finally {
      setBusy('');
    }
  };

  return (
    <Card className="dtr-preview-card">
      <SectionTitle
        eyebrow={`Export · ${selectedCount} employee${selectedCount > 1 ? 's' : ''}`}
        title="Preview & export"
        hint={selectedCount > 1 ? "Preview one, export all — switch person below. Excel / ZIP / Print all bundle every selected employee." : "Review the CSC layout. Excel, ZIP and Print export this DTR."}
      />

      {/* Fast switch — fixes 'no fast switch' for selected personnel */}
      {selectedCount > 1 && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/50">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300">
            <Users className="h-3.5 w-3.5" /> Previewing
          </p>
          <PersonPills names={selectedNames} active={activeEmp} onSelect={onSwitchEmp} activeSuffix="• viewing" />
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
            Showing <span className="font-semibold text-slate-900 dark:text-white">{activeEmp}</span> — {selectedCount - 1} other{selectedCount - 1 === 1 ? '' : 's'} will export too (Print all / Excel / ZIP)
          </p>
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Complete', value: complete, icon: CheckCircle2, bg: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300' },
          { label: 'Issues', value: warns.length, icon: AlertTriangle, bg: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300' },
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

      <p className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
        <span>
          Total late <span className="font-semibold text-slate-900 dark:text-white">{fmtDur(lateTotal)}</span>
        </span>
        <span aria-hidden className="h-3 w-px bg-slate-200 dark:bg-slate-700" />
        <span>
          Total undertime <span className="font-semibold text-slate-900 dark:text-white">{fmtDur(under.total)}</span>
        </span>
        <span aria-hidden className="h-3 w-px bg-slate-200 dark:bg-slate-700" />
        <span className="text-slate-500 dark:text-slate-500">vs {info.officialHours || 'standard schedule'} · {activeEmp}</span>
      </p>

      {warns.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/30 dark:bg-amber-950/20">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" /> Attention · {warns.length} issue{warns.length > 1 ? 's' : ''}
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

      {/* Batch print: hidden on screen, visible only in print when data-print=batch */}
      {bundles.length > 0 && (
        <div className="print-batch" aria-hidden>
          {bundles.map((b) => (
            <DtrSheet
              key={b.info.name}
              info={b.info}
              month={b.month}
              year={b.year}
              days={b.days}
              holidays={b.holidays}
              leaves={b.leaves}
            />
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Btn variant="primary" onClick={onPrint}>
          <Printer className="h-4 w-4" /> {selectedCount > 1 ? 'Print this' : 'Print / PDF'}
        </Btn>
        {selectedCount > 1 && (
          <Btn variant="primary" onClick={onPrintAll}>
            <Printer className="h-4 w-4" /> Print all {selectedCount}
          </Btn>
        )}
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
              <Archive className="h-4 w-4" /> PDF ZIP
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
        <Download className="h-3 w-3" /> Excel via SheetJS · PDFs generated on-device · ZIP via JSZip · No network request
      </p>
      {error && (
        <p role="alert" className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          Export failed: {error}
        </p>
      )}
    </Card>
  );
}
