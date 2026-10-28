# DTR Tool — Next Steps

> Independent personal project. Not affiliated with, endorsed by, or acting on
> behalf of DepEd or the Civil Service Commission.

Companion to `set-up.md` (the design brief) and `README.md` (current state).
This file tracks **what to build next, in priority order**, with enough
technical detail that either of us can pick an item up cold.

Last updated: after the admin Users/Activity expansion and the docs + CI refresh.

---

## Status snapshot

| Area | State |
|---|---|
| Upload → parse (long + wide formats) | ✅ done, lazy `xlsx` |
| Manual column mapping fallback | ✅ done (`ColumnMappingStep`) |
| Employee selection, search | ✅ done |
| Period + employee details | ✅ done (prefs persisted) |
| Editable attendance + correction markers | ✅ done |
| Undo edit (session + persisted snapshot) | ✅ done |
| Holidays + typed leaves | ✅ done |
| CSC DTR preview + validation warnings | ✅ done (approximation) |
| Print / Save PDF (single employee) | ✅ done |
| Excel export (batch, 1 sheet per employee) | ✅ done |
| ZIP export (1 `.xlsx` per employee) | ✅ done |
| Light / Dark / System theme | ✅ done |
| PWA install + offline | ✅ done |
| **Batch print (all selected)** | ✅ done (`doPrintBatch` + `.print-batch` container in `print.css`) |
| CSC form fidelity vs real office form | ✅ verified — item 2 |
| PH holiday preset | ✅ done (`phHolidays.ts` + one-tap load in `HolidayLeaveStep`) |
| Saved importer presets | ✅ done (`presets.ts`, auto-apply in `needMapping`, save/apply/delete in `ColumnMappingStep`) |
| Optional cloud workspace (auth, schools, roles) | ✅ done (`server/` + `Workspace.tsx`; local DTR flow unchanged) |
| System admin console (users, schools, activity) | ✅ done (`AdminConsole.tsx`: bulk approval, filters, pagination, collapsible sidebar, toasts) |
| Admin Users server-side filtering | ✅ done (`GET /api/admin/memberships` query + counts; debounced client fetch) |
| Server typecheck + tests in CI | ✅ done (`.github/workflows/ci.yml`; `@cloudflare/vitest-plugin` + local D1) |

---

## 1. Batch print — print every selected employee in one job  ✅ done

> Shipped: `doPrintBatch()` in `App.tsx` + hidden `.print-batch` stack in
> `PreviewStep` + batch rules in `print.css`. Notes below are kept as build history.

**Problem.** Excel and ZIP already cover the whole batch, but Print only ever
emits the single employee on screen. An AO preparing 47 DTRs must click
Print, pick a person, Print again — 47 times.

**Where it lives now**
- `src/App.tsx:364` — `onPrint={() => window.print()}`
- `src/components/PreviewStep.tsx:38` — renders exactly one `<DtrSheet>`
- `src/components/DtrSheet.tsx` — the CSC template
- `src/print.css` — visibility trick that reveals only `.dtr-sheet`

**Why it isn't a one-liner.** `print.css` currently does:

```css
body * { visibility: hidden; }
.dtr-sheet, .dtr-sheet * { visibility: visible; }
.dtr-sheet { position: absolute; top: 0; left: 0; width: 100%; }
```

If several `.dtr-sheet` elements were mounted at once they would all be
`position: absolute; top: 0`, i.e. **stacked on top of each other on page 1**.

**Approach**
1. In `App.tsx`, build the batch from the existing `bundles()` helper (it already
   resolves edits + holidays + leaves per employee).
2. Render a **print-only** container (hidden on screen, e.g.
   `hidden print:block`) holding one `<DtrSheet>` per bundle.
