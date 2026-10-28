# DTR Tool — Privacy-First CSC DTR Generator

> Independent personal project for general productivity use. Not affiliated with,
> endorsed by, or acting on behalf of DepEd or the Civil Service Commission.

Browser-first DTR preparation tool per `set-up.md`:
**Upload Biometric Excel → Parse → Configure → CSC DTR Preview → Print/PDF → discard data.**

The core DTR flow needs no account and no server. An **optional cloud workspace**
(Cloudflare Worker + D1 + Better Auth) adds school memberships, saved employees,
holidays, leave, official travel, DTR periods, and a system-admin console. Nothing
is sent to the cloud unless you sign in and explicitly save it.

## Support & feedback

A **Buy me a coffee** card (Ko-fi) sits beside the upload dropzone, with a
quiet text link kept in the footer alongside the feedback link. Links live in
`src/lib/support.ts` (`helpUrl`, `donateUrl`) — each block hides while its URL
is empty. The app stays fully free either way: donations are voluntary, never
required, and are not payment for any official service.

> 📋 **Planning the next work?** See [`next-steps.md`](./next-steps.md) for the
> prioritized backlog (cloud follow-ups, product items under *Later*), known
> limitations, and the dev/verify workflow. Backend setup lives in
> [`server/README.md`](./server/README.md).

## Stack
- **React 19 + Vite 8 + TypeScript + pnpm**
- **Tailwind CSS v4** (`@tailwindcss/vite`) — design tokens live in `src/index.css` under `@theme`; class-based dark mode via `@custom-variant dark`
- **SheetJS (`xlsx`)** for Excel read/write, **JSZip** for ZIP export — both **lazy-loaded** so the landing page is small
- **vite-plugin-pwa** — installable, offline-capable after first load
- PDF via browser Print → Save as PDF (no server round-trip)
- **Optional backend:** Cloudflare Workers + Hono + D1 + Better Auth (`server/`),
  proxied same-origin through `functions/api/[[path]].ts`

### Bundle shape (production)
| chunk | size | when it loads |
|---|---|---|
| `index.js` | ~106 kB (30 kB gzip) | app shell, always |
| `vendor.js` | ~221 kB (69 kB gzip) | React + shared deps, always |
| `index.css` | ~84 kB (14 kB gzip) | always |
| `xlsx.js` | ~414 kB (135 kB gzip) | first file upload / sample / export |
| `jszip.js` | ~93 kB (27 kB gzip) | first ZIP export |
| `Workspace.js` | ~60 kB (13 kB gzip) | first cloud workspace visit |
| `AdminConsole.js` | ~48 kB (10 kB gzip) | system-admin console only |

## Run
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
pnpm install
pnpm dev      # dev server
pnpm test     # vitest run (78 tests: slots, rules, schedule, holidays, export, bundles, session crypto, parser smoke, importers, worker fallback)
pnpm build    # tsc -b && vite build  → dist/
pnpm lint     # oxlint
pnpm preview  # serve the production build
```

Optional cloud API (see [`server/README.md`](./server/README.md) for D1 setup,
secrets, migrations, and deployment):

```powershell
cd server
pnpm install
pnpm dev          # wrangler dev on http://localhost:8787 (Vite proxies /api)
pnpm typecheck    # tsc --noEmit
```

The frontend talks to `/api` same-origin. Vite proxies that to `127.0.0.1:8787`
in dev/preview; production goes through the Pages Function proxy. Set
`VITE_API_URL` only when the API lives on a different origin.

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

## Cloud workspace (optional)

Sign in from the top bar to use the shared workspace. It is entirely opt-in and
separate from the local DTR flow.

- **Onboarding** — browse the official school catalog and request AO access; new
  AO memberships stay `pending` until a system admin approves them.
- **School workspace** — employees, holidays, leave types/credits/applications,
  official travels, and monthly DTR periods/days. Saves are explicit; the local
  upload → print flow never writes to the cloud.
- **Roles** — `owner`/`admin` manage the school and members; `ao`/`encoder` edit
  employees, holidays, leave, travel, and DTR; `viewer` is read-only. Every
  mutation is written to the school's `audit_log`.
- **System admin console** (`#/admin`) — schools overview, user approval (single
  and bulk), school detail, and filterable activity history. System admins can
  open any school workspace.
