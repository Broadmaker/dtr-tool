import { useCallback, useEffect, useMemo, useState } from 'react';
import UploadStep from './components/UploadStep';
import ColumnMappingStep from './components/ColumnMappingStep';
import EmployeeStep from './components/EmployeeStep';
import ConfigStep from './components/ConfigStep';
import AttendanceStep from './components/AttendanceStep';
import HolidayLeaveStep from './components/HolidayLeaveStep';
import PreviewStep from './components/PreviewStep';
import { Btn, Card } from './components/ui';
import { Page, PrivacyStrip, Stepper, Toast, TopBar } from './components/shell';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  FileSpreadsheet,
  ShieldCheck,
  Undo2,
  Users,
} from 'lucide-react';
import type { ParseResult } from './lib/parser';
import { autoMap, guessPeriod, parseBiometricFile, readSheetGrid, remapMatrixEmployees } from './lib/parser';
import { resolveMonth, validateDays } from './lib/rules';
import type { DayEntry, EmployeeInfo, LeaveEntry } from './lib/types';
import type { ColumnMap, SheetPreview } from './lib/columns';
import { unmapped } from './lib/columns';
import { downloadXlsx, downloadZip } from './lib/export';
import type { ExportBundle } from './lib/export';
import { makeSampleFile } from './lib/sample';
import { monthName, toISODate } from './lib/dateUtils';
import { applyTheme, loadTheme } from './lib/theme';
import type { Theme } from './lib/theme';
import { clearUndoSnapshot, loadPrefs, loadUndoSnapshot, savePrefs, saveUndoSnapshot } from './lib/storage';
import { buildFlashFillOverrides, computeTypicalTimes } from './lib/fill';

type Step = 0 | 1 | 2 | 3 | 4 | 5;
const STEP_LABELS = ['Upload', 'Employees', 'Period', 'Review', 'Holidays', 'Export'];

