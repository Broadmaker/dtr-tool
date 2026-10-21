import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import UploadStep from './components/UploadStep';
const ColumnMappingStep = lazy(() => import('./components/ColumnMappingStep'));
const EmployeeStep = lazy(() => import('./components/EmployeeStep'));
const ConfigStep = lazy(() => import('./components/ConfigStep'));
const AttendanceStep = lazy(() => import('./components/AttendanceStep'));
const HolidayLeaveStep = lazy(() => import('./components/HolidayLeaveStep'));
const PreviewStep = lazy(() => import('./components/PreviewStep'));
const Workspace = lazy(() => import('./components/Workspace'));
const AdminConsole = lazy(() => import('./components/AdminConsole'));
import { Btn, Card } from './components/ui';
import PersonPills from './components/PersonPills';
import ConfirmDialog from './components/ConfirmDialog';
import VaultDialog from './components/VaultDialog';
import PrintSupportDialog from './components/PrintSupportDialog';
import { SUPPORT } from './lib/support';
import { Page, PrivacyStrip, Stepper, Toast, TopBar, Footer } from './components/shell';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  FileSpreadsheet,
  Save,
  ShieldCheck,
  Undo2,
  Users,
} from 'lucide-react';
import type { ParseResult } from './lib/parser';
import { autoMap, guessPeriod } from './lib/parser';
import { parseFile, readGrid } from './lib/parseClient';
import type { DayEntry, EmployeeInfo, LeaveEntry, ResolvedDay } from './lib/types';
import type { ColumnMap, SheetPreview } from './lib/columns';
import { unmapped } from './lib/columns';
import type { MappingPreset } from './lib/presets';
import { deletePreset, findPreset, loadPresets, presetFitsLayout, savePreset } from './lib/presets';
import { downloadXlsx, downloadZip } from './lib/export';
import type { ExportBundle } from './lib/export';
import { makeSampleFile } from './lib/sample';
import { monthName } from './lib/dateUtils';
import { applyTheme, loadTheme } from './lib/theme';
import type { Theme } from './lib/theme';
import { clearUndoSnapshot, loadPrefs, loadUndoSnapshot, savePrefs, saveUndoSnapshot } from './lib/storage';
import { buildFlashFillOverrides } from './lib/fill';
import { buildBundles } from './lib/bundles';
import {
  createDtrPeriod,
  createEmployee,
  listDtrPeriods,
  listEmployees,
  saveDtrDays,
  updateEmployee,
} from './lib/api';
import type { DtrDayInput } from './lib/api';
import { useAttendanceReview } from './hooks/useAttendanceReview';
import { useBeforeUnload } from './hooks/useBeforeUnload';
import {
  downloadTextFile,
  encryptSnapshot,
  snapshotToParseResult,
} from './lib/session';
import type { SessionSnapshot } from './lib/session';

type Step = 0 | 1 | 2 | 3 | 4 | 5;
const STEP_LABELS = ['Upload', 'Employees', 'Period', 'Review', 'Holidays', 'Export'];
const ADMIN_KEY = 'dtr.cloud.isAdmin';

function readAdminFlag(): boolean {
  try {
    return localStorage.getItem(ADMIN_KEY) === '1';
  } catch {
    return false;
  }
}

function readAdminRoute(): boolean {
  return window.location.hash.startsWith('#/admin');
}

function readWorkspaceRoute(): boolean {
  return window.location.hash.startsWith('#/workspace');
}

function StepFallback() {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 dark:border-slate-800 dark:bg-slate-900" role="status" aria-label="Loading step">
      <div className="h-4 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
      <div className="mt-3 h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
    </div>
  );
}

