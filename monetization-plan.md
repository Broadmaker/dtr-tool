# DTR Tool — Monetization & Growth Plan (Future)

> Status: **PLAN ONLY — not yet built.** Companion to `set-up.md` (design brief),
> `README.md` (current state), and `next-steps.md` (backlog).
>
> Decisions locked for this plan:
> - Payment: **PayMongo recurring** (Cards / GCash / Maya)
> - Model: **Trial then paywall** (14-day full-Pro trial, then subscribe)
> - Backend: **OK to add small backend** (Supabase Auth + Postgres + Edge Functions)
> - Premium tracks: **School/Team workspace, Reports & analytics, Cloud sync & history, Bulk automation**

---

## 1. Where we are today

- Browser-first, privacy-first: Upload XLSX → Parse → Configure → Preview → Print/XLSX/ZIP → discard.
- Core flow: no auth, no network calls for attendance. Static `dist/`, PWA offline-capable.
- Optional cloud workspace (Worker + D1 + Better Auth) for schools, saved DTRs,
  leave/travel, and the admin console — opt-in only.
- Voluntary donations only (`src/lib/support.ts`, `PrintSupportDialog`) — never gating.
- Full feature inventory for gating analysis: see `src/App.tsx` (steps 0–5),
  `src/lib/export.ts`, `src/components/PreviewStep.tsx`, `src/lib/presets.ts`,
  `src/lib/session.ts` (`.dtrvault`).

Privacy promise to preserve: **attendance files are processed locally and never
uploaded. Server holds only account + entitlement + opaque encrypted blobs.**

---

## 2. Target architecture

```text
DTR-Tool (static PWA, offline)
 ├── stays local: parse → review → bundles → print/xlsx/zip, .dtrvault
 └── new: lib/entitlements.ts + UpgradeDialog + TopBar plan badge
          │  GET /me (cached, offline grace) — no attendance payload
          ▼
Supabase — Auth + Postgres + Edge Functions
 ├── tables: profiles, subscriptions, entitlements, trial_grants,
 │           schools, school_members, vaults (opaque blobs only)
 └── functions: POST /checkout → PayMongo Sub API
                POST /webhook → grant Pro
                GET  /me      → { plan, exp, trialEnds }
                GET  /portal  → PayMongo billing portal link
PayMongo: Subscription (Cards/GCash/Maya) + webhooks + portal
```

Rules:

1. Attendance / punches / overrides / leaves **never leave the browser**.
2. Backend stores only: email, plan, expiry, seats, trial dates, opaque vault blobs.
3. Client caches entitlement in `localStorage` (`dtr-tool:entitlement:v1`) with TTL
   for offline grace (proposed 14 days, to confirm 14 vs 30).
4. PWA Service Worker allowlists only `*.supabase.co` + `paymongo.com`; everything
   else stays offline-first.
5. Keep `SUPPORT` (tips/donations) separate from `BILLING` (subscriptions) —
   do not conflate in UI or code.

---

## 3. Pricing / packaging (proposed — confirm before build)

| Tier | Price idea | Gets |
| ---- | ---------- | ---- |
| Free (forever) | ₱0 | Upload → parse → review 1 employee, single DTR preview + single print, sample data |
| Trial | 14 days, account only, no card | Full Pro once: batch print, ZIP/Excel batch, Flash Fill, presets, PH preset + CSV, cloud vaults |
| Pro (AO) | ₱149–199/mo (TBD) | Unlimited employees, bulk automation, reports, cloud vaults/history |
| Team / School | ₱499–799/mo, 3–5 seats (TBD) | Pro + workspace, roles, shared templates/holidays, consolidated reports |

Gating points (existing seams, minimal diff):

- `App.tsx: stepDone + step router` → `RequirePro` around Step 5 Export.
- `App.tsx: doXlsx / doZip / requestPrint` + `PreviewStep.tsx` buttons →
  batch / Excel / ZIP = Pro; single print = free.
- `AttendanceStep` Flash Fill, `presets.ts` cap (50 → 5 free),
  `phHolidays` CSV import, `VaultDialog` cloud upload = Pro.
- Never gate: parsing, manual edit, Clear-data, offline load, sample data.

`PrintSupportDialog` (WinRAR-style voluntary reminder) evolves into
`UpgradeDialog` — reuse countdown/QR pattern, but Skip on gated actions shows
trial/upgrade CTA instead of printing.

Open pricing questions:

- [ ] Final Pro / Team prices + trial length (14d no-card?)
- [ ] Seat count for Team?
- [ ] One payer per school vs per-AO billing?
- [ ] Offline grace: 14d or 30d?

---

## 4. Phases

