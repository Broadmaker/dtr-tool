import { Building2, Briefcase, CalendarDays, Clock, User } from 'lucide-react';
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
  onMonth,
  onYear,
  onInfo,
}: {
  month: number;
  year: number;
  info: EmployeeInfo;
  onMonth: (m: number) => void;
  onYear: (y: number) => void;
  onInfo: (p: Partial<EmployeeInfo>) => void;
}) {
  return (
    <Card>
      <SectionTitle
        eyebrow="Setup"
        title="Period & employee details"
        hint="Period is guessed from the file. Fix it if the export spans a cutoff. Position and office are saved locally for next time."
      />

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
          <Field label="Employee name" hint="as printed on form">
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Position">
              <div className="relative">
                <Briefcase className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <TextInput className="pl-9" value={info.position} placeholder="Teacher III" onChange={(e) => onInfo({ position: e.target.value })} />
              </div>
            </Field>
            <Field label="Office / School">
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <TextInput className="pl-9" value={info.office} placeholder="San Example Elementary School" onChange={(e) => onInfo({ office: e.target.value })} />
              </div>
            </Field>
          </div>

          <Field label="Official hours" hint="printed verbatim on the DTR">
            <div className="relative">
              <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <TextInput className="pl-9" value={info.officialHours} placeholder="8:00 AM – 5:00 PM" onChange={(e) => onInfo({ officialHours: e.target.value })} />
            </div>
          </Field>
        </div>
      </div>
    </Card>
  );
}
