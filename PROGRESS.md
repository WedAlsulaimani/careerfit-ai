# PROGRESS — CareerFit AI

_Last updated: 2026-10-31_

## Update 2026-10-31 — Gemini provider
- Added `server/ai/gemini.ts` (official `@google/genai`; `responseJsonSchema` from the same Zod schemas, Zod re-validation, one repair retry, controlled transient retries, safety/blocked/truncated mapping to typed errors). Gemini is the default (`AI_PROVIDER=gemini`, model `gemini-2.5-flash`); Anthropic remains selectable. Keys are server-only; analysis, matching, validators and resume generation are unchanged. Free-tier Gemini quotas are rate-limited and may use submitted data for product improvement per Google's terms — check them before using real personal data.
- Tests: `tests/unit/gemini-provider.test.ts` (mocked SDK; no live Gemini call has been made).

## Completed

- **Foundation:** Next.js 16.4 App Router + TypeScript strict + Tailwind 4, shadcn-pattern UI kit, ESLint, Vitest, Playwright, env template, security headers.
- **Database:** single migration with all tables, composite ownership FKs, CHECK constraints, indexes, `updated_at` triggers, RLS on every user table, append-only AI ledger, new-user trigger, private `documents` bucket + owner-only storage policies.
- **Auth:** sign-up (with confirmation), sign-in, sign-out, forgot/reset password, `/auth/callback` + `/auth/confirm`, session refresh proxy, server-side `requireUser()` on all app pages, `authedRoute()` on all APIs; new users → onboarding, returning users → dashboard.
- **Master Career Profile:** all 13 sections via a declarative registry; onboarding wizard (progress persisted, skip/back/next, save-and-finish-later, review step); full profile editor; autosave (personal/goals); local drafts (entries); add/edit/duplicate/delete; conditional fields; private attachments with magic-byte validation and signed URLs; profile overview + completion indicator.
- **Job intake:** URL (SSRF guard incl. connect-time DNS check, redirects, robots.txt, block/JS detection with fallbacks), image OCR (Tesseract in browser, EN+AR, confidence highlighting, editable), QR (upload + camera via ZXing, payload classification, URL → safe fetch), manual entry.
- **AI:** provider abstraction, Anthropic structured outputs, consent gate, daily limits, usage ledger, typed failures, refusal fallback; job analysis with quote verification; evidence catalog; matching validator + documented heuristic; resume plan → DB-fact composer + claim validator; per-section suggestions.
- **Resume editor:** live preview (same HTML as PDF), all fields editable, reorder/hide/delete, add from profile, custom sections, undo/redo, versioning with optimistic concurrency + restore, keyword coverage, flagged-claim review.
- **PDF:** Chromium (local or `@sparticuz/chromium`), tagged PDF, metadata, links, file naming, text-layer verification; Arabic via Amiri (investigated and documented).
- **Library & tracker:** resumes list/preview/download/duplicate/delete, opportunities list, application statuses with dates/notes, dashboard.
- **Privacy:** consent + withdrawal, JSON export, permanent account deletion, retention notice.
- **i18n:** complete English + Arabic dictionaries, RTL, browser default + manual switch.
- **Docs:** README, ARCHITECTURE, SECURITY, API, sample PDFs.

## Test results (executed 2026-10-30 on Windows 11, Node 26.13)

| Check | Result |
|---|---|
| `tsc --noEmit` | ✅ 0 errors |
| `eslint` | ✅ 0 errors, 0 warnings |
| Vitest unit + integration | ✅ 85 passed, 9 skipped (7 RLS tests need a Supabase project; 1 "no browser" fallback; 1 sample-PDF writer that runs only with `SAMPLE_PDF_DIR`) |
| PDF integration (Edge 'msedge') | ✅ English + Arabic render, metadata, links, reading order, extraction |
| `next build` | ✅ 48 routes + proxy |
| Playwright E2E (Edge, desktop + mobile) | ✅ 28 passed, 4 skipped (authenticated journey needs Supabase credentials) |

Scenario coverage: 6–13, 15–16, 19–22 automated with fixtures/fakes; 1–5, 14, 17 automated in `tests/e2e/journey.spec.ts` (needs credentials); 18 automated in `tests/integration/rls.test.ts` (needs credentials).

## Not yet verified against live services

- Real Supabase project (auth emails, RLS suite, storage) — no credentials were available in this session.
- Real Anthropic calls (analysis/matching/generation quality) — no API key was available; the pipeline is covered by deterministic fixtures and fakes only.
- Vercel deployment with `@sparticuz/chromium`.

## Known issues / limitations

- Arabic PDF text extraction is good but not perfect (a few Amiri ligatures); verification threshold 80 % for Arabic.
- In-memory burst rate limiting is per instance.
- JS-only / login-protected job pages fall back to paste or screenshot.
- DOCX export and Google OAuth not implemented.

## Deployment blockers

1. Supabase project credentials (URL, anon key, service-role key) and migration applied.
2. `GEMINI_API_KEY` (or `ANTHROPIC_API_KEY` with `AI_PROVIDER=anthropic`).
3. GitHub repository + Vercel project (requires the account owner).

## Exact next step

Create a Supabase dev project, apply `supabase/migrations/20261030000000_initial_schema.sql`, fill `.env.local`, then run:
`RLS_TEST_SUPABASE_URL=… RLS_TEST_SUPABASE_ANON_KEY=… RLS_TEST_SUPABASE_SERVICE_ROLE_KEY=… npm test` and the E2E journey with `E2E_WITH_AI=1`, and review real AI output quality on 3–5 real job ads.
