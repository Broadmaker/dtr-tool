import { useState } from 'react';
import { Check, Search, Users, UserCheck, X } from 'lucide-react';
import type { EmployeeAttendance } from '../lib/types';
import { Btn, Card, SectionTitle } from './ui';
import { TextInput } from './ui';

export default function EmployeeStep({
  list,
  selected,
  onToggle,
  onAll,
}: {
  list: EmployeeAttendance[];
  selected: Set<string>;
  onToggle: (name: string) => void;
  onAll: (v: boolean) => void;
}) {
  const [q, setQ] = useState('');
  const shown = list.filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Card>
      <SectionTitle
        eyebrow={`People · ${selected.size} of ${list.length} selected`}
        title="Select employees"
        hint="Choose everyone to include. You’ll review one at a time, then export all at once."
        action={
          <div className="flex gap-1.5">
            <Btn size="sm" variant="ghost" onClick={() => onAll(true)}>
              <UserCheck className="h-3.5 w-3.5" /> All
            </Btn>
            <Btn size="sm" variant="ghost" onClick={() => onAll(false)}>
              <X className="h-3.5 w-3.5" /> None
            </Btn>
          </div>
        }
      />

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <TextInput
          className="pl-9 !py-2.5"
          placeholder="Search name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search employees"
        />
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="max-h-[320px] overflow-auto divide-y divide-slate-200 dark:divide-slate-800">
          {shown.map((e) => {
            const sel = selected.has(e.name);
            const initials = e.name
              .split(' ')
              .filter(Boolean)
              .slice(0, 2)
              .map((w) => w[0])
              .join('')
              .toUpperCase();
            return (
              <label
                key={e.name}
                className={`flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors ${sel ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800'}`}
              >
                <input type="checkbox" className="sr-only" checked={sel} onChange={() => onToggle(e.name)} />
                <span
                  className={`grid h-5 w-5 place-items-center rounded-md border text-white ${sel ? 'border-white bg-white text-slate-900 dark:border-slate-900 dark:bg-slate-900 dark:text-white' : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800'}`}
                >
                  {sel && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span
                  className={`grid h-8 w-8 place-items-center rounded-full text-xs font-bold ring-1 ${sel ? 'bg-white text-slate-900 ring-white dark:bg-slate-900 dark:text-white dark:ring-slate-700' : 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-700 dark:text-slate-100 dark:ring-slate-600'}`}
                >
                  {initials}
                </span>
                <span className={`min-w-0 flex-1 truncate text-[13.5px] font-semibold tracking-tight ${sel ? 'text-white dark:text-slate-900' : 'text-slate-900 dark:text-slate-100'}`}>{e.name}</span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${sel ? 'bg-white/20 text-white ring-white/30 dark:bg-slate-900/10 dark:text-slate-900 dark:ring-slate-900/20' : 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-600'}`}>
                  {Object.keys(e.days).length} days
                </span>
              </label>
            );
          })}
          {!shown.length && (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <Users className="h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No matches</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">No results for “{q}”.</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-slate-600 dark:text-slate-400">
          {selected.size} selected · {list.length - selected.size} excluded
        </span>
        <span className="hidden text-slate-500 dark:text-slate-400 sm:block">Tip: You can change this later before export</span>
      </div>
    </Card>
  );
}
