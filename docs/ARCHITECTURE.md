# Architecture

## Overview

```
Browser (React 19, client components)
  │  JSON over same-origin fetch (CSRF: Origin/Sec-Fetch-Site check + JSON content type + SameSite cookies)
  ▼
Next.js App Router (Node.js runtime)
  ├─ src/proxy.ts ............ refreshes the Supabase session cookie; fast redirect for signed-out visits
  ├─ app/(app)/* ............. server components; every page calls requireUser() (server-side authorization)
  ├─ app/api/* ............... route handlers wrapped by authedRoute() (auth, origin check, safe errors)
  ├─ server/services/* ....... business logic (opportunities, resumes)
  ├─ server/profile/* ........ repository for the Master Career Profile
  ├─ server/ai/* ............. provider abstraction, prompts, model-facing schemas, usage/consent gate
  ├─ server/jobs/* ........... SSRF-safe URL fetcher + guard
  └─ server/pdf/* ............ Chromium PDF renderer + text-layer verification
  │
  ├─ lib/* (isomorphic, unit-tested): schemas, section registry, evidence catalog,
  │        claim validator, matching validator + score, resume composer, ATS template, i18n
  ▼
Supabase: Postgres (RLS on every user table) · Auth · private Storage bucket
AI provider API, server-side only: Google Gemini (default) or Anthropic Claude (`AI_PROVIDER=anthropic`)
```

### Layers

| Layer | Responsibility | Examples |
|---|---|---|
| Presentation | Pages and client components; no business rules | `app/(app)/**/page.tsx`, `components/**` |
| API contracts | Zod schemas shared by client and server | `lib/schemas/*` |
| Services | Orchestrate repositories, AI and validation | `server/services/opportunities.ts`, `server/services/resumes.ts` |
| Repositories | Supabase queries, always as the signed-in user | `server/profile/repository.ts` |
| Domain logic (pure) | Deterministic, testable functions | `lib/evidence/*`, `lib/matching/*`, `lib/resume/*`, `lib/jobs/*` |
| Infrastructure | AI provider, PDF, URL fetch | `server/ai/*`, `server/pdf/*`, `server/jobs/*` |

## Data model

See `supabase/migrations/20261030000000_initial_schema.sql`.

- **Profile singletons:** `profiles` (contact + flags: onboarding step, AI consent, sensitive-field opt-ins) and `career_goals`.
- **Profile sections:** `education`, `experiences` (one table with a `kind` discriminator for full-time, part-time, internship, freelance, research/teaching assistantship, volunteer, club leadership, student organisation, community service, other), `projects`, `skills` (`kind` technical/soft), `publications` (status preserved verbatim), `certifications` (includes language tests and exams), `achievements` (patent application vs granted preserved), `recommendations` (private), `languages`, `additional_records`, `attachments`.
- **Opportunities:** `job_opportunities` → `job_sources` (raw text + extraction diagnostics) → `job_analyses` (versioned, immutable snapshots; `approved_at`) → `match_assessments`.
- **Resumes:** `resumes` (current document) + `resume_versions` (every save, regeneration and restore).
- **Tracker:** `applications` (one per opportunity, user-managed status).
- **Usage:** `ai_usage` (append-only ledger used for daily limits).

**Integrity:** child tables reference parents through composite foreign keys `(id, user_id)`, so a row can never point at another user's parent even with a known UUID. CHECK constraints mirror the Zod enums.

**JSONB is used only where it helps:** job analyses, match results and resume documents are schema-validated snapshots that are versioned and edited as whole documents; extraction diagnostics are schemaless. All profile data is relational.

## Section registry

`lib/profile/sections.ts` declares every repeatable section once: table, Zod schema, form fields (type, options, conditional visibility), list labels, ordering and wizard step. The same definition drives the onboarding wizard, the profile editor, the generic CRUD API (server-side validation), and the evidence catalog.

## AI pipeline

All calls go through `runStructured()` (`server/ai/index.ts`), which:

1. requires recorded AI consent (`profiles.ai_consent_at`),
2. enforces the per-user daily limit from `ai_usage`,
3. calls the provider (`AIProvider` interface — `GeminiProvider` by default, `AnthropicProvider` when `AI_PROVIDER=anthropic`) with a Zod schema (Gemini `responseJsonSchema` plus Zod re-validation; Anthropic structured outputs),
4. records usage (success or failure),
5. maps failures to typed errors (`ai_unavailable`, `ai_refused`, …) — **never** to fabricated output.

