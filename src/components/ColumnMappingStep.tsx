import { useState } from 'react';
import { AlertCircle, ArrowLeft, BookmarkPlus, Check, Columns3, Table2, Trash2 } from 'lucide-react';
import type { ColumnMap, SheetPreview } from '../lib/columns';
import type { MappingPreset } from '../lib/presets';
import { Btn, Card, SectionTitle, SelectInput, TextInput } from './ui';

const FIELDS: { key: keyof ColumnMap; label: string; required?: boolean }[] = [
  { key: 'employee', label: 'Employee name', required: true },
  { key: 'date', label: 'Date', required: true },
  { key: 'time', label: 'Time', required: true },
  { key: 'kind', label: 'IN / OUT', required: false },
];

export default function ColumnMappingStep({
  preview,
  map,
  onChange,
  onBack,
  onApply,
  busy,
  error,
  presets,
  onSavePreset,
  onApplyPreset,
  onDeletePreset,
}: {
  preview: SheetPreview;
  map: ColumnMap;
  onChange: (m: ColumnMap) => void;
  onBack: () => void;
  onApply: () => void;
  busy: boolean;
  error: string;
  presets: MappingPreset[];
  onSavePreset: (name: string) => void;
  onApplyPreset: (p: MappingPreset) => void;
  onDeletePreset: (fingerprint: string) => void;
}) {
  const [presetName, setPresetName] = useState('');
  const sample = preview.rows.slice(0, 4);
  return (
    <Card>
      <SectionTitle
        eyebrow="Fix import"
        title="Map your columns"
        hint={`We couldn’t detect the layout for “${preview.sheetName}”. Tell us which column is which.`}
      />

      <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
        <Table2 className="h-3.5 w-3.5" /> {preview.sheetName} · {preview.headers.length} cols · {preview.rows.length} rows
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold tracking-tight text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5">
              <Columns3 className="h-3 w-3 text-slate-400" /> {f.label} {f.required && <span className="text-red-500">*</span>}
            </span>
            <SelectInput value={map[f.key]} onChange={(e) => onChange({ ...map, [f.key]: Number(e.target.value) })}>
              <option value={-1}>— Not in file —</option>
              {preview.headers.map((h, i) => (
                <option key={i} value={i}>
                  {i + 1}. {h || '(blank)'}
                </option>
              ))}
            </SelectInput>
          </label>
        ))}
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="overflow-auto">
          <table className="w-full border-collapse bg-white text-xs dark:bg-slate-950">
            <thead>
              <tr>
                <th className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold uppercase tracking-widest text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  #
                </th>
                {preview.headers.map((h, i) => (
                  <th
                    key={i}
                    className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold uppercase tracking-widest text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  >
                    {h || `Col ${i + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sample.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                  <td className="border-b border-slate-100 px-3 py-2 text-center font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-400">{i + 1}</td>
                  {r.map((c, j) => (
                    <td key={j} className="border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                      {String(c ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-6 flex gap-2">
        <Btn variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Btn>
        <Btn variant="primary" disabled={busy || map.employee < 0} onClick={onApply}>
          {busy ? 'Parsing…' : <><Check className="h-4 w-4" /> Apply mapping</>}
        </Btn>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/50">
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-slate-900 dark:text-white">
          <BookmarkPlus className="h-3.5 w-3.5" aria-hidden /> Saved mappings
        </p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          Reuse this layout next time — the next upload with the same headers applies it automatically.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <TextInput
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="e.g. ZKTeco K14 — main office"
            aria-label="Preset name"
            maxLength={60}
            className="flex-1"
          />
          <Btn
            variant="ghost"
            disabled={busy || map.employee < 0 || !presetName.trim()}
            onClick={() => { onSavePreset(presetName); setPresetName(''); }}
            className="shrink-0"
          >
            <BookmarkPlus className="h-3.5 w-3.5" /> Save this mapping
          </Btn>
        </div>
        {presets.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {presets.map((p) => (
              <li
                key={p.fingerprint}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-600 dark:bg-slate-900"
              >
                <span className="min-w-0 flex-1 truncate font-medium text-slate-700 dark:text-slate-200">{p.name}</span>
                <button
                  type="button"
                  onClick={() => onApplyPreset(p)}
                  className="shrink-0 font-semibold text-slate-900 hover:underline dark:text-white"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={() => onDeletePreset(p.fingerprint)}
                  aria-label={`Delete preset ${p.name}`}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">No saved mappings yet.</p>
        )}
      </div>
    </Card>
  );
}