- **Auth** — Better Auth email/password (Google OAuth optional), first-party
  cookies via the same-origin Pages proxy. The first system admin is granted from
  the command line (`server/scripts/grant-admin.mjs`).

## Themes & accessibility
- **Light / Dark / System** toggle in the top bar (persisted; follows OS while on *System*).
- Keyboard-focus rings, `aria-label`s on icon-only controls, semantic `nav`/`header`/`role="status"`.
- Sticky Date/Mark columns on narrow screens so the attendance table stays usable.

## Privacy model (§2, §19)
- **Local by default:** parsing, generating, and exporting the DTR happen in the
  browser. Uploaded biometric files are never sent to a server, and there is no
  analytics or tracking.
- **Cloud is explicit:** only after signing in and choosing to save (employees,
  holidays, leave, travel, DTR periods) does data leave the browser. The cloud
  workspace stores what you save, scoped to your school, plus an audit log of
  mutations. The local upload → print flow stays independent.
- Local attendance data lives **only in tab memory** — closing the tab discards
  it. The Clear-data button wipes it immediately.
- **Checkpoints are explicit and encrypted:** the Checkpoint button saves a
  password-protected `.dtrvault` file (PBKDF2-SHA256 → AES-GCM, WebCrypto, no
  dependencies) so a large batch can survive refresh. Nothing is auto-saved; the
  password never leaves the browser and cannot be recovered if forgotten.
- `localStorage` holds **non-sensitive preferences only**: theme, position,
  office, official hours, export filename base, importer presets, the admin flag,
  and a small last-edit snapshot used by Undo.
- Cloud auth cookies are first-party (same-origin via the Pages proxy). Passwords
  are handled by Better Auth; the app never sees or stores them.

## Source layout
```
src/
  App.tsx                  orchestrator: local steps, cloud save, export bundling
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
    ColumnMappingStep.tsx  manual column mapper with saved presets
    EmployeeStep.tsx       employee selection
    ConfigStep.tsx         period + employee details
    AttendanceStep.tsx     editable grid, filters, corrections
    HolidayLeaveStep.tsx   holidays + leaves
    PreviewStep.tsx        CSC preview, stats, print/Excel/ZIP
    DtrSheet.tsx           the CSC DTR template itself
    VaultDialog.tsx        encrypted checkpoint save/load
    PrintSupportDialog.tsx WinRAR-style print reminder
    Workspace.tsx          optional cloud workspace (auth, schools, tabs)
    WorkspaceDashboard.tsx cloud month dashboard
    AdminConsole.tsx       system-admin console (users, schools, activity)
  lib/
    api.ts                 typed client for the Worker API
    types.ts               DTR data model
    dateUtils.ts           date/time normalisation
    roles.ts               role labels for the UI
    slots.ts               punch → AM/PM 4-slot assignment
    parser.ts              workbook reading (long + wide formats), lazy xlsx
    importers/             one module per biometric template (common, extractedDtr,
                           cscForm48, segmentRecord, attendanceReport, attendanceLog)
    columns.ts             column-mapping types
    rules.ts               day classification + validation
    bundles.ts             per-employee export bundle builder
    parseClient.ts         worker-first parsing with main-thread fallback
    export.ts              XLSX/ZIP builders, lazy xlsx + jszip
    pdf.ts / qr.ts         print-faithful PDF + QR helpers
    presets.ts             saved importer column mappings
    phHolidays.ts          Philippine holiday presets
    sample.ts              built-in demo workbook
    schedule.ts            officialHours parser + required/late/half-day minutes
    session.ts             encrypted checkpoint save/load (WebCrypto, .dtrvault)
    theme.ts               light/dark/system resolution
    storage.ts             prefs + undo snapshot (localStorage)
  workers/
    parse.worker.ts        background-thread xlsx + template parsing

server/                    optional Cloudflare Worker API (Hono + D1 + Better Auth)
  src/index.ts             app entry, CORS, /health, /api/auth/*, /api/me
  src/routes/              schools, onboarding, admin, employees, holidays,
                           leaves, travels, dtr, audit
  migrations/              Better Auth + domain schema (schools, DTR, audit, …)
functions/api/[[path]].ts  Pages Function: same-origin proxy to the Worker
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