3. Rewrite the print rules so sheets flow normally with a page break:
   ```css
   @media print {
     body * { visibility: hidden; }
     .print-batch, .print-batch * { visibility: visible; }
     .print-batch { position: absolute; top: 0; left: 0; width: 100%; }
     .print-batch .dtr-sheet { position: static; break-after: page; page-break-after: always; }
     .print-batch .dtr-sheet:last-child { break-after: auto; page-break-after: auto; }
   }
   ```
4. Buttons: keep **Print this DTR** (one page) and add **Print all N DTRs**.
   Scope it to selected employees so it matches Excel/ZIP semantics.

**Acceptance criteria**
- [ ] Selecting 3 employees and clicking *Print all* produces exactly 3 pages,
      one DTR each, no overlap, no clipped rows.
- [ ] Single-employee print is unchanged from today.
- [ ] Each batch page carries its own employee name / period (verify the
      `info` passed per bundle, not the shared `info` object).
- [ ] Works in Chrome and Edge print preview; A4 portrait, 10mm margins.

**Edge cases to handle**
- A 31-day month + certification block may spill to 2 pages — decide whether to
  allow it or shrink type in `dtr.css`.
- Print with 0 employees selected → disable the button with a clear reason.
- Dark mode active at print time must still emit black-on-white.

---

## 2. CSC form fidelity — match the real office DTR  ✅ done (verified by AO)

> Verified against the official form in use: certification wording,
> signature block labels/order, position & office placement, A4 geometry,
> and 28/30/31-day month fit all check out. `DtrSheet.tsx` + `dtr.css`
> confirmed as an accepted replica — no structural changes needed.
> Notes below are kept as build history.

`DtrSheet.tsx` + `dtr.css` are a faithful *approximation*, not a replica.
Printing is only useful if the output is accepted by the office.

**Needs from the AO (see `set-up.md` §24)**
1. The blank/current CSC Daily Time Record form actually used.
2. One correctly completed example.
3. Confirmation of: certification wording, signature block labels
   (employee / verifying official / In-Charge), whether position & office
   print on the form, and where.

**Then adjust** `src/components/DtrSheet.tsx` (structure) and `src/dtr.css`
(typography, borders, spacing). The print stylesheet needs no changes since it
targets `.dtr-sheet` generically.

**Acceptance criteria**
- [x] Printed page overlays the real form within ~2mm.
- [x] Row height stays constant across 28/30/31-day months.
- [x] Signature lines land at the same position as the official blank.

---

## 3. PH holiday preset  ✅ done

> Shipped: `src/lib/phHolidays.ts` (`PH_HOLIDAYS` + `holidaysForMonth`) with a
> one-tap **Load preset** button in `HolidayLeaveStep` (dedup by date, announces
> when the year has no data). Notes below are kept as build history.

**Problem.** Holidays are typed in one at a time, yet Philippine regular and
special non-working days are identical for every school.

**Where it lives**
- `src/components/HolidayLeaveStep.tsx` — the add/remove UI
- `src/lib/types.ts` — `HolidayEntry { date, description, type: 'Regular' | 'Special' }`
- `src/lib/rules.ts` — `resolveMonth()` maps holidays by ISO date

**Approach**
1. New `src/lib/phHolidays.ts` exporting `PH_HOLIDAYS: Record<number, HolidayEntry[]>`
   (keyed by year) plus `holidaysFor(month, year)`.
2. A **Load Philippine holidays** button that merges via the existing `onHol`
   handler — it already de-duplicates by date, so re-clicking is safe.
3. Show a summary such as "3 of 4 known holidays for September 2026 loaded" so
   the AO can see what was applied.

