# DTR Tool — DepEd Privacy-First DTR Generator

Browser-first DTR preparation tool per `set-up.md`:
**Upload Biometric Excel → Parse → Configure → CSC DTR Preview → Print/PDF → discard data.**

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
pnpm build    # tsc -b && vite build  → dist/
pnpm lint     # oxlint
pnpm preview  # serve the production build
```

## Flow (§21 MVP + §22 V2 extras)
1. **Upload** XLSX → auto-detects employees (long tidy *or* wide day-matrix). Badly-labelled
   files fall through to a **manual column mapper** instead of a dead end. “Try sample data” loads
   a built-in 2-employee September workbook.
2. **Employees** — search, select all/clear, per-person punch counts.
3. **Period & details** — month/year auto-guessed from the file; display name, position, office,
   official hours (remembered on this device only).
4. **Review** — editable AM/PM times with ✎ correction markers, filters (All / ⚠ Issues / ✎ Edited),
   day badges (Holiday / Leave / Weekend), H / L quick toggles, per-day reset, and **Undo edit**.
5. **Holidays & leaves** — Regular/Special holidays (global) + typed leaves (per employee).
6. **Export** — preview the CSC DTR, then **Print/Save PDF**, **Excel (.xlsx)**, or **ZIP** of one
   `.xlsx` per employee. Export filename base is configurable.

## Themes & accessibility
- **Light / Dark / System** toggle in the top bar (persisted; follows OS while on *System*).
- Keyboard-focus rings, `aria-label`s on icon-only controls, semantic `nav`/`header`/`role="status"`.
- Sticky Date/Mark columns on narrow screens so the attendance table stays usable.

## Privacy model (§2, §19)
- All parsing, generating and exporting happens in the browser. No backend, no analytics.
- Attendance data lives **only in tab memory** — closing the tab discards it. The Clear-data button
  wipes it immediately.
- `localStorage` holds **non-sensitive preferences only**: theme, position, office, official hours,
  export filename base, and a small last-edit snapshot used by Undo.

## Source layout
```
src/
  App.tsx                  orchestrator: state, steps, export bundling
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
    slots.ts               punch → AM/PM 4-slot assignment
    parser.ts              workbook reading (long + wide formats), lazy xlsx
    columns.ts             column-mapping types
    rules.ts               day classification + validation
    export.ts              XLSX/ZIP builders, lazy xlsx + jszip
    sample.ts              built-in demo workbook
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
