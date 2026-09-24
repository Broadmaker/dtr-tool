import { useState } from 'react';
import { CalendarDays, CalendarOff, Leaf, Plus, Trash2, Users, X, Check, Sparkles } from 'lucide-react';
import type { HolidayEntry, LeaveEntry } from '../lib/types';
import { prettyDate } from '../lib/dateUtils';
import { Btn, Card, Field, SectionTitle, SelectInput, TextInput } from './ui';
import { holidaysForMonth } from '../lib/phHolidays';

const LEAVE_TYPES = [
  'Vacation Leave',
  'Sick Leave',
  'Service Credit',
  'Study Leave',
  'Maternity Leave',
  'Paternity Leave',
  'Solo Parent Leave',
  'Emergency Leave',
  'CTO',
];

export default function HolidayLeaveStep({
  activeEmp,
  selectedCount,
  selectedNames,
  holidays,
  leaves,
  allLeaves,
  onHol,
  onDelHol,
  onLeave,
  onDelLeave,
  onLeaveAll,
  onDelLeaveAll,
  onSwitchEmp,
  month,
  year,
}: {
  activeEmp: string;
  selectedCount: number;
  selectedNames: string[];
  holidays: HolidayEntry[];
  leaves: LeaveEntry[];
  allLeaves: Record<string, LeaveEntry[]>;
  onHol: (h: HolidayEntry) => void;
  onDelHol: (date: string) => void;
  onLeave: (l: LeaveEntry) => void;
  onDelLeave: (date: string) => void;
  onLeaveAll: (l: LeaveEntry) => void;
  onDelLeaveAll: (date: string) => void;
  onSwitchEmp: (name: string) => void;
  month: number;
  year: number;
}) {
  const [hd, setHd] = useState('');
  const [hn, setHn] = useState('');
  const [ht, setHt] = useState<'Regular' | 'Special'>('Regular');
  const [ld, setLd] = useState('');
  const [lt, setLt] = useState(LEAVE_TYPES[0]);
  const [applyToAll, setApplyToAll] = useState(false);
  const isBulk = applyToAll && selectedCount > 1;

  // Summary for bulk: how many already have this date? (for preview)
  const bulkAffected = selectedCount;
  const otherLeavesCount = Object.entries(allLeaves)
    .filter(([name]) => name !== activeEmp)
    .reduce((acc, [, arr]) => acc + arr.length, 0);

  return (
    <Card>
      <SectionTitle
        eyebrow="Exceptions"
        title="Holidays & leaves"
        hint="Holidays are global (every DTR). Leaves are per-person — pick who you are editing below."
      />

      {/* Who am I editing? — fixes 'not sure whose DTR im inputting' */}
      {selectedCount > 0 && (
        <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/50">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300">
            <Users className="h-3.5 w-3.5" /> Editing for
          </p>
          <div className="flex flex-wrap gap-1.5">
            {selectedNames.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onSwitchEmp(name)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  name === activeEmp
                    ? 'border-slate-900 bg-slate-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-slate-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                {name}
                {name === activeEmp && <span className="ml-1.5 opacity-70">• active</span>}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900/50">
              <CalendarOff className="h-3 w-3" /> Holidays = everyone
            </span>{' '}
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800 ring-1 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:ring-sky-900/50">
              <Leaf className="h-3 w-3" /> Leaves = {activeEmp.split(' ')[0] || 'active person'} only
            </span>
            {selectedCount > 1 && (
              <span> — toggle “Apply to all” under Leaves to bulk-add.</span>
            )}
          </p>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Holidays - global */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/30">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300">
            <CalendarOff className="h-3.5 w-3.5" /> Holidays
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200">Global</span>
            <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {holidays.length}
            </span>
          </h3>
          <p className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
            <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> Affects every selected DTR</span>
            <span className="hidden sm:inline text-slate-300 dark:text-slate-600">·</span>
            <span className="flex flex-wrap gap-1">
              {selectedNames.slice(0, 3).map((n) => (
                <span key={n} className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">{n.split(' ')[0]}</span>
              ))}
              {selectedNames.length > 3 && <span className="text-slate-500">+{selectedNames.length - 3} more</span>}
            </span>
          </p>

          {/* PH Holiday preset — one tap */}
          {(() => {
            const preset = holidaysForMonth(year, month);
            const added = preset.filter((p) => !holidays.some((h) => h.date === p.date)).length;
            const total = preset.length;
            if (total === 0) return (
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">No preset holidays for {year}-{String(month).padStart(2,'0')} — add manually.</p>
            );
            return (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/30 dark:bg-amber-950/20">
                <span className="text-xs font-medium text-amber-800 dark:text-amber-200">{total} PH holiday{total>1?'s':''} for {year}-{String(month).padStart(2,'0')}</span>
                <span className="text-xs text-amber-700 dark:text-amber-300">· {added} new · {total-added} already added</span>
                <Btn size="xs" variant="primary" disabled={added===0} onClick={() => preset.forEach((p) => { if (!holidays.some((h)=>h.date===p.date)) onHol(p); })} className="ml-auto">
                  <Sparkles className="h-3 w-3" /> Load {added || total} preset
                </Btn>
              </div>
            );
          })()}

          <div className="grid gap-3">
            <Field label="Date">
              <TextInput type="date" value={hd} onChange={(e) => setHd(e.target.value)} />
            </Field>
            <Field label="Description">
              <TextInput placeholder="e.g. Independence Day" value={hn} onChange={(e) => setHn(e.target.value)} />
            </Field>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Field label="Type">
                  <SelectInput value={ht} onChange={(e) => setHt(e.target.value as 'Regular' | 'Special')}>
                    <option>Regular</option>
                    <option>Special</option>
                  </SelectInput>
                </Field>
              </div>
              <Btn
                variant="primary"
                size="sm"
                disabled={!hd}
                onClick={() => {
                  onHol({ date: hd, description: hn || 'Holiday', type: ht });
                  setHd('');
                  setHn('');
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </Btn>
            </div>
          </div>

          <div className="mt-4 space-y-1.5">
            {holidays.map((h) => (
              <div
                key={h.date}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm dark:border-slate-600 dark:bg-slate-900"
              >
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${h.type === 'Regular' ? 'bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-200 dark:ring-red-900/50' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-900/50'}`}>
                  <CalendarDays className="h-3 w-3" /> {h.type}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-900 dark:text-slate-100">
                  <span className="font-medium">{prettyDate(h.date)}</span> <span className="text-slate-600 dark:text-slate-400">· {h.description}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onDelHol(h.date)}
                  className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                  aria-label={`Remove ${h.date}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            {!holidays.length && (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center dark:border-slate-600 dark:bg-slate-900">
                <p className="text-xs font-medium text-slate-700 dark:text-slate-200">No holidays</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">They’ll appear as HOLIDAY on every DTR.</p>
              </div>
            )}
          </div>
        </div>

        {/* Leaves - per employee with bulk */}
        <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-4 dark:border-sky-900/30 dark:bg-sky-950/20">
          <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300">
            <Leaf className="h-3.5 w-3.5" /> Leaves
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-sky-700 ring-1 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-200">Per-person</span>
            <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300">
              {leaves.length} for {activeEmp.split(' ')[0] || '—'}
            </span>
          </h3>
          <p className="mb-3 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <span className="h-2 w-2 rounded-full bg-sky-500" aria-hidden />
            Adding to <span className="font-semibold text-slate-900 dark:text-white">{activeEmp || '—'}</span>
            <span className="hidden sm:inline">— only this DTR</span>
            {selectedCount > 1 && (
              <span className="text-slate-500 dark:text-slate-400">· {otherLeavesCount} on others</span>
            )}
          </p>

          {/* Bulk toggle */}
          {selectedCount > 1 && (
            <label className={`mb-3 flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium transition ${isBulk ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-slate-200 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300'}`}>
              <input
                type="checkbox"
                checked={applyToAll}
                onChange={(e) => setApplyToAll(e.target.checked)}
                className="sr-only"
              />
              <span className={`grid h-4 w-4 place-items-center rounded border ${isBulk ? 'border-white bg-white text-slate-900 dark:border-slate-900 dark:bg-slate-900 dark:text-white' : 'border-slate-300 bg-white dark:border-slate-500 dark:bg-slate-800'}`}>
                {isBulk && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <Users className="h-3.5 w-3.5" />
              Apply to all {selectedCount} selected
              {isBulk && <span className="ml-auto text-[11px] opacity-80">bulk mode</span>}
            </label>
          )}

          <div className="grid gap-3">
            <Field label="Date">
              <TextInput type="date" value={ld} onChange={(e) => setLd(e.target.value)} />
            </Field>
            <Field label="Type">
              <SelectInput value={lt} onChange={(e) => setLt(e.target.value)}>
                {LEAVE_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </SelectInput>
            </Field>
            <Btn
              variant={isBulk ? 'primary' : 'primary'}
              size="sm"
              disabled={!ld}
              className="w-full"
              onClick={() => {
                const payload = { date: ld, leaveType: lt || 'Leave' };
                if (isBulk) onLeaveAll(payload);
                else onLeave(payload);
                setLd('');
              }}
            >
              <Plus className="h-3.5 w-3.5" /> {isBulk ? `Add to all ${bulkAffected}` : `Add to ${activeEmp.split(' ')[0] || 'employee'}`}
            </Btn>
            {isBulk && ld && (
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                Will add <span className="font-medium text-slate-900 dark:text-white">{prettyDate(ld)} · {lt}</span> to {selectedNames.slice(0, 3).join(', ')}{selectedNames.length > 3 ? ` +${selectedNames.length - 3} more` : ''}
              </p>
            )}
          </div>

          <div className="mt-4 space-y-1.5">
            {leaves.map((l) => (
              <div
                key={l.date}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm dark:border-slate-600 dark:bg-slate-900"
              >
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700 ring-1 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-200 dark:ring-sky-900/50">
                  <Leaf className="h-3 w-3" /> Leave
                </span>
                <span className="min-w-0 flex-1 truncate text-slate-900 dark:text-slate-100">
                  <span className="font-medium">{prettyDate(l.date)}</span> <span className="text-slate-600 dark:text-slate-400">· {l.leaveType}</span>
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => onDelLeave(l.date)}
                    className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400"
                    aria-label={`Remove from ${activeEmp}`}
                    title={`Remove from ${activeEmp}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                  {selectedCount > 1 && (
                    <button
                      type="button"
                      onClick={() => onDelLeaveAll(l.date)}
                      className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-red-200 hover:text-red-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-red-300"
                      aria-label="Remove from all selected"
                      title="Remove from all selected"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!leaves.length && (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center dark:border-slate-600 dark:bg-slate-900">
                <p className="text-xs font-medium text-slate-700 dark:text-slate-200">No leaves for {activeEmp.split(' ')[0] || 'this employee'}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Only affects the current employee{selectedCount > 1 ? ' — use bulk toggle for everyone' : ''}.</p>
              </div>
            )}
          </div>

          {/* Cross-employee summary when multiple */}
          {selectedCount > 1 && Object.keys(allLeaves).length > 0 && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-600 dark:bg-slate-900">
              <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">Leaves across selected</p>
              <div className="space-y-1.5 max-h-[120px] overflow-auto pr-1">
                {selectedNames.map((name) => {
                  const arr = allLeaves[name] ?? [];
                  return (
                    <div key={name} className="flex items-center gap-2 text-xs">
                      <span className={`truncate font-medium ${name === activeEmp ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>{name}</span>
                      <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {arr.length} {arr.length === 1 ? 'leave' : 'leaves'}
                      </span>
                    </div>
                  );
                })}
              </div>
              {otherLeavesCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm(`Copy ${leaves.length} leave(s) from ${activeEmp} to all ${selectedCount} selected?`)) return;
                    for (const l of leaves) onLeaveAll(l);
                  }}
                  disabled={!leaves.length}
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                >
                  <span className="inline-flex items-center gap-1.5"><Users className="h-3 w-3" /> Copy {activeEmp.split(' ')[0] || 'current'}’s leaves to all</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
        <Trash2 className="h-3 w-3" /> Holidays = everyone · Leaves = {selectedCount > 1 ? 'per-employee (toggle bulk for batch)' : 'per-employee'}.
      </p>
    </Card>
  );
}
