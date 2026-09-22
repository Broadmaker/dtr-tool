# DTR Tool — Next Steps

Companion to `set-up.md` (the design brief) and `README.md` (current state).
This file tracks **what to build next, in priority order**, with enough
technical detail that either of us can pick an item up cold.

Last updated: after the Tailwind/theme + quick-UX pass.

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
| **Batch print (all selected)** | ❌ **gap — item 1** |
| CSC form fidelity vs real DepEd form | ⚠️ approximate — item 2 |
| PH holiday preset | ❌ gap — item 3 |
| Saved importer presets | ❌ gap — item 4 |

---

## 1. Batch print — print every selected employee in one job  ⭐ highest value

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

## 2. CSC form fidelity — match the real DepEd DTR  ⭐ blocked on inputs

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
- [ ] Printed page overlays the real form within ~2mm.
- [ ] Row height stays constant across 28/30/31-day months.
- [ ] Signature lines land at the same position as the official blank.

---

## 3. PH holiday preset

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

## 4. Saved importer presets (column mapping)

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

## Later — from `set-up.md` §22 / §23 (not scheduled)

- Split/merged PDF output; a "one combined PDF" option
- Automatic attendance anomaly detection (weekend punch, holiday punch,
  overnight shift, single-punch day)
- Schedule engine: parse `officialHours` into real times and compute
  late / undertime / half-day per day (today it is only a printed string)
- Per-employee position/office (currently one shared `Prefs` value)
- Employee information manager, DTR validator view, Print Center (§23)
- Extended validation surface: `validateDays()` already emits `level: 'info'`
  issues that the Preview step does not display yet

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
cd C:\Users\Mark\Desktop\DTR-Tool
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
pnpm dev      # dev server
pnpm build    # tsc -b && vite build → dist/
pnpm lint     # oxlint
```

Verify every change with `pnpm exec tsc -b` **and** `pnpm exec oxlint` — the
project is currently at zero errors and zero warnings; keep it there.

**Quirk:** in PowerShell, `pnpm build` can report exit code 1 even on success —
the Vite chunk-size *warning* goes to stderr and PowerShell surfaces it as a
native-command error. Check the log for `✓ built`. Raising
`build.chunkSizeWarningLimit` in `vite.config.ts` silences it.

---

## Suggested order

1. **Batch print** — closes the last real workflow gap, no external inputs needed.
2. **PH holiday preset** — small, self-contained, saves typing every month.
3. **Saved importer presets** — pays off on every repeat upload.
4. **CSC fidelity** — highest impact overall, but blocked until the real blank
   form and a filled example are available.

