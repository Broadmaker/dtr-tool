import { useState } from 'react';
import { AlertCircle, ArrowUpRight, FileSpreadsheet, Loader2, ShieldCheck, Sparkles, UploadCloud } from 'lucide-react';
import { parseBiometricFile } from '../lib/parser';
import type { ParseResult } from '../lib/parser';
import { Btn, Card, SectionTitle } from './ui';

export default function UploadStep({
  onParsed,
  onNeedMap,
  onSample,
}: {
  onParsed: (r: ParseResult, file: File) => void;
  onNeedMap: (file: File, err: string) => void;
  onSample: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [drag, setDrag] = useState(false);

  const handle = async (f: File | undefined) => {
    if (!f) return;
    // Soft guard: browser-memory only — no hard limit, just friendly warning
    const softMB = 20;
    const hardMB = 50;
    if (f.size > hardMB * 1024 * 1024) {
      setErr(`File is ${(f.size / 1024 / 1024).toFixed(1)} MB — too large for browser processing (>${hardMB} MB). Try splitting by month or employee.`);
      return;
    }
    if (f.size > softMB * 1024 * 1024) {
      setErr(`Heads up: ${(f.size / 1024 / 1024).toFixed(1)} MB — large file may be slow, but trying anyway…`);
    } else {
      setErr('');
    }
    setBusy(true);
    try {
      const r = await parseBiometricFile(f);
      onParsed(r, f);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to parse file.';
      if (/column|header|readable/i.test(msg)) onNeedMap(f, msg);
      else setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden !p-0">
        <div className="px-6 pt-6">
          <SectionTitle
            eyebrow="Start here"
            title="Upload biometric export"
            hint="Excel or CSV — parsed locally in your browser. No server, no upload."
            action={
              <Btn variant="ghost" size="sm" onClick={onSample}>
                <Sparkles className="h-3.5 w-3.5" /> Try sample
                <ArrowUpRight className="h-3 w-3 opacity-60" />
              </Btn>
            }
          />
        </div>

        <div className="px-6 pb-6">
          <label
            className={`group relative flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all ${
              drag
                ? 'border-slate-900 bg-slate-900/[0.04] dark:border-white dark:bg-white/[0.08]'
                : 'border-slate-200 bg-slate-50/60 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600 dark:hover:bg-slate-800'
            } ${busy ? 'pointer-events-none opacity-60' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              void handle(e.dataTransfer.files?.[0]);
            }}
          >
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              hidden
              disabled={busy}
              onChange={(e) => {
                void handle(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <span
              aria-hidden
              className={`grid h-14 w-14 place-items-center rounded-2xl border shadow-sm transition ${drag ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'}`}
            >
              {busy ? (
                <Loader2 className="h-6 w-6 animate-spin text-slate-900 dark:text-white" />
              ) : (
                <UploadCloud className={`h-6 w-6 ${drag ? 'text-white dark:text-slate-900' : 'text-slate-500 dark:text-slate-400'}`} />
              )}
            </span>
            <div>
              <p className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">
                {busy ? 'Parsing…' : drag ? 'Drop file to upload' : 'Drop file or click to browse'}
              </p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Supports .xlsx, .xls, .csv · No hard limit · Soft 20 MB, hard 50 MB</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <ShieldCheck className="h-3 w-3 text-emerald-600" /> Private & offline
            </span>
          </label>

          {err && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-relaxed text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-red-600 text-white">
                <AlertCircle className="h-3.5 w-3.5" />
              </span>
              <span>{err}</span>
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 bg-slate-50/70 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700 dark:text-slate-200">
              <FileSpreadsheet className="h-3 w-3" /> Demo: 2 employees · Sept 2026
            </span>
            <span className="text-slate-500 dark:text-slate-400">Includes an incomplete day to try corrections</span>
          </div>
          <details className="group mt-3">
            <summary className="cursor-pointer list-none text-xs font-medium text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-1.5">
                What file layouts work? <ArrowUpRight className="h-3 w-3 transition group-open:rotate-45" />
              </span>
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              <li>
                <span className="font-medium text-slate-900 dark:text-white">Long:</span> Employee | Date | Time | IN / OUT
              </li>
              <li>
                <span className="font-medium text-slate-900 dark:text-white">Wide:</span> Employee | 1 | 2 | 3 … (one cell per day)
              </li>
              <li>Times like 07:32, 7:32 AM, 07:32:00 all work. Unlabeled files open the column mapper.</li>
            </ul>
          </details>
        </div>
      </Card>
    </div>
  );
}