export default function App() {
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [activeEmp, setActiveEmp] = useState('');
  const [overrides, setOverrides] = useState<Record<string, Record<string, DayEntry>>>({});
  const [holidays, setHolidays] = useState<{ date: string; description: string; type: 'Regular' | 'Special' }[]>([]);
  const [leaves, setLeaves] = useState<Record<string, LeaveEntry[]>>({});
  const [prefs, setPrefs] = useState(loadPrefs);
  const [empInfos, setEmpInfos] = useState<Record<string, Partial<EmployeeInfo>>>({});
  const [step, setStep] = useState<Step>(0);
  const [mapFile, setMapFile] = useState<File | null>(null);
  const [mapPreview, setMapPreview] = useState<SheetPreview | null>(null);
  const [colMap, setColMap] = useState<ColumnMap>(unmapped);
  const [mapBusy, setMapBusy] = useState(false);
  const [mapError, setMapError] = useState('');
  const [toast, setToast] = useState('');
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [deferredPrompt, setDeferredPrompt] = useState<{ prompt: () => void } | null>(null);
  const [history, setHistory] = useState<Record<string, Record<string, DayEntry>>[]>([]);

  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onSchemeChange = () => {
      if (loadTheme() === 'system') applyTheme('system');
    };
    mq?.addEventListener?.('change', onSchemeChange);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      const pe = e as Event & { prompt: () => void };
      setDeferredPrompt({ prompt: () => pe.prompt() });
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => {
      mq?.removeEventListener?.('change', onSchemeChange);
      window.removeEventListener('beforeinstallprompt', onPrompt);
    };
  }, []);

  const cycleTheme = () => setTheme((t) => {
    const next: Theme = t === 'light' ? 'dark' : t === 'dark' ? 'system' : 'light';
    applyTheme(next);
    return next;
  });

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2600);
  }, []);

  const onParsed = (r: ParseResult, f: File) => {
    setParsed(r);
    setFileName(f.name);
    const g = guessPeriod(r.punches);
    setMonth(g.month); setYear(g.year);
    setSelected(new Set(r.employees.map((e) => e.name)));
    setActiveEmp(r.employees[0]?.name ?? '');
    setEmpInfos({});
    setOverrides({}); setHolidays([]); setLeaves({});
    setMapFile(null); setMapPreview(null); setMapError('');
    setStep(1);
    flash(`Loaded ${r.employees.length} employee(s) from ${f.name}`);
  };

  const clearAll = () => {
    if (!window.confirm('Remove uploaded data and settings from this session?')) return;
    setParsed(null); setFileName(''); setSelected(new Set());
    setActiveEmp(''); setOverrides({}); setHolidays([]); setLeaves({}); setEmpInfos({});
    setMapFile(null); setMapPreview(null); setMapError('');
    setStep(0);
  };

  const needMapping = async (f: File, err: string) => {
    try {
      const preview = await readSheetGrid(f);
      const lowered = preview.headers.map((h) => h.toLowerCase().replace(/[_\s]+/g, ' '));
      setColMap(autoMap(lowered));
      setMapPreview(preview);
      setMapFile(f);
      setMapError(err);
      setStep(0);
    } catch (e) {
      setMapError(e instanceof Error ? e.message : err);
    }
  };

  const applyMapping = async () => {
    if (!mapFile) return;
    setMapBusy(true); setMapError('');
    try {
      const r = await parseBiometricFile(mapFile, colMap);
      onParsed(r, mapFile);
    } catch (e) {
      setMapError(e instanceof Error ? e.message : 'Mapping still produced no punches.');
    } finally { setMapBusy(false); }
  };

  const loadSample = async () => {
    try {
      const f = await makeSampleFile();
      const r = await parseBiometricFile(f);
      setFileName('sample-biometric.xlsx (demo)');
      onParsed(r, f);
      setFileName('sample-biometric.xlsx (demo)');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Sample failed to load.');
    }
  };

  // Day-matrix: remap stored ISO dates when user changes period (day-number preserving)
  const effectiveEmployees = useMemo(() => {
    if (!parsed?.matrixAssumed) return parsed?.employees ?? [];
    return remapMatrixEmployees(parsed.employees, parsed.matrixAssumed, { month, year });
  }, [parsed, month, year]);

  const effectiveOverrides = useMemo(() => {
    if (!parsed?.matrixAssumed) return overrides;
    const a = parsed.matrixAssumed;
    if (a.month === month && a.year === year) return overrides;
    const out: Record<string, Record<string, DayEntry>> = {};
    for (const [emp, map] of Object.entries(overrides)) {
      const remapped: Record<string, DayEntry> = {};
      for (const [iso, entry] of Object.entries(map)) {
        const day = Number(iso.slice(8, 10));
        if (!Number.isFinite(day) || day < 1 || day > 31) continue;
        remapped[toISODate(year, month, day)] = entry;
      }
      out[emp] = remapped;
    }
    return out;
  }, [overrides, parsed, month, year]);

  const baseDays = useMemo(() => {
    const emp = effectiveEmployees.find((e) => e.name === activeEmp);
    return emp?.days ?? {};
  }, [effectiveEmployees, activeEmp]);

  const merged: Record<string, DayEntry> = useMemo(
    () => ({ ...baseDays, ...(effectiveOverrides[activeEmp] ?? {}) }),
    [baseDays, effectiveOverrides, activeEmp],
  );

  const hasUndoSnapshot = useMemo(() => {
    void history;
    void activeEmp;
    return !!loadUndoSnapshot();
  }, [history, activeEmp]);

  const empLeaves = useMemo(() => leaves[activeEmp] ?? [], [leaves, activeEmp]);
  const days = useMemo(
    () => resolveMonth(merged, month, year, holidays, empLeaves),
    [merged, month, year, holidays, empLeaves],
  );
  const issues = useMemo(() => validateDays(days), [days]);
  const typical = useMemo(() => computeTypicalTimes(days, (empInfos[activeEmp]?.officialHours ?? prefs.officialHours)), [days, empInfos, activeEmp, prefs.officialHours]);
  const typicalHint = `${typical.amIn} · ${typical.amOut} · ${typical.pmIn} · ${typical.pmOut}`;
  const flashFill = useCallback(() => {
    const toFill = buildFlashFillOverrides(days, typical);
    const count = Object.keys(toFill).length;
    if (!count) { flash('No blank workdays to fill.'); return; }
    if (!window.confirm(`Flash Fill ${count} blank/incomplete workday${count > 1 ? 's' : ''} with ${typicalHint} for ${activeEmp}? You can Undo.`)) return;
    setHistory((h) => [...h.slice(-19), overrides]);
    saveUndoSnapshot(activeEmp, Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, { amIn: v.amIn, amOut: v.amOut, pmIn: v.pmIn, pmOut: v.pmOut }])));
    setOverrides((o) => ({ ...o, [activeEmp]: { ...(o[activeEmp] ?? {}), ...toFill } }));
    flash(`Flash-filled ${count} day${count > 1 ? 's' : ''} for ${activeEmp.split(' ')[0]}`);
  }, [days, typical, typicalHint, activeEmp, merged, overrides, flash]);
  const activeStored = empInfos[activeEmp] ?? {};
  const info: EmployeeInfo = {
    name: (activeStored.name ?? activeEmp).toUpperCase(),
    position: activeStored.position ?? prefs.position,
    office: activeStored.office ?? prefs.office,
    officialHours: activeStored.officialHours ?? prefs.officialHours,
  };

  const toggle = useCallback((n: string) => setSelected((s) => {
    const c = new Set(s);
    if (c.has(n)) c.delete(n); else c.add(n);
    return c;
  }), []);

  const edit = useCallback((date: string, field: keyof DayEntry, value: string) => {
    setHistory((h) => [...h.slice(-19), overrides]);
    saveUndoSnapshot(activeEmp, Object.fromEntries(
      Object.entries(merged).map(([k, v]) => [k, { amIn: v.amIn, amOut: v.amOut, pmIn: v.pmIn, pmOut: v.pmOut }]),
    ));
    setOverrides((o) => ({
      ...o,
      [activeEmp]: {
        ...(o[activeEmp] ?? {}),
        [date]: { ...(merged[date] ?? { amIn: '', amOut: '', pmIn: '', pmOut: '', corrected: false }), [field]: value, corrected: true },
      },
    }));
  }, [activeEmp, merged, overrides]);

  const undo = () => {
    if (history.length) {
      setOverrides(history[history.length - 1]);
      setHistory((h) => h.slice(0, -1));
      flash('Undone — restored previous values.');
      return;
    }
    const snap = loadUndoSnapshot();
    if (snap && effectiveEmployees.some((e) => e.name === snap.emp)) {
      setActiveEmp(snap.emp);
      setOverrides((o) => ({
        ...o,
        [snap.emp]: Object.fromEntries(
          Object.entries(snap.days).map(([k, v]) => [k, { ...v, corrected: true }]),
        ),
      }));
      clearUndoSnapshot();
      flash('Undone — restored the saved snapshot.');
      return;
    }
    flash('Nothing to undo.');
  };
  const toggleHoliday = useCallback((date: string) =>
    setHolidays((h) =>
      h.some((x) => x.date === date)
        ? h.filter((x) => x.date !== date)
        : [...h, { date, description: 'Holiday', type: 'Regular' as const }],
    ), []);

  const toggleLeave = useCallback((date: string) =>
    setLeaves((l) => {
      const cur = l[activeEmp] ?? [];
      return {
        ...l,
        [activeEmp]: cur.some((x) => x.date === date)
          ? cur.filter((x) => x.date !== date)
          : [...cur, { date, leaveType: 'VL' }],
      };
    }), [activeEmp]);

  const clearDay = useCallback((date: string) =>
    setOverrides((o) => {
      const cur = { ...(o[activeEmp] ?? {}) };
      delete cur[date];
      return { ...o, [activeEmp]: cur };
    }), [activeEmp]);

  const patchPrefs = (p: Partial<typeof prefs>) =>
    setPrefs((prev) => {
      const next = { ...prev, ...p };
      savePrefs(next);
      return next;
    });

  const patchEmpInfo = (name: string, patch: Partial<EmployeeInfo>) =>
    setEmpInfos((prev) => ({ ...prev, [name]: { ...(prev[name] ?? {}), ...patch } }));

  const applyEmpFieldToAll = (field: keyof EmployeeInfo, value: string) =>
    setEmpInfos((prev) => {
      const next: Record<string, Partial<EmployeeInfo>> = { ...prev };
      for (const n of selected) next[n] = { ...(next[n] ?? {}), [field]: value };
      return next;
    });

  const chosen = effectiveEmployees.filter((e) => selected.has(e.name)) ?? [];

  const bundles = (): ExportBundle[] =>
    chosen.map((e) => {
      const empMerged = { ...e.days, ...(effectiveOverrides[e.name] ?? {}) };
      const empLv = leaves[e.name] ?? [];
      const s = empInfos[e.name] ?? {};
      return {
        info: {
          name: (s.name ?? e.name).toUpperCase(),
          position: s.position ?? prefs.position,
          office: s.office ?? prefs.office,
          officialHours: s.officialHours ?? prefs.officialHours,
        },
        month, year,
        days: resolveMonth(empMerged, month, year, holidays, empLv),
        holidays, leaves: empLv,
      };
    });

  const stamp = `${monthName(month).toLowerCase()}_${year}`;
  const base = (prefs.fileBase || 'DTR').replace(/[\\/?*[\]:]/g, '_').slice(0, 40) || 'DTR';
  const doXlsx = async () => {
    const b = bundles();
    if (!b.length) { flash('Select at least one employee first.'); return; }
    await downloadXlsx(b, b.length === 1 ? `${base}_${b[0].info.name}.xlsx` : `${base}_${stamp}.xlsx`);
    flash(`Excel downloaded (${b.length} sheet${b.length > 1 ? 's' : ''}).`);
  };
  const doPrintSingle = () => {
    document.documentElement.setAttribute('data-print', 'single');
    window.print();
    const clear = () => document.documentElement.removeAttribute('data-print');
    window.addEventListener('afterprint', clear, { once: true });
    setTimeout(clear, 2000);
  };
  const doPrintBatch = () => {
    const b = bundles();
    if (!b.length) { flash('Select at least one employee first.'); return; }
    if (b.length === 1) { doPrintSingle(); return; }
    document.documentElement.setAttribute('data-print', 'batch');
    window.print();
    const clear = () => document.documentElement.removeAttribute('data-print');
    window.addEventListener('afterprint', clear, { once: true });
    setTimeout(clear, 2000);
  };

  const doZip = async () => {
    const b = bundles();
    if (!b.length) { flash('Select at least one employee first.'); return; }
    await downloadZip(b, `${base}_${stamp}.zip`, base);
    flash(`ZIP downloaded (${b.length} file${b.length > 1 ? 's' : ''}).`);
  };

  const stepDone = (s: number): boolean => {
    if (!parsed) return false;
    if (s === 0) return true;
    if (s === 1) return selected.size > 0;
    if (s === 2) return month >= 1 && month <= 12 && year >= 2000;
    return true;
  };

  return (
    <>
      <TopBar
        selected={parsed ? selected.size : 0}
        theme={theme}
        onTheme={cycleTheme}
        onClear={parsed ? clearAll : null}
        onInstall={() => deferredPrompt?.prompt()}
        canInstall={!!deferredPrompt}
      />
      <Page>
        <div className="flex justify-center sm:justify-start">
          <PrivacyStrip />
        </div>

        {!parsed && !mapPreview && <UploadStep onParsed={onParsed} onNeedMap={needMapping} onSample={loadSample} />}
        {!parsed && mapPreview && mapFile && (
          <ColumnMappingStep
            preview={mapPreview} map={colMap} onChange={setColMap}
            onBack={() => { setMapPreview(null); setMapFile(null); }}
            onApply={applyMapping} busy={mapBusy} error={mapError}
          />
        )}

        {parsed && (
          <>
            <Card className="!p-0 overflow-hidden">
              <div className="border-b border-slate-200 bg-slate-50/50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/50 sm:px-6">
                <Stepper labels={STEP_LABELS} step={step} done={stepDone} onGo={(s) => setStep(s as Step)} />
              </div>
              <div className="flex flex-wrap items-center gap-2 px-5 py-3 text-xs sm:px-6">
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-slate-400" />
                  <span className="max-w-[180px] truncate font-semibold sm:max-w-none">{fileName}</span>
                  <span className="hidden h-3 w-px bg-slate-200 dark:bg-slate-700 sm:block" aria-hidden />
                  <span className="hidden sm:inline text-slate-600 dark:text-slate-400">Sheet “{parsed.sheetName}”</span>
                  <span className="hidden h-3 w-px bg-slate-200 dark:bg-slate-700 sm:block" aria-hidden />
                  <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400">
                    <Users className="h-3 w-3" /> {parsed.employees.length} employees
                  </span>
                </span>
                {selected.size > 0 && selected.size < parsed.employees.length && (
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    {selected.size} selected — {parsed.employees.length - selected.size} hidden from export
                  </span>
                )}
              </div>
            </Card>

            {parsed.warnings.map((w) => (
              <div
                key={w}
                className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-900 dark:border-amber-900/30 dark:bg-amber-950/30 dark:text-amber-200"
              >
                <span className="mt-0.5 grid h-6 w-6 place-items-center rounded-full bg-amber-500 text-white">
                  <AlertTriangle className="h-3.5 w-3.5" />
                </span>
                <span>{w}</span>
              </div>
            ))}

            {step === 1 && (
              <EmployeeStep
                list={effectiveEmployees} selected={selected} onToggle={toggle}
                onAll={(v) => setSelected(new Set(v ? effectiveEmployees.map((e) => e.name) : []))}
              />
            )}
            {step === 2 && (
              <ConfigStep
                month={month} year={year}
                info={info}
                activeEmp={activeEmp}
                selectedNames={chosen.map((c) => c.name)}
                selectedCount={chosen.length}
                onMonth={setMonth} onYear={setYear}
                onInfo={(p) => {
                  // Name/position/office/hours are per-employee now; keep prefs as default for next time
                  if (p.name !== undefined) patchEmpInfo(activeEmp, { name: p.name });
                  if (p.position !== undefined) {
                    patchEmpInfo(activeEmp, { position: p.position });
                    patchPrefs({ position: p.position });
                  }
                  if (p.office !== undefined) {
                    patchEmpInfo(activeEmp, { office: p.office });
                    patchPrefs({ office: p.office });
                  }
                  if (p.officialHours !== undefined) {
                    patchEmpInfo(activeEmp, { officialHours: p.officialHours });
                    patchPrefs({ officialHours: p.officialHours });
                  }
                }}
                onApplyFieldToAll={applyEmpFieldToAll}
                onSwitchEmp={(name) => setActiveEmp(name)}
              />
            )}
            {step === 3 && (
              <div className="space-y-4">
                <Card className="!p-4 sm:!p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="inline-flex items-center gap-2 text-[13px] font-semibold tracking-tight">
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900">
                        <Users className="h-3.5 w-3.5" />
                      </span>
                      Reviewing
                    </h2>
                    <div className="flex flex-wrap gap-1.5">
                      {chosen.map((e) => (
                        <button
                          key={e.name}
                          type="button"
                          onClick={() => setActiveEmp(e.name)}
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${e.name === activeEmp ? 'border-slate-900 bg-slate-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-slate-900' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400'}`}
                        >
                          {e.name}
                        </button>
                      ))}
                      {!chosen.length && <span className="text-xs text-slate-600 dark:text-slate-400">No one selected — go back to Employees.</span>}
                    </div>
                    <Btn size="sm" variant="ghost" disabled={!history.length && !hasUndoSnapshot} onClick={undo} className="ml-auto">
                      <Undo2 className="h-3.5 w-3.5" /> Undo
                    </Btn>
                  </div>
                </Card>
                <AttendanceStep days={days} holidays={holidays} leaves={empLeaves} onEdit={edit} onHoliday={toggleHoliday} onLeave={toggleLeave} onClear={clearDay} onFlashFill={flashFill} typicalHint={typicalHint} />
              </div>
            )}
            {step === 4 && (
              <HolidayLeaveStep
                activeEmp={activeEmp}
                selectedCount={chosen.length}
                selectedNames={chosen.map((c) => c.name)}
                holidays={holidays}
                leaves={empLeaves}
                allLeaves={leaves}
                onHol={(h) => setHolidays((x) => [...x.filter((y) => y.date !== h.date), h])}
                onDelHol={(d) => setHolidays((x) => x.filter((y) => y.date !== d))}
                onLeave={(l) => setLeaves((x) => ({ ...x, [activeEmp]: [...(x[activeEmp] ?? []).filter((y) => y.date !== l.date), l] }))}
                onDelLeave={(d) => setLeaves((x) => ({ ...x, [activeEmp]: (x[activeEmp] ?? []).filter((y) => y.date !== d) }))}
                onLeaveAll={(l) => setLeaves((prev) => {
                  const next: Record<string, LeaveEntry[]> = { ...prev };
                  for (const name of selected) {
                    const cur = next[name] ?? [];
                    if (!cur.some((y) => y.date === l.date)) next[name] = [...cur, l];
                    else next[name] = cur.map((y) => (y.date === l.date ? l : y));
                  }
                  return next;
                })}
                onDelLeaveAll={(d) => setLeaves((prev) => {
                  const next: Record<string, LeaveEntry[]> = { ...prev };
                  for (const name of selected) {
                    next[name] = (next[name] ?? []).filter((y) => y.date !== d);
                  }
                  return next;
                })}
                onSwitchEmp={(name) => setActiveEmp(name)}
              />
            )}
            {step === 5 && (
              <PreviewStep
                info={info} month={month} year={year} days={days} holidays={holidays} leaves={empLeaves} issues={issues}
                selectedCount={chosen.length} selectedNames={chosen.map((c) => c.name)} activeEmp={activeEmp}
                fileBase={prefs.fileBase || 'DTR'} onFileBase={(v) => patchPrefs({ fileBase: v })}
                onPrint={doPrintSingle} onPrintAll={doPrintBatch} onXlsx={doXlsx} onZip={doZip} bundles={bundles()} onSwitchEmp={(name) => setActiveEmp(name)}
              />
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
              <Btn variant="ghost" disabled={step === 1} onClick={() => setStep((s) => Math.max(1, s - 1) as Step)}>
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </Btn>
              <Btn
                variant="primary"
                disabled={step === 5 || (step === 1 && !selected.size)}
                onClick={() => setStep((s) => Math.min(5, s + 1) as Step)}
              >
                {step === 5 ? 'Done' : 'Continue'} <ArrowRight className="h-3.5 w-3.5" />
              </Btn>
              {step === 3 && chosen.length > 1 && (
                <span className="text-xs text-slate-600 dark:text-slate-400">Reviewing {chosen.findIndex((e) => e.name === activeEmp) + 1} of {chosen.length}</span>
              )}
              <span className="ml-auto hidden items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 sm:inline-flex">
                <ShieldCheck className="h-3.5 w-3.5" /> Local-only · nothing leaves this browser
              </span>
            </div>
          </>
        )}

        {!parsed && (
          <p className="text-center text-xs text-slate-500 dark:text-slate-400">
            Works offline after first load · No account required · Data stays on device
          </p>
        )}
      </Page>
      <Toast msg={toast} />
    </>
  );
}
