import { memo, useMemo, useState } from 'react';
import { AlertTriangle, Clock, Pencil, Search, Sparkles, X } from 'lucide-react';
import type { DayEntry, HolidayEntry, LeaveEntry, ResolvedDay } from '../lib/types';
import { prettyDate } from '../lib/dateUtils';
import { Btn, Card, SectionTitle, TextInput } from './ui';

const FIELDS: { key: keyof DayEntry; label: string }[] = [
  { key: 'amIn', label: 'AM In' },
  { key: 'amOut', label: 'AM Out' },
  { key: 'pmIn', label: 'PM In' },
  { key: 'pmOut', label: 'PM Out' },
];

type Filter = 'all' | 'issues' | 'edited';

function AttendanceStep({
  days,
  holidays,
  leaves,
  onEdit,
  onHoliday,
  onLeave,
  onClear,
  onFlashFill,
  typicalHint,
}: {
  days: ResolvedDay[];
  holidays: HolidayEntry[];
  leaves: LeaveEntry[];
  onEdit: (date: string, field: keyof DayEntry, value: string) => void;
  onHoliday: (date: string) => void;
  onLeave: (date: string) => void;
  onClear: (date: string) => void;
  onFlashFill?: () => void;
  typicalHint?: string;
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const holDates = useMemo(() => new Set(holidays.map((h) => h.date)), [holidays]);
  const lvDates = useMemo(() => new Set(leaves.map((l) => l.date)), [leaves]);
  const editedCount = days.filter((d) => d.entry.corrected).length;
  const issueCount = days.filter((d) => d.incomplete).length;

  const shown = useMemo(() => days.filter((d) => {
    if (q && !d.date.includes(q) && String(d.dayOfMonth) !== q) return false;
    if (filter === 'issues' && !d.incomplete) return false;
    if (filter === 'edited' && !d.entry.corrected) return false;
    return true;
  }), [days, q, filter]);

  const fillable = days.filter((d) => (d.kind === 'empty' || d.incomplete) && d.kind !== 'holiday' && d.kind !== 'leave' && d.weekday !== 0 && d.weekday !== 6).length;

  const badge = (d: ResolvedDay) => {
    if (d.kind === 'holiday')
      return <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900/50">Holiday</span>;
    if (d.kind === 'leave')
      return <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800 ring-1 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:ring-sky-900/50">Leave</span>;
    if (d.weekday === 0 || d.weekday === 6)
      return <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">Weekend</span>;
    return null;
  };

  return (
    <Card>
      <SectionTitle
        eyebrow={`Review · ${editedCount} edited · ${issueCount} issues`}
        title="Attendance"
        hint="Tap a time to correct it. Edited cells get an amber ring. H = holiday, L = leave, X = reset day."
        action={
          onFlashFill && fillable > 0 ? (
            <Btn size="sm" variant="primary" onClick={onFlashFill} title={typicalHint}>
              <Sparkles className="h-3.5 w-3.5" /> Flash Fill {fillable} blank{fillable > 1 ? 's' : ''}
            </Btn>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <TextInput className="pl-9" placeholder="Filter by day or date…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter days" />
        </div>
        <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800">
          <Btn size="xs" variant={filter === 'all' ? 'primary' : 'subtle'} onClick={() => setFilter('all')} className="rounded-lg">
            All {days.length}
          </Btn>
          <Btn size="xs" variant={filter === 'issues' ? 'primary' : 'subtle'} onClick={() => setFilter('issues')} className="rounded-lg">
            <AlertTriangle className="h-3 w-3" /> Issues {issueCount}
          </Btn>
          <Btn size="xs" variant={filter === 'edited' ? 'primary' : 'subtle'} onClick={() => setFilter('edited')} className="rounded-lg">
            <Pencil className="h-3 w-3" /> Edited {editedCount}
          </Btn>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="overflow-auto">
          <table className="w-full border-collapse bg-white text-[13px] dark:bg-slate-950">
            <thead className="sticky top-0 z-10">
              <tr className="text-left">
                <th className="th">Day</th>
                <th className="th">Date</th>
                {FIELDS.map((f) => (
                  <th key={f.key} className="th min-w-[138px]">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3 opacity-50" /> {f.label}
                    </span>
                  </th>
                ))}
                <th className="th text-center">Mark</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((d) => (
                <tr
                  key={d.date}
                  className={
                    d.incomplete
                      ? 'bg-amber-50 dark:bg-amber-900/25 hover:bg-amber-100 dark:hover:bg-amber-900/35'
                      : 'bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900'
                  }
                >
                  <td className="tdc w-12">
                    <span className={d.incomplete ? 'font-bold text-amber-900 dark:text-amber-100' : 'text-slate-900 dark:text-white'}>{d.dayOfMonth}</span>
                  </td>
                  <td className="tdc2">
                    <span className={`font-medium ${d.incomplete ? 'text-amber-900 dark:text-amber-100' : 'text-slate-900 dark:text-slate-100'}`}>{prettyDate(d.date)}</span>
                    {badge(d)}
                  </td>
                  {FIELDS.map((f) => (
                    <td key={f.key} className="td">
                      <span className="inline-flex items-center gap-1.5">
                        <input
                          className={`h-8 w-[134px] min-w-[134px] rounded-lg border px-2 pr-1.5 text-[13px] font-semibold tabular-nums shadow-sm transition [color-scheme:light] dark:[color-scheme:dark] focus:outline-none focus:ring-4 [&::-webkit-calendar-picker-indicator]:ml-1 [&::-webkit-calendar-picker-indicator]:opacity-70 hover:[&::-webkit-calendar-picker-indicator]:opacity-100 ${d.entry.corrected ? 'border-amber-300 bg-amber-50 text-amber-900 focus:border-amber-400 focus:ring-amber-500/15 dark:border-amber-500 dark:bg-amber-950/50 dark:text-amber-50' : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:ring-slate-900/10 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-400 dark:focus:border-white dark:focus:ring-white/20'}`}
                          type="time"
                          value={d.entry[f.key] as string}
                          onChange={(e) => onEdit(d.date, f.key, e.target.value)}
                          aria-label={`${d.date} ${f.label}`}
                          lang="en-US"
                          step={60}
                        />
                        {d.entry.corrected && <Pencil className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />}
                      </span>
                    </td>
                  ))}
                  <td className="tdm">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        title="Toggle holiday"
                        onClick={() => onHoliday(d.date)}
                        className={`grid h-7 w-7 place-items-center rounded-lg border text-xs font-bold transition ${holDates.has(d.date) ? 'border-amber-300 bg-amber-500 text-white shadow-sm dark:border-amber-600' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-white'}`}
                      >
                        H
                      </button>
                      <button
                        type="button"
                        title="Toggle leave"
                        onClick={() => onLeave(d.date)}
                        className={`grid h-7 w-7 place-items-center rounded-lg border text-xs font-bold transition ${lvDates.has(d.date) ? 'border-sky-300 bg-sky-500 text-white shadow-sm dark:border-sky-600' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-white'}`}
                      >
                        L
                      </button>
                      <button
                        type="button"
                        title="Reset day"
                        onClick={() => onClear(d.date)}
                        className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-red-800 dark:hover:bg-red-950/30 dark:hover:text-red-300"
                        aria-label={`Reset ${d.date}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!shown.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-600 dark:text-slate-400">
                    No days match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
        Holidays & leaves clear punches on export. Edited times are flagged for the AO.{' '}
        {typicalHint && <span className="font-medium text-slate-700 dark:text-slate-300">Flash Fill uses {typicalHint} with ± variation per day (not cloned).</span>}
      </p>
    </Card>
  );
}
export default memo(AttendanceStep);