function toCloudDay(day: ResolvedDay): DtrDayInput {
  return {
    workDate: day.date,
    amIn: day.entry.amIn || null,
    amOut: day.entry.amOut || null,
    pmIn: day.entry.pmIn || null,
    pmOut: day.entry.pmOut || null,
    dayType:
      day.kind === 'holiday'
        ? 'holiday'
        : day.kind === 'leave'
          ? 'leave'
          : day.kind === 'weekend'
            ? 'weekend'
            : 'work',
    remarks: day.holiday?.description ?? day.leaveType ?? null,
    source: day.entry.corrected ? 'correction' : 'import',
  };
}

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
  const [presets, setPresets] = useState<MappingPreset[]>(loadPresets);
  const [mapBusy, setMapBusy] = useState(false);
  const [mapError, setMapError] = useState('');
  const [toast, setToast] = useState('');
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [deferredPrompt, setDeferredPrompt] = useState<{ prompt: () => void } | null>(null);
  const [history, setHistory] = useState<Record<string, Record<string, DayEntry>>[]>([]);
  const [confirm, setConfirm] = useState<{ title: string; body: string; confirmLabel: string; action: 'clear' | 'flash' } | null>(null);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [vaultBusy, setVaultBusy] = useState(false);
  const [vaultError, setVaultError] = useState('');
  const [isAdmin, setIsAdmin] = useState(readAdminFlag);
  const [adminRoute, setAdminRoute] = useState(readAdminRoute);
  const [workspaceRoute, setWorkspaceRoute] = useState(readWorkspaceRoute);
  const closeWorkspace = useCallback(() => {
    setWorkspaceRoute(false);
    window.location.hash = '';
  }, []);
  const openWorkspace = useCallback(() => {
    setAdminRoute(false);
    setWorkspaceRoute(true);
    window.location.hash = '#/workspace';
  }, []);
  const handleAdminChange = useCallback((value: boolean) => {
    setIsAdmin(value);
    try {
      localStorage.setItem(ADMIN_KEY, value ? '1' : '0');
    } catch {
      // Storage can be unavailable in private mode.
    }
  }, []);
  const openAdmin = useCallback(() => {
    setWorkspaceRoute(false);
    setAdminRoute(true);
    window.location.hash = '#/admin';
  }, []);
  const closeAdmin = useCallback(() => {
    setAdminRoute(false);
    window.location.hash = '';
  }, []);
  // WinRAR-style support reminder: set on every print click, cleared when
  // the dialog resolves. Printing always proceeds — the dialog never gates.
  const [printPrompt, setPrintPrompt] = useState<null | { kind: 'single' | 'batch' }>(null);

  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => {
    const onHash = () => {
      setAdminRoute(readAdminRoute());
      setWorkspaceRoute(readWorkspaceRoute());
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
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
    setConfirm({
      title: 'Clear session?',
      body: 'This removes the uploaded attendance data and all current settings from this session.',
      confirmLabel: 'Clear data',
      action: 'clear',
    });
  };

  const doClear = () => {
    setParsed(null); setFileName(''); setSelected(new Set());
    setActiveEmp(''); setOverrides({}); setHolidays([]); setLeaves({}); setEmpInfos({});
    setMapFile(null); setMapPreview(null); setMapError('');
    setHistory([]);
    clearUndoSnapshot();
    setStep(0);
  };

  // Warn before refresh/close while attendance is in memory (privacy model = tab memory only).
  useBeforeUnload(!!parsed);

  const needMapping = async (f: File, err: string) => {
    try {
      const preview = await readGrid(f);
      // Zero-click repeat: a saved preset matches this exact header layout.
      const hit = findPreset(preview.headers);
      if (hit && presetFitsLayout(hit, preview.headers.length)) {
        try {
          const r = await parseFile(f, hit.map);
          onParsed(r, f);
          flash(`Used saved mapping: ${hit.name}`);
          return;
        } catch {
          // Stale preset (headers match but data doesn't parse) — fall through
          // to manual mapping with the preset prefilled, never fail silently.
        }
      }
      const lowered = preview.headers.map((h) => h.toLowerCase().replace(/[_\s]+/g, ' '));
      setColMap(hit && presetFitsLayout(hit, preview.headers.length) ? hit.map : autoMap(lowered));
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
      const r = await parseFile(mapFile, colMap);
      onParsed(r, mapFile);
    } catch (e) {
      setMapError(e instanceof Error ? e.message : 'Mapping still produced no punches.');
    } finally { setMapBusy(false); }
  };

  const saveCurrentPreset = (name: string) => {
    if (!mapPreview) return;
    const clean = name.trim();
    if (!clean) { flash('Name the preset first (e.g. “ZKTeco K14 — main office”).'); return; }
    if (colMap.employee < 0) { flash('Map at least the employee column before saving.'); return; }
    setPresets(savePreset(clean, mapPreview.headers, colMap));
    flash(`Saved mapping: ${clean.trim().slice(0, 60)}`);
  };

  const removePreset = (fingerprint: string) => {
    setPresets(deletePreset(fingerprint));
    flash('Preset deleted.');
  };

  const loadSample = async () => {
    try {
      const f = await makeSampleFile();
      const r = await parseFile(f);
      setFileName('sample-biometric.xlsx (demo)');
      onParsed(r, f);
      setFileName('sample-biometric.xlsx (demo)');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Sample failed to load.');
    }
  };

  // Derived review data (matrix remap, merged days, validation, schedule, info).
  const {
    effectiveEmployees,
    effectiveOverrides,
    merged,
    hasUndoSnapshot,
    empLeaves,
    days,
    issues,
    typical,
    typicalHint,
    info,
    chosen,
  } = useAttendanceReview({
    parsed,
    month,
    year,
    overrides,
    activeEmp,
    leaves,
    holidays,
    empInfos,
    prefs,
    history,
    selected,
  });
  const flashFill = useCallback(() => {
    const toFill = buildFlashFillOverrides(days, typical);
    const count = Object.keys(toFill).length;
    if (!count) { flash('No blank workdays to fill.'); return; }
    setConfirm({
      title: `Flash Fill ${count} day${count > 1 ? 's' : ''}?`,
      body: `Fill blank/incomplete workdays with ${typicalHint} for ${activeEmp}. You can Undo.`,
      confirmLabel: `Fill ${count} day${count > 1 ? 's' : ''}`,
      action: 'flash',
    });
  }, [days, typical, typicalHint, activeEmp, flash]);

  const doFlashFill = useCallback(() => {
    const toFill = buildFlashFillOverrides(days, typical);
    const count = Object.keys(toFill).length;
    if (!count) { flash('No blank workdays to fill.'); return; }
    setHistory((h) => [...h.slice(-19), overrides]);
    saveUndoSnapshot(activeEmp, Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, { amIn: v.amIn, amOut: v.amOut, pmIn: v.pmIn, pmOut: v.pmOut }])));
    setOverrides((o) => ({ ...o, [activeEmp]: { ...(o[activeEmp] ?? {}), ...toFill } }));
    flash(`Flash-filled ${count} day${count > 1 ? 's' : ''} for ${activeEmp.split(' ')[0]}`);
  }, [days, typical, activeEmp, merged, overrides, flash]);
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

  const applyEmpFieldToAll = (field: keyof EmployeeInfo, value: string) => {
    setEmpInfos((prev) => {
      const next: Record<string, Partial<EmployeeInfo>> = { ...prev };
      for (const n of selected) next[n] = { ...(next[n] ?? {}), [field]: value };
      return next;
    });
    const label =
      field === 'officialHours' ? 'Official hours' : field.charAt(0).toUpperCase() + field.slice(1);
    flash(`Applied ${label} “${value}” to ${selected.size} employee${selected.size > 1 ? 's' : ''}.`);
  };

  const bundles = useCallback(
    (): ExportBundle[] =>
      buildBundles({
        employees: effectiveEmployees,
        overrides: effectiveOverrides,
        leaves,
        empInfos,
        prefs,
        month,
        year,
        holidays,
        selected,
      }),
    [effectiveEmployees, effectiveOverrides, leaves, empInfos, prefs, month, year, holidays, selected],
  );

  // Stable for preview memoization; export/print actions call bundles() fresh.
  const bundleList = useMemo(() => bundles(), [bundles]);

  const saveDtrToCloud = useCallback(async (schoolId: string) => {
    const list = bundles();
    if (!list.length) throw new Error('Select at least one employee first.');

    const roster = await listEmployees(schoolId, { includeInactive: true });
    const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();
    let saved = 0;
    let skipped = 0;
    let created = 0;

    for (const bundle of list) {
      const full = normalize(bundle.info.name);
      let employee =
        roster.find((item) =>
          normalize([item.firstName, item.middleName ?? '', item.lastName].join(' ')) === full,
        ) ?? roster.find((item) => normalize(`${item.firstName} ${item.lastName}`) === full);

      if (!employee) {
        const parts = bundle.info.name.trim().split(/\s+/).filter(Boolean);
        const firstName = parts[0] || 'Employee';
        const lastName = parts.length > 1 ? parts[parts.length - 1] : firstName;
        const middleName = parts.length > 2 ? parts.slice(1, -1).join(' ') : null;
        employee = await createEmployee(schoolId, {
          firstName,
          lastName,
          middleName,
          position: bundle.info.position || null,
        });
        roster.push(employee);
        created += 1;
      } else if (!employee.isActive) {
        const updated = await updateEmployee(schoolId, employee.id, { isActive: true });
        employee = updated;
        const index = roster.findIndex((item) => item.id === updated.id);
        if (index >= 0) roster[index] = updated;
      }

      const periods = await listDtrPeriods(schoolId, {
        year,
        month,
        employeeId: employee.id,
      });
      const period =
        periods[0] ?? (await createDtrPeriod(schoolId, { employeeId: employee.id, year, month }));

      if (period.status === 'approved' || period.status === 'locked') {
        skipped += 1;
        continue;
      }

      await saveDtrDays(schoolId, period.id, bundle.days.map(toCloudDay));
      saved += 1;
    }

    return { saved, skipped, created };
  }, [bundles, month, year]);

  const stamp = `${monthName(month).toLowerCase()}_${year}`;
  const base = (prefs.fileBase || 'DTR').replace(/[\\/?*[\]:]/g, '_').slice(0, 40) || 'DTR';

  const resumeSnapshot = (snap: SessionSnapshot, label: string) => {
    setParsed(snapshotToParseResult(snap));
    setFileName(label);
    setMonth(snap.month);
    setYear(snap.year);
    setSelected(new Set(snap.selected));
    setActiveEmp(snap.activeEmp);
    setEmpInfos(snap.empInfos);
    setOverrides(snap.overrides);
    setHolidays(snap.holidays);
    setLeaves(snap.leaves);
    setHistory([]);
    setMapFile(null);
    setMapPreview(null);
    setMapError('');
    setStep(1);
    flash(`Resumed checkpoint (${snap.employees.length} employee${snap.employees.length > 1 ? 's' : ''})`);
  };

  const saveCheckpoint = async (password: string) => {
    if (!parsed) return;
    setVaultBusy(true);
    setVaultError('');
    try {
      const snapshot: SessionSnapshot = {
        version: 1,
        savedAt: Date.now(),
        fileName,
        month,
        year,
        activeEmp,
        selected: [...selected],
        overrides,
        holidays,
        leaves,
        empInfos,
        employees: parsed.employees,
        punches: parsed.punches,
        sheetName: parsed.sheetName,
        warnings: parsed.warnings,
        matrixAssumed: parsed.matrixAssumed,
      };
      const text = await encryptSnapshot(snapshot, password);
      downloadTextFile(text, `${base}_checkpoint_${stamp}.dtrvault`);
      setVaultOpen(false);
      flash('Checkpoint saved — keep the file and password safe.');
    } catch (e) {
      setVaultError(e instanceof Error ? e.message : 'Failed to save checkpoint.');
    } finally {
      setVaultBusy(false);
    }
  };
  const doXlsx = async () => {
    const b = bundles();
    if (!b.length) { flash('Select at least one employee first.'); return; }
    await downloadXlsx(b, b.length === 1 ? `${base}_${b[0].info.name}.xlsx` : `${base}_${stamp}.xlsx`);
    flash(`Excel downloaded (${b.length} sheet${b.length > 1 ? 's' : ''}).`);
  };
  const requestPrint = (kind: 'single' | 'batch') => {
    // No donation channel configured → print directly, no dialog.
    if (!SUPPORT.donateUrl) {
      if (kind === 'single') doPrintSingle();
      else doPrintBatch();
      return;
    }
    setPrintPrompt({ kind });
  };

  const proceedPrint = () => {
    const kind = printPrompt?.kind;
    setPrintPrompt(null);
    if (kind === 'single') doPrintSingle();
    else if (kind === 'batch') doPrintBatch();
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

  if (adminRoute) {
    return (
      <Suspense
        fallback={
          <div className="grid min-h-dvh place-items-center bg-slate-50 text-sm text-slate-500 dark:bg-slate-950 dark:text-slate-400" role="status">
            Loading admin console…
          </div>
        }
      >
        <AdminConsole onExit={closeAdmin} onAdminChange={handleAdminChange} />
      </Suspense>
    );
  }

  if (workspaceRoute) {
    return (
      <Suspense
        fallback={
          <div className="grid min-h-dvh place-items-center bg-slate-50 text-sm text-slate-500 dark:bg-slate-950 dark:text-slate-400" role="status">
            Loading workspace…
          </div>
        }
      >
        <Workspace
          onExit={closeWorkspace}
          month={month}
          year={year}
          hasDtr={!!parsed}
          onAdminChange={handleAdminChange}
          onOpenAdmin={openAdmin}
          onImportHolidays={(list) => {
            setHolidays((current) => {
              const byDate = new Map(current.map((holiday) => [holiday.date, holiday]));
              for (const holiday of list) byDate.set(holiday.date, holiday);
              return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
            });
            flash(
              `Imported ${list.length} holiday${list.length === 1 ? '' : 's'} into the current DTR.`,
            );
          }}
          onSaveDtr={saveDtrToCloud}
        />
      </Suspense>
    );
  }

  return (
    <>
      <TopBar
        selected={parsed ? selected.size : 0}
        theme={theme}
        onTheme={cycleTheme}
        onClear={parsed ? clearAll : null}
        onInstall={() => deferredPrompt?.prompt()}
        canInstall={!!deferredPrompt}
        onCloud={openWorkspace}
        onAdmin={isAdmin ? openAdmin : null}
      />
      <Page>
        <div className="flex justify-center sm:justify-start">
          <PrivacyStrip />
        </div>

        {!parsed && !mapPreview && (
          <UploadStep
            onParsed={onParsed}
            onNeedMap={needMapping}
            onSample={loadSample}
            onResume={resumeSnapshot}
          />
        )}
        {!parsed && mapPreview && mapFile && (
          <Suspense fallback={<StepFallback />}>
            <ColumnMappingStep
              preview={mapPreview} map={colMap} onChange={setColMap}
              onBack={() => { setMapPreview(null); setMapFile(null); }}
              onApply={applyMapping} busy={mapBusy} error={mapError}
              presets={presets}
              onSavePreset={saveCurrentPreset}
              onApplyPreset={(p) => setColMap({ ...p.map })}
              onDeletePreset={removePreset}
            />
          </Suspense>
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
                <Btn
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setVaultError('');
                    setVaultOpen(true);
                  }}
                  aria-label="Save encrypted checkpoint"
                  title="Save an encrypted checkpoint file to resume later"
                  className="ml-auto"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Checkpoint</span>
                </Btn>
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
              <Suspense fallback={<StepFallback />}>
                <EmployeeStep
                  list={effectiveEmployees} selected={selected} onToggle={toggle}
                  onAll={(v) => setSelected(new Set(v ? effectiveEmployees.map((e) => e.name) : []))}
                />
              </Suspense>
            )}
            {step === 2 && (
              <Suspense fallback={<StepFallback />}>
              <ConfigStep
                month={month} year={year}
                info={info}
                activeEmp={activeEmp}
                selectedNames={chosen.map((c) => c.name)}
                selectedCount={chosen.length}
                onMonth={setMonth} onYear={setYear}
                onInfo={(p) => {
                  // Name/position/office/hours/verifier are per-employee now; keep prefs as default for next time
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
                  if (p.verifier !== undefined) {
                    patchEmpInfo(activeEmp, { verifier: p.verifier });
                    patchPrefs({ verifier: p.verifier });
                  }
                }}
                onApplyFieldToAll={applyEmpFieldToAll}
                onSwitchEmp={(name) => setActiveEmp(name)}
              />
              </Suspense>
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
                    <PersonPills names={chosen.map((c) => c.name)} active={activeEmp} onSelect={setActiveEmp} activeSuffix="" />
                    {!chosen.length && <span className="text-xs text-slate-600 dark:text-slate-400">No one selected — go back to Employees.</span>}
                    <Btn size="sm" variant="ghost" disabled={!history.length && !hasUndoSnapshot} onClick={undo} className="ml-auto">
                      <Undo2 className="h-3.5 w-3.5" /> Undo
                    </Btn>
                  </div>
                </Card>
                <Suspense fallback={<StepFallback />}>
                  <AttendanceStep days={days} holidays={holidays} leaves={empLeaves} scheduleStr={info.officialHours} onEdit={edit} onHoliday={toggleHoliday} onLeave={toggleLeave} onClear={clearDay} onFlashFill={flashFill} typicalHint={typicalHint} />
                </Suspense>
              </div>
            )}
            {step === 4 && (
              <Suspense fallback={<StepFallback />}>
              <HolidayLeaveStep
                activeEmp={activeEmp}
                selectedCount={chosen.length}
                selectedNames={chosen.map((c) => c.name)}
                month={month} year={year}
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
              </Suspense>
            )}
            {step === 5 && (
              <Suspense fallback={<StepFallback />}>
              <PreviewStep
                info={info} month={month} year={year} days={days} holidays={holidays} leaves={empLeaves} issues={issues}
                selectedCount={chosen.length} selectedNames={chosen.map((c) => c.name)} activeEmp={activeEmp}
                fileBase={prefs.fileBase || 'DTR'} onFileBase={(v) => patchPrefs({ fileBase: v })}
                onPrint={() => requestPrint('single')} onPrintAll={() => requestPrint('batch')} onXlsx={doXlsx} onZip={doZip} bundles={bundleList} onSwitchEmp={(name) => setActiveEmp(name)}
              />
              </Suspense>
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
                <ShieldCheck className="h-3.5 w-3.5" /> Local-first · uploads only when you choose
              </span>
            </div>
          </>
        )}

        {!parsed && (
          <p className="text-center text-xs text-slate-500 dark:text-slate-400">
            Works offline after first load · No account required · Data stays on device by default
          </p>
        )}
      </Page>
      <Footer />
      <Toast msg={toast} />
      {vaultOpen && (
        <VaultDialog
          mode="save"
          busy={vaultBusy}
          error={vaultError}
          onCancel={() => {
            if (!vaultBusy) setVaultOpen(false);
          }}
          onSubmit={(pw) => void saveCheckpoint(pw)}
        />
      )}
      {printPrompt && (
        <PrintSupportDialog
          title={printPrompt.kind === 'batch' ? `Print all ${chosen.length} DTRs` : 'Print this DTR'}
          onProceed={proceedPrint}
        />
      )}
      <ConfirmDialog
        spec={confirm}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const action = confirm?.action;
          setConfirm(null);
          if (action === 'clear') doClear();
          else if (action === 'flash') doFlashFill();
        }}
      />
    </>
  );
}
