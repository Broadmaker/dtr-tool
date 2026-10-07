import { useState } from 'react';
import { Search, X } from 'lucide-react';

/**
 * Person switcher pills with an inline search pill for long employee lists.
 * The search field is styled as one of the pills so it blends into the row.
 * Used by Period, Review, Holidays and Export steps so switching person
 * doesn't mean hunting through dozens of pills.
 */
export default function PersonPills({
  names,
  active,
  onSelect,
  activeSuffix = '• active',
}: {
  names: string[];
  active: string;
  onSelect: (name: string) => void;
  /** trailing marker on the active pill; pass '' for none */
  activeSuffix?: string;
}) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const shown = query ? names.filter((n) => n.toLowerCase().includes(query)) : names;

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
      {names.length > 1 && (
        <label
          className={`person-search inline-flex w-[170px] items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium shadow-sm transition-colors focus-within:ring-2 focus-within:ring-slate-900/10 dark:focus-within:ring-white/20 ${
            query
              ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
              : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
          }`}
        >
          <Search className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            aria-label="Search person"
            className="w-full min-w-0 border-0 bg-transparent p-0 text-xs font-medium outline-none placeholder:font-normal placeholder:opacity-60 focus:outline-none focus:ring-0 focus-visible:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQ('')}
              aria-label="Clear search"
              className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-white/25 transition outline-none hover:bg-white/40 focus-visible:outline-none dark:bg-slate-900/10 dark:hover:bg-slate-900/20"
            >
              <X className="h-2.5 w-2.5" strokeWidth={3} />
            </button>
          )}
        </label>
      )}
      {shown.map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => onSelect(name)}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            name === active
              ? 'border-slate-900 bg-slate-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-slate-900'
              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-white'
          }`}
        >
          {name}
          {name === active && activeSuffix && <span className="ml-1.5 opacity-70">{activeSuffix}</span>}
        </button>
      ))}
      {!shown.length && (
        <span className="basis-full text-xs text-slate-600 dark:text-slate-400">
          No matches for “{q.trim()}” — clear the search to see everyone.
        </span>
      )}
    </div>
  );
}
