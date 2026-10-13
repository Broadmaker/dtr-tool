# DTR Tool — Privacy-First CSC DTR Generator

> Independent personal project for general productivity use. Not affiliated with,
> endorsed by, or acting on behalf of DepEd or the Civil Service Commission.

Browser-first DTR preparation tool per `set-up.md`:
**Upload Biometric Excel → Parse → Configure → CSC DTR Preview → Print/PDF → discard data.**

## Support & feedback

A **Buy me a coffee** card (Ko-fi) sits beside the upload dropzone, with a
quiet text link kept in the footer alongside the feedback link. Links live in
`src/lib/support.ts` (`helpUrl`, `donateUrl`) — each block hides while its URL
is empty. The app stays fully free either way: donations are voluntary, never
required, and are not payment for any official service.

> 📋 **Planning the next work?** See [`next-steps.md`](./next-steps.md) for the
> prioritized backlog (batch print, CSC form fidelity, PH holiday preset,
> saved importer presets) plus known limitations and the dev/verify workflow.

## Stack
- **React 19 + Vite 8 + TypeScript + pnpm**
- **Tailwind CSS v4** (`@tailwindcss/vite`) — design tokens live in `src/index.css` under `@theme`; class-based dark mode via `@custom-variant dark`
- **SheetJS (`xlsx`)** for Excel read/write, **JSZip** for ZIP export — both **lazy-loaded** so the landing page is small
- **vite-plugin-pwa** — installable, offline-capable after first load
- PDF via browser Print → Save as PDF (no server round-trip)

### Bundle shape (production)
| chunk | size | when it loads |
|---|---|---|
| `index.js` | ~269 kB (83 kB gzip) | app shell, always |
| `xlsx.js` | ~424 kB (141 kB gzip) | first file upload / sample / export |
| `jszip.min.js` | ~96 kB (28 kB gzip) | first ZIP export |
| `index.css` | ~36 kB (7 kB gzip) | always |

## Run
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
pnpm install
pnpm dev      # dev server
pnpm test     # vitest run (63 tests: slots, rules, schedule, holidays, export, bundles, session crypto, parser smoke, importers, worker fallback)
pnpm build    # tsc -b && vite build  → dist/
pnpm lint     # oxlint
pnpm preview  # serve the production build
```

## Flow (§21 MVP + §22 V2 extras)
1. **Upload** XLSX → auto-detects employees (long tidy *or* wide day-matrix). Badly-labelled
   files fall through to a **manual column mapper** instead of a dead end. “Try sample data” loads
   a built-in 2-employee September workbook. Parsing runs in a **Web Worker** (falls back to the
   main thread where workers are unavailable) so large files don't freeze the UI.
2. **Employees** — search, select all/clear, per-person punch counts.
3. **Period & details** — month/year auto-guessed from the file; display name, position, office,
   official hours (remembered on this device only).
4. **Review** — editable AM/PM times with ✎ correction markers, filters (All / ⚠ Issues / ✎ Edited),
   day badges (Holiday / Leave / Weekend / Half-day), H / L quick toggles, per-day reset, and **Undo edit**.
5. **Holidays & leaves** — Regular/Special holidays (global) + typed leaves (per employee).
6. **Export** — preview the CSC DTR (with total late / undertime vs the printed schedule), then **Print/Save PDF**, **Excel (.xlsx)**, or **ZIP** of one
   `.xlsx` per employee. Export filename base is configurable. Print shows a WinRAR-style support
   reminder with a donation QR — it never blocks printing and hides entirely while `donateUrl` is empty.

## Themes & accessibility
- **Light / Dark / System** toggle in the top bar (persisted; follows OS while on *System*).
- Keyboard-focus rings, `aria-label`s on icon-only controls, semantic `nav`/`header`/`role="status"`.
- Sticky Date/Mark columns on narrow screens so the attendance table stays usable.

## Privacy model (§2, §19)
- All parsing, generating and exporting happens in the browser. No backend, no analytics.
- Attendance data lives **only in tab memory** — closing the tab discards it. The Clear-data button
  wipes it immediately.
- **Checkpoints are explicit and encrypted:** the Checkpoint button saves a password-protected
  `.dtrvault` file (PBKDF2-SHA256 → AES-GCM, WebCrypto, no dependencies) so a large batch can
  survive refresh. Nothing is auto-saved; the password never leaves the browser and cannot be
  recovered if forgotten.
- `localStorage` holds **non-sensitive preferences only**: theme, position, office, official hours,
  export filename base, and a small last-edit snapshot used by Undo.

## Source layout
```
src/
  App.tsx                  orchestrator: state, steps, export bundling
  hooks/
    useAttendanceReview.ts derived review data (remap, merged days, validation, info)
    useBeforeUnload.ts     refresh guard while attendance is in memory
  index.css                Tailwind entry + @theme tokens + dark variant
  tables.css               dense/sticky attendance-table helpers
  dtr.css                  CSC DTR sheet typography (print-accurate)
  print.css                print stylesheet — emits ONLY the DTR sheet
  components/
    ui.tsx                 Btn / Card / Field / TextInput / SelectInput / SectionTitle
    shell.tsx              Page / TopBar / PrivacyStrip / Stepper / Toast
    UploadStep.tsx         dropzone + sample + format help
    ColumnMappingStep.tsx  manual column mapper with data preview
    EmployeeStep.tsx       employee selection
    ConfigStep.tsx         period + employee details
    AttendanceStep.tsx     editable grid, filters, corrections
    HolidayLeaveStep.tsx   holidays + leaves
    PreviewStep.tsx        CSC preview, stats, print/Excel/ZIP
    DtrSheet.tsx           the CSC DTR template itself
  lib/
    types.ts               DTR data model
    dateUtils.ts           date/time normalisation
  workers/
    parse.worker.ts        background-thread xlsx + template parsing
    slots.ts               punch → AM/PM 4-slot assignment
    parser.ts              workbook reading (long + wide formats), lazy xlsx
    importers/           one module per biometric template (common, extractedDtr,
                         cscForm48, segmentRecord, attendanceReport, attendanceLog)
    columns.ts           column-mapping types
    rules.ts               day classification + validation
    bundles.ts             per-employee export bundle builder
    parseClient.ts         worker-first parsing with main-thread fallback
    export.ts              XLSX/ZIP builders, lazy xlsx + jszip
    sample.ts              built-in demo workbook
    schedule.ts            officialHours parser + required/late/half-day minutes
    session.ts             encrypted checkpoint save/load (WebCrypto, .dtrvault)
    theme.ts               light/dark/system resolution
    storage.ts             prefs + undo snapshot (localStorage)
```



## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