### Phase 0 — Billing abstraction (1–2 days, no UX break)

- New `src/lib/billing.ts` (`BILLING { checkoutUrl, portalUrl }`).
- New `src/lib/entitlements.ts` (`loadEntitlement(), hasPro(), daysLeft()`).
- New `dtr-tool:entitlement:v1` key alongside `src/lib/storage.ts` prefs.
- `TopBar` plan badge + `SupportCard → UpgradeCard` variant (default `free`).
- Tests: entitlement cache + TTL + offline fallback.

Acceptance: zero behavior change, `pnpm exec tsc -b` + `pnpm exec oxlint` clean.

### Phase 1 — Backend + PayMongo + Trial (1–2 weeks, core monetization)

- Supabase project: Auth (email/Google), tables above, RLS (users read own
  entitlement only).
- Edge Functions: `/checkout`, `/webhook` (verify signature → upsert
  `subscriptions`/`entitlements`), `/me`, `/portal`.
- Client: login modal, `onAuth → fetch /me → cache`, trial grant on first signup,
  `online`-event revalidation, expired-grace downgrade (never hard-lock loaded tab).
- PayMongo dashboard: product/price, webhook secret, test Cards/GCash, portal link.
- Env: `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (public),
  `PAYMONGO_SECRET` / `PAYMONGO_WEBHOOK_SECRET` (server-only).

Acceptance:

- Subscribe → webhook → Pro unlock < 60s.
- Cancel → downgrade at period end, clear messaging.
- Airplane mode within grace → Pro still works; past grace → free with banner.
- Network tab shows zero attendance uploads.
- Manual GCash activation script exists as break-glass fallback.

### Phase 2 — New paid features (each independently shippable)

1. **Bulk automation (Pro)**
   - Combined single PDF (all DTRs), one-click ZIP+print queue, saved export
     presets (`fileBase + office + verifier` per school).
   - Touch: `src/lib/export.ts`, `src/lib/bundles.ts`, `print.css .print-batch`.

2. **Reports & analytics (Pro / Team)**
   - Tardiness/undertime summary sheet in Excel export, leave-balance table,
     anomaly dashboard (reuse `rules.ts validateDays` + `schedule.ts`),
     Form 48 summary row.
   - Pure-client, no new PII storage.

3. **Cloud sync & history (Pro)**
   - Encrypted vault upload (reuse `session.ts` PBKDF2/AES-GCM — server stores
     opaque blob only, cannot read), month history list, auto PH-holiday refresh.
   - Storage: Supabase Storage, cap e.g. 50 MB/user.

4. **School / Team workspace (Team)**
   - `schools + school_members` tables, roles (owner / AO / viewer),
     shared templates (office / hours / verifier / holidays), seat enforcement
     in `bundles()` selected-cap.

### Phase 3 — Hardening + launch

- SW allowlist + CSP tightening, no analytics on DTR routes.
- Copy: Footer terms/refund, trial banner, expired-state UX.
- Docs: update `README.md`, `next-steps.md`, this file (mark shipped).
- CI: webhook-signature + entitlement-expiry tests; manual A4 print (Chrome/Edge),
  GCash test flow, trial-expiry UX.
- Ops runbook: refund / cancel / seat change / webhook replay.

---

## 5. Costs / risks

- Supabase free → ~$25/mo when growing; PayMongo per-txn fee + payout fees.
- PayMongo webhook delays → show `pending` state, never block loaded data.
- Account-requirement backlash → keep single-print free + explicit trial banner.
- Data Privacy Act (PH) → publish "attendance never leaves browser; server holds
  only email + plan + opaque vault" statement; keep DTR wording neutral.

---

## 6. File map for future PRs

New:

- `src/lib/entitlements.ts`, `src/lib/billing.ts`
- `src/components/UpgradeDialog.tsx`, `src/components/LoginModal.tsx`
- `supabase/functions/checkout|webhook|me|portal/*`

Edit:

- `src/App.tsx` (entitlement check, `RequirePro`, `doXlsx/doZip/requestPrint`)
- `src/components/PreviewStep.tsx` (gated buttons), `src/components/shell.tsx`
  (plan badge, footer links), `src/components/UploadStep.tsx` (upgrade card)
- `src/lib/storage.ts` (new entitlement key), `src/lib/export.ts` (caps),
  `src/lib/support.ts` (keep tips separate), `vite.config.ts` (SW allowlist)
- `README.md`, `next-steps.md` (docs + acceptance criteria)

Do not touch attendance pipeline (`parser.ts`, `slots.ts`, `rules.ts`,
`schedule.ts`, `bundles.ts` logic) except for caps/limits wiring.