**Acceptance criteria**
- [ ] Loading twice does not duplicate rows.
- [ ] Manually added holidays are never overwritten.
- [ ] Clearly announces when a requested year has no built-in data
      (fall back to manual entry, don't silently do nothing).
- [ ] Optional: import-from-CSV for office-specific proclamations.

---

## 4. Saved importer presets (column mapping)  ✅ done

> Shipped: `src/lib/presets.ts` (ordered-header fingerprint + FNV-1a hash,
> `localStorage` list, prefs only). `needMapping` in `App.tsx` auto-applies a
> matching preset with a "Used saved mapping" toast and falls back to manual
> mapping (prefilled) when parsing still fails. `ColumnMappingStep` has
> "Save this mapping as…", an Apply list, and per-preset delete. Notes below
> are kept as build history.

**Problem.** `ColumnMappingStep` fixes a bad file, but the mapping is per-file.
The next upload from the same biometric machine re-prompts.

**Where it lives**
- `src/lib/columns.ts` — `ColumnMap`, `SheetPreview`
- `src/lib/parser.ts` — `autoMap()`, `readSheetGrid()`, `parseBiometricFile(file, override)`
- `src/lib/storage.ts` — `Prefs` + `loadPrefs`/`savePrefs`

**Approach**
1. Persist a list of presets in `localStorage` (prefs only, never attendance data):
   ```ts
   interface MappingPreset {
     name: string;          // "ZKTeco K14 - main office"
     fingerprint: string;   // hash of normalized, sorted header names
     map: ColumnMap;
   }
   ```
2. On upload, compute the fingerprint. If a preset matches, apply it silently and
   toast "Used saved mapping: <name>".
3. In `ColumnMappingStep`, add "Save this mapping as…" and a preset picker.

**Acceptance criteria**
- [ ] Second upload of the same header layout is zero-click.
- [ ] A different layout does **not** silently reuse a stale preset.
- [ ] Presets are listed and deletable in the UI (nothing buried in devtools).

---

## 5. Cloud workspace follow-ups (optional backend)

> The local DTR flow stays the priority; these only matter once the cloud
> workspace is in active use. Backend details live in `server/README.md`.

**Server-side Users filtering.** ✅ done — `GET /api/admin/memberships` now
accepts `status`, `role`, `schoolId`, `q`, `limit`, and `offset`, and returns
`{ memberships, total, counts }`. `UsersPage` debounces search and fetches one
page at a time; tab badges use the server counts.

**API tests.** ✅ started — `@cloudflare/vitest-plugin` runs `server/test/*`
inside workerd against a migrated local D1. `test/admin.test.ts` covers
system-admin auth, membership filters/pagination, approval + audit trail, and
activity filters. Still to cover: schools/members, employees, holidays, leave,
travels, and DTR routes (including tenant isolation).

**Audit retention.** `audit_log` grows unbounded. Decide on a retention window
or an export/prune job before it becomes a problem.

**Security pass.** Review rate limiting on auth and approval endpoints, confirm
non-members still get `404` on every tenant route, and check that the Pages
proxy does not forward unexpected headers.

---

## Later — from `set-up.md` §22 / §23 (not scheduled)

- Split/merged PDF output; a "one combined PDF" option
- Automatic attendance anomaly detection (weekend punch, holiday punch,
  overnight shift, single-punch day) — ✅ done: `validateDays()`
  flags weekend/holiday/leave punches, OUT-before-IN, overnight-suspect
  hours, and half-days (`src/lib/rules.ts` + `schedule.ts`)
- Engine visibility — ✅ done: Half-day badges in `AttendanceStep`,
  total late / undertime strip in `PreviewStep` (per active employee's schedule)
- Schedule engine: parse `officialHours` into real times and compute
  late / undertime / half-day per day — ✅ done: `src/lib/schedule.ts`
  (`parseOfficialHours`, `requiredMinutes`, `lateForDay`, `classifyDay`)
  feeds Flash Fill, undertime, half-day info issues, and Excel export per employee
- Session checkpoint — ✅ done: explicit password-protected `.dtrvault`
  save/load (`src/lib/session.ts`, WebCrypto PBKDF2/AES-GCM, `VaultDialog`,
  Checkpoint button + Resume in `UploadStep`); nothing auto-persisted
- Per-employee position/office — ✅ done (`empInfos` + apply-to-all in
  `ConfigStep`/`App.tsx`; `bundles()` prints per-employee values)
- Saved importer presets for office proclamations — ✅ done for holidays
  (CSV import in `HolidayLeaveStep` + `parseHolidayCsv`)
- `window.confirm` — ✅ done (accessible `ConfirmDialog` in `App.tsx` +
  `HolidayLeaveStep.tsx`)
- `parser.ts` split — ✅ done (`src/lib/importers/`: `common`,
  `extractedDtr`, `cscForm48`, `segmentRecord`, `attendanceReport`,
  `attendanceLog`; `parser.ts` keeps the orchestrator + generic grid mapping)
- Per-template regression tests — ✅ done (`importers.test.ts`: 11 tests over
  synthetic grids for all 6 layouts + mutual-exclusion guards)
- `App.tsx` derived-data split — ✅ done (`useAttendanceReview` hook +
  pure `buildBundles()` in `src/lib/bundles.ts` with tests; orchestrator keeps
  raw state + actions only)
- CI — ✅ done (`.github/workflows/ci.yml`: install → server install → app + server
  tsc → oxlint → vitest → build)
- WinRAR-style print reminder — ✅ done (`PrintSupportDialog` with donation
  QR on every print click; every dismissal prints; auto-skipped when
  `donateUrl` is empty; swap in the PayMongo link when ready)
- Background-thread parsing — ✅ done (`src/workers/parse.worker.ts` +
  `src/lib/parseClient.ts` with transparent main-thread fallback; all upload,
  mapping, and sample paths routed through it; worker ships as a separate
  lazy chunk)
- Employee information manager, DTR validator view, Print Center (§23)
- Extended validation surface: overnight-shift and single-punch-specific
  messages (covered today by generic incomplete + OUT-before-IN warnings)

---

## Known limitations (honest list)

- Punch → AM/PM slot assignment is heuristic (`src/lib/slots.ts`,
  `assignFourSlots`). With 3+ punches it picks the largest gap as the lunch
  break. Verify against real exports before trusting edge days.
- Validation is shallow: only "incomplete day" is surfaced as a warning.
- `resolveMonth()` classifies a weekday with no punches as `kind: 'empty'`,
  not `'workday'` — worth revisiting once a real schedule exists.
- Undo history is capped at the last 20 edits per session.
- The `localStorage` undo snapshot holds attendance times by design (one
  employee, last edit only). Revisit if the office's privacy reading requires
  it to be memory-only.
- `officialHours` is a printed string only — no schedule engine yet (see Later).

---

## Dev workflow

```powershell
cd <path-to>/DTR-Tool
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
pnpm dev      # dev server
pnpm build    # tsc -b && vite build → dist/
pnpm lint     # oxlint
pnpm test     # vitest (src only)

cd server
pnpm typecheck
pnpm test     # vitest in workerd + local D1
```

Verify every change with `pnpm exec tsc -b`, `pnpm exec oxlint`, and both test
suites — keep the build at zero errors. Oxlint currently reports a handful of
pre-existing `react(set-state-in-effect)` / fast-refresh warnings; don't add
new ones.

**Quirk:** in PowerShell, `pnpm build` can report exit code 1 even on success —
the Vite chunk-size *warning* goes to stderr and PowerShell surfaces it as a
native-command error. Check the log for `✓ built`. Raising
`build.chunkSizeWarningLimit` in `vite.config.ts` silences it.

---

## Suggested order

1. ~~**Batch print**~~ ✅ done.
2. ~~**PH holiday preset**~~ ✅ done.
3. ~~**Saved importer presets**~~ ✅ done.
4. ~~**CSC fidelity**~~ ✅ verified by the AO.
5. **Cloud follow-ups** — server-side Users filtering, API tests, then the
   security pass (see §5).
6. **Product backlog** — remaining items under *Later*; pick based on real AO
   feedback rather than guessing.

