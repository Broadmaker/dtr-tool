import { Building2, Briefcase, CalendarDays, Clock, User, Users } from 'lucide-react';
import type { EmployeeInfo } from '../lib/types';
import { Card, Field, SectionTitle, SelectInput, TextInput } from './ui';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export default function ConfigStep({
  month,
  year,
  info,
  activeEmp,
  selectedNames,
  selectedCount,
  onMonth,
  onYear,
  onInfo,
  onApplyFieldToAll,
  onSwitchEmp,
}: {
  month: number;
  year: number;
  info: EmployeeInfo;
  activeEmp: string;
  selectedNames: string[];
  selectedCount: number;
  onMonth: (m: number) => void;
  onYear: (y: number) => void;
  onInfo: (p: Partial<EmployeeInfo>) => void;
  onApplyFieldToAll: (field: keyof EmployeeInfo, value: string) => void;
  onSwitchEmp: (name: string) => void;
}) {
  return (
    <Card>
      <SectionTitle
        eyebrow="Setup"
        title="Period & employee details"
        hint="Period is for the whole file. Name is per-person — office/position are printed on every selected DTR."
      />

      {/* Who am I editing? — matches Holidays clarity fix */}
      {selectedCount > 0 && (
        <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/50">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300">
            <Users className="h-3.5 w-3.5" /> Editing details for
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
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800 ring-1 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:ring-sky-900/50">
              <User className="h-3 w-3" /> Name = this person only
            </span>{' '}
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800 ring-1 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:ring-sky-900/50">
              <Briefcase className="h-3 w-3" /> Position/Office/Hours = per-person
            </span>
            {selectedCount > 1 && <span> — switch person to edit theirs</span>}
          </p>
        </div>
      )}

      <div className="grid gap-6">
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300">DTR Period</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Month">
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <SelectInput className="pl-9" value={month} onChange={(e) => onMonth(Number(e.target.value))}>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </SelectInput>
              </div>
            </Field>
            <Field label="Year">
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <TextInput className="pl-9" type="number" value={year} min={2000} max={2100} onChange={(e) => onYear(Number(e.target.value))} />
              </div>
            </Field>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-3 dark:border-sky-900/30 dark:bg-sky-950/20">
            <Field label="Employee name" hint={`only ${activeEmp.split(' ')[0] || 'this person'} — others keep file name`}>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <TextInput
                  className="pl-10 font-medium tracking-tight"
                  value={info.name}
                  placeholder="JUAN DELA CRUZ"
                  onChange={(e) => onInfo({ name: e.target.value })}
                />
              </div>
            </Field>
            <p className="mt-2 text-xs text-sky-700 dark:text-sky-300">
              Editing <span className="font-semibold">{activeEmp}</span> — {selectedCount > 1 ? `other ${selectedCount - 1} keep their own names` : 'this is the only DTR'}
            </p>
          </div>

          <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-3 dark:border-sky-900/30 dark:bg-sky-950/20">
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-sky-700 dark:text-sky-300">
              Per-person — for {activeEmp.split(' ')[0] || 'active'} <span className="font-normal normal-case tracking-normal text-sky-600 dark:text-sky-400">· different positions? set each, or copy to all</span>
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Field label="Position">
                  <div className="relative">
                    <Briefcase className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <TextInput className="pl-9" value={info.position} placeholder="Teacher III" onChange={(e) => onInfo({ position: e.target.value })} />
                  </div>
                </Field>
                {selectedCount > 1 && info.position && (
                  <button type="button" onClick={() => onApplyFieldToAll('position', info.position)} className="mt-1.5 text-xs font-medium text-sky-700 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-200">
                    → Apply “{info.position}” to all {selectedCount}
                  </button>
                )}
              </div>
              <div>
                <Field label="Office / School">
                  <div className="relative">
                    <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <TextInput className="pl-9" value={info.office} placeholder="San Example Elementary School" onChange={(e) => onInfo({ office: e.target.value })} />
                  </div>
                </Field>
                {selectedCount > 1 && info.office && (
                  <button type="button" onClick={() => onApplyFieldToAll('office', info.office)} className="mt-1.5 text-xs font-medium text-sky-700 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-200">
                    → Apply to all {selectedCount}
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4">
              <Field label="Official hours" hint="printed verbatim on this DTR">
                <div className="relative">
                  <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <TextInput className="pl-9" value={info.officialHours} placeholder="8:00 AM – 5:00 PM" onChange={(e) => onInfo({ officialHours: e.target.value })} />
                </div>
              </Field>
              {selectedCount > 1 && info.officialHours && (
                <button type="button" onClick={() => onApplyFieldToAll('officialHours', info.officialHours)} className="mt-1.5 text-xs font-medium text-sky-700 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-200">
                  → Apply to all {selectedCount}
                </button>
              )}
            </div>
            <p className="mt-3 text-xs text-sky-700 dark:text-sky-300">Tip: different positions? Select each person above, set theirs, or use “Apply to all” when most share one office.</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