| Service | Input | Output validation |
|---|---|---|
| Job analysis | Source text in an untrusted block | `aiJobAnalysisSchema` → `normalizeJobAnalysis()` assigns ids, verifies every `source_quote` against the source text, drops non-date deadlines, clamps to the strict `jobAnalysisSchema` |
| Evidence retrieval | Profile snapshot | `buildEvidenceCatalog()` produces `table:uuid` records with full factual text (deterministic) |
| Matching | Approved requirements + catalog | `validateMatch()` removes unknown ids, downgrades unsupported matches, requires explicit records for certification/education/language requirements, recomputes keyword support from the records, computes the heuristic |
| Resume generation | Analysis + match + catalog | The model returns only a *plan* (which records, which section, bullet text with evidence ids, skill grouping by id). `composeResume()` copies facts from the DB, enforces allowed sections per record kind, and runs `checkClaim()` on every bullet |
| Section refinement | One section + its records | Same validator; returned as a suggestion, applied only by the user |

### Anti-hallucination rules (`lib/evidence/validate.ts`)

A generated statement is:
- **rejected** if none of its cited ids exist;
- **flagged and hidden** (`needs_review`, `visible: false`) if it contains a number not present in the cited records, a job keyword or known skill not present in the cited records, or a certification/licence claim without a certification record.

Users see each flag and can approve, edit or delete the statement.

### Prompt-injection containment

Third-party text is wrapped in `<job_posting>` tags (closing tags inside the content are neutralised) and the system prompt declares it data-only. The AI has no tools and cannot trigger actions; outputs are parsed into schemas and validated; private records (recommendations, attachments, DOB, nationality) are never sent.

### Model configuration

`AI_PROVIDER` (default `gemini`), `AI_MODEL` (default `gemini-2.5-flash`; `claude-opus-5-5` when Anthropic is selected), timeout and retries come from the environment. `AI_EFFORT` applies to Anthropic only. Gemini requests use `@google/genai` with `responseJsonSchema`. Anthropic requests use the official SDK's `beta.messages.parse` with `betaZodOutputFormat` and the server-side refusal fallback (`server-side-fallback-2026-07-01`, `fallbacks: "default"`; disable with `AI_REFUSAL_FALLBACK=off`).

## PDF generation

`renderResumeHtml()` (`lib/resume/template.ts`) produces a self-contained HTML document: single column, standard headings, real text, no tables/images/icons, every value HTML-escaped, only http(s)/mailto links. The editor preview renders exactly this HTML in a sandboxed iframe.

`renderResumePdf()` loads it into headless Chromium (local Chrome/Edge or `@sparticuz/chromium` on Vercel) with **all network requests blocked** (fonts are inlined as data URLs), prints a tagged A4 PDF, sets metadata with pdf-lib, then **extracts the text layer with unpdf and compares it with the resume text**. If too little text is recoverable the PDF is not delivered (`pdf_validation_failed`).

### Arabic: why Amiri

Chromium builds the PDF ToUnicode map by reverse-mapping glyphs. Fonts that compose letters from dotless base glyphs plus dot marks (Noto Sans Arabic, Noto Naskh Arabic) leave those base glyphs unmapped — extraction returned `\u0000` and wrong letters (3 % token recovery). Fonts that map to presentation forms (IBM Plex Sans Arabic, Cairo, Tajawal) extracted in reversed visual order (~6 %). **Amiri** extracted real Arabic letters in logical order (~88 % on an Arabic-only stress sentence; the full sample Arabic resume in `docs/samples` passes the verification gate). The remaining gaps are a few ligatures (e.g. lam-khah) and occasional word splits; the verification threshold for Arabic is 80 %. The comparison was measured with the same pipeline the app uses.

### Export extensibility

Export is a function of `ResumeDocument`. A DOCX exporter can be added beside `server/pdf/render.ts` (e.g. with the `docx` package) reading the same document model; no other layer changes.

## Localisation

`lib/i18n`: typed dictionaries (`ar` must satisfy the `en` type — a unit test also checks key parity), locale from the `cf_locale` cookie or `Accept-Language`, `<html lang dir>` set server-side. Layout uses logical CSS properties (`ms-`, `pe-`, `start-`…) so RTL mirrors correctly; direction-dependent icons are flipped with `rtl:` variants.

## Key decisions

| Decision | Reason |
|---|---|
| Cache Components disabled | Nearly every page is per-user and must read the session; dynamic rendering keeps authorization simple and explicit |
| Route handlers (not server actions) for mutations | Typed JSON contracts reused by tests and clients; explicit origin checks |
| OCR and QR decoding in the browser | Images never leave the device; no server CPU or file handling needed for intake |
| AI writes plans, not documents | Facts cannot be invented because they are never generated |
| Optimistic concurrency on resume saves (`baseVersion`) | Prevents silent overwrites from another tab |
