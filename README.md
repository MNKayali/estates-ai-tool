# Projento

*Plan · Analyse · Report.* Formerly "Estates AI". The repository, package, Vercel project, cookies and storage keys keep the old `estates-ai-tool` / `estate_*` / `estatesAI_*` names on purpose; see CLAUDE.md "Brand".

A web app that produces **UK RIBA Stage 0–1 feasibility reports** for capital works projects. A user answers a structured questionnaire; the app returns a costed, programmed feasibility report as fixed A4 pages — on screen, as a PDF and as a Word document.

Built with **Next.js 16** (App Router), hosted on **Vercel**, with **Vercel KV** (Upstash Redis) for accounts, reports and rate limits.

## How it works

> **Core principle: the AI never calculates a number.** Every cost, duration and total is computed in code from the reference workbooks. The AI writes prose around those figures, and a guard rejects any text that contains a figure it was not given.

Report generation is split into two requests, so a slow AI call can never lose a report:

1. **Phase 1 — `/api/generate-report`** (deterministic, about a second): `lib/pipeline.js` runs the cost engine (`lib/costCalculator.js`), the programme engine (`lib/programmeCalculator.js`), the cost again with the programme length, the sense check and confidence grade (`lib/senseCheck.js`), and a final cost pass with the confidence-linked range. The record is saved to KV with `status: 'deterministic'`.
2. **Phase 2 — `/api/reports/[id]/prose`** (AI): two Claude calls write the narrative and the risk register. `/report/[id]` calls this route until the report is complete; each call gets a fresh 60 s, finished halves are kept, and per-half locks stop two tabs paying twice.

The PDF (`/api/report-pdf/[id]`, headless Chromium) and the Word file (`/api/reports/[id]/docx`) are built on download from the saved record.

### Reference data

Costs and durations come from two Excel workbooks fetched at runtime (`RATES_FILE_URL`, `PROGRAMME_FILE_URL`) and cached for 10 minutes. The NRM1 workbook holds every scope item, rule, rate, ratio and percentage; a new upload is checked before use and a failing one is rejected while the last good version stays in service (`/api/rates-check` reports which). Changing a rate or duration means editing the workbook, not the code.

## Accounts and the free trial

- A visitor can generate **3 reports** without an account (a signed trial cookie; counts in KV). Downloads need a free account.
- Sign-up is public (email + password); reports made on the trial move into the account on sign-up or sign-in. Signed-in users see their reports at `/reports`, kept until they delete them.
- The admin area (`/admin`, `ADMIN_CODE`) manages users, reset links, usage and workbook health.

## Getting started

```bash
npm install
node scripts/dev-open.mjs   # dev server with sign-in switched off (quickest way to check the report)
node scripts/dev-kv.mjs     # dev server gated like production, on an in-memory KV (sign-up, trial, ownership)
npm run dev                 # plain dev server — needs real KV and an account
```

`scripts/dev-open.mjs` defaults `RATES_FILE_URL` to the committed workbook. Report text needs `AI_API_KEY`.

### Other commands

```bash
npm run build    # production build — run before pushing
npm test         # Vitest (lib/__tests__/)
npm run lint     # eslint
```

## Environment variables

| Variable | Purpose |
|---|---|
| `AI_API_KEY` | Anthropic API key for the report text and scope suggestions |
| `RATES_FILE_URL` | NRM1 v5.x rates workbook (URL, or a local path in development) |
| `PROGRAMME_FILE_URL` | Programme durations workbook |
| `COOKIE_SECRET` | **Required in production.** Signs the session, trial and admin cookies |
| `ADMIN_CODE` | **Required in production.** Admin-area code |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Vercel KV — accounts, reports, trial counts, rate limits |
| `APP_ORIGIN` | Origin used in set-password links (`https://www.projento.co.uk`) |
| `RESEND_API_KEY` / `EMAIL_FROM` | Optional: email invitation and reset links |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional: error reporting |

Never commit a secret. Keep them in `.env.local` (local) or the Vercel project settings.

## Project layout

```
app/
  questionnaire/         Multi-step form and the scope picker
  report/[id]/           The report page (drives Phase 2)
  report/doc/            One component per A4 page kind
  reports/               My reports
  admin/                 Admin dashboard
  api/
    generate-report/     Phase 1
    reports/[id]/        Record, status, prose (Phase 2), Word download, delete
    report-pdf/[id]/     PDF download
    compare/             Scenario comparison (deterministic)
    suggest-scope/       Scope suggestion from the objective
    auth/, admin/        Accounts and the admin area
lib/
  nrmWorkbook.js         NRM1 workbook loader and checks
  scopeEngine.js         Scope rules, shared by the questionnaire and the cost engine
  costCalculator.js      Cost engine
  programmeCalculator.js Programme engine
  senseCheck.js          Warnings, budget verdict
  prose.js               AI prompts, validation and guards
  reportContent.js       Everything the report derives (rounding, pages, risks)
  docx/, reportBuilder.js  Word output
  kv.js, auth.js, users.js, trial.js, session.js  Storage and access
proxy.ts                 First-line access gate (Next 16's middleware)
```

For the full architecture, conventions and history, see **CLAUDE.md**.
