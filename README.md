# CareerFit AI

**One Master Career Profile → many opportunities → many tailored, truthful, ATS-friendly resumes.**

CareerFit AI is a full-stack web application. You enter your background once — education, experience, projects, skills, research, certifications, achievements, languages and anything else — and then, for each job, internship, graduate program or research opportunity, the app:

1. captures the advertisement (URL, screenshot/photo with OCR, QR code, or manual entry),
2. extracts and categorises its requirements (mandatory / preferred / contextual) with an AI model,
3. lets you review, edit and approve that analysis,
4. matches each requirement against **evidence from your own records**,
5. drafts a tailored resume where every generated line cites the record it came from,
6. lets you edit everything in a live editor with undo, versions and per-section regeneration,
7. exports a single-column, text-selectable PDF (English or Arabic, right-to-left), and
8. keeps your resumes and a user-managed application tracker.

> **Truthfulness by design.** Names, organisations, dates, GPAs (on their original scale), scores, links and publication/patent status are copied from your records — the AI never writes them. Generated statements are checked against the records they cite; anything with an untraceable number, skill or certification claim is hidden until you approve it.

Sample output (fictional fixture data): [`docs/samples/sample-en.pdf`](docs/samples/sample-en.pdf) · [`docs/samples/sample-ar.pdf`](docs/samples/sample-ar.pdf)

---

## Features

| Area | What works |
|---|---|
| Landing | Product explanation, workflow, ATS explainer, privacy, FAQ — no invented testimonials or statistics |
| Auth | Email/password sign-up, sign-in, sign-out, email confirmation, password reset, session refresh, server-side route protection |
| Master Career Profile | 13 sections in a resumable onboarding wizard (progress saved server-side), autosave for personal/goals, local drafts for entries, add/edit/duplicate/delete, private attachments (transcripts, certificates, letters) |
| Job intake | URL (SSRF-safe fetch, robots.txt respected, JSON-LD JobPosting + main-content extraction), image OCR in the browser (English + Arabic, low-confidence words highlighted), QR (upload or camera, ZXing), manual entry — all feed one pipeline |
| Analysis | Structured, schema-validated extraction; every requirement keeps its verbatim source quote, which is verified against the source text |
| Matching | Per-requirement strong / partial / missing with cited records; validator removes unknown records, downgrades unsupported matches, requires explicit records for degrees/certifications/language tests; documented heuristic coverage score |
| Resume generation | Evidence-cited plan → resume composed from DB facts; claim validator; section order adapted to the candidate; one- or two-page preference; English or Arabic |
| Editor | Live WYSIWYG preview (same template as the PDF), edit any text, reorder/hide/delete sections and entries, add entries back from the profile, custom sections, per-section AI suggestions shown side-by-side before applying, undo/redo, versions with restore, keyword coverage panel |
| PDF | Headless Chromium → tagged PDF with real text, live links, metadata, clean file name (`Name_Position_Company.pdf`); text layer verified after rendering |
| Library & tracker | Resume list (preview, edit, download, duplicate, delete), opportunity list, statuses Saved → Withdrawn with dates and notes |
| Privacy | Explicit AI consent (revocable), JSON export of all data, permanent account deletion, private storage |
| i18n | Full English and Arabic interface (RTL), browser-language default with manual override |

## Tech stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript (strict) · Tailwind CSS 4 · shadcn/ui-pattern components (CVA + tailwind-merge) · Lucide · React Hook Form + Zod 4 · Supabase (Postgres, Auth, Storage, RLS) · Google Gemini via `@google/genai` (default; JSON-schema structured output) with Anthropic Claude via `@anthropic-ai/sdk` as an optional provider · Tesseract.js (OCR) · ZXing (QR) · Cheerio · undici + ipaddr.js (SSRF guard) · puppeteer-core + @sparticuz/chromium (PDF) · pdf-lib (metadata) · unpdf (PDF text verification) · Vitest · Playwright.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/API.md`](docs/API.md) and [`docs/SECURITY.md`](docs/SECURITY.md).

---

## Local development

### Prerequisites

- Node.js 20.9+ (developed on Node 26) and npm
- A Supabase project (free tier is fine) — or the Supabase CLI with Docker for a local stack
- A Google Gemini API key (free tier available at https://aistudio.google.com/apikey); an Anthropic key is optional
- Chrome, Edge or Chromium installed locally for PDF export (auto-detected; or set `CHROME_EXECUTABLE_PATH`)

### Setup

```bash
npm install
```

```bash
cp .env.example .env.local
```

Fill in `.env.local` (see [Environment variables](#environment-variables)), apply the database migration (next section), then:

```bash
npm run dev
```

Open http://localhost:3000.

### Supabase setup

1. Create a project at https://supabase.com.
2. **Apply the migration** — either paste `supabase/migrations/20261030000000_initial_schema.sql` into the SQL editor and run it, or with the CLI:
   ```bash
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```
   ```bash
   npx supabase db push
   ```
   This creates all tables, constraints, indexes, RLS policies, the new-user trigger and the private `documents` storage bucket with owner-only policies.
3. **Auth → URL configuration:** set *Site URL* to your app URL and add `http://localhost:3000/**` and your production URL to *Redirect URLs*.
4. **Auth → Email:** keep *Confirm email* on for production. The app handles both `/auth/callback` (PKCE code) and `/auth/confirm` (token hash) links.
5. Copy the project URL, anon/publishable key and service-role key into `.env.local`.

### Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | Anon/publishable key (safe in the browser; RLS protects data) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Used only for permanent account deletion |
| `NEXT_PUBLIC_SITE_URL` | server | Public URL (e.g. `https://careerfit.example.com`) |
| `AI_PROVIDER` | server | `gemini` (default) or `anthropic` |
| `GEMINI_API_KEY` | **server only** | Google Gemini key (`GOOGLE_API_KEY` also accepted) |
| `ANTHROPIC_API_KEY` | **server only** | Only when `AI_PROVIDER=anthropic` |
| `AI_MODEL` | server | Optional. Defaults: `gemini-2.5-flash` / `claude-opus-5-5` |
| `AI_EFFORT` | server | Anthropic only: `low` · `medium` (default) · `high` |
| `AI_TIMEOUT_MS`, `AI_MAX_RETRIES` | server | Request timeout (default 120 000) and SDK retries (default 2) |
| `AI_DAILY_LIMIT` | server | AI calls per user per 24 h (default 60) |
| `AI_REFUSAL_FALLBACK` | server | Anthropic only. Server-side refusal fallback is on by default; set `off` to disable (e.g. if you switch to a model that does not support it) |
| `CHROME_EXECUTABLE_PATH` | server (local) | Optional path to Chrome/Edge for PDF export |
| `URL_FETCH_TIMEOUT_MS`, `URL_FETCH_MAX_BYTES` | server | Job-page fetch limits |

Never commit `.env.local`. Only variables prefixed `NEXT_PUBLIC_` reach the browser.

---

## Testing

```bash
npm run verify
```
runs type checking, lint, unit + integration tests and a production build. Individually:

```bash
npm run typecheck
```
```bash
npm run lint
```
```bash
npm test
```
```bash
npm run build
```

**End-to-end (Playwright)** runs against the production build. Use an installed browser via `PW_CHANNEL`, or install Playwright's Chromium first (`npx playwright install chromium`):

```bash
npm run build
```
```bash
PW_CHANNEL=chrome npx playwright test
```
(Windows PowerShell: `$env:PW_CHANNEL="msedge"; npx playwright test`)

**Optional suites that need real services** (they skip themselves otherwise):

| Suite | Enable with |
|---|---|
| `tests/integration/rls.test.ts` — two real users, cross-account read/update/delete/insert, child-row spoofing, append-only ledger, storage isolation | `RLS_TEST_SUPABASE_URL`, `RLS_TEST_SUPABASE_ANON_KEY`, `RLS_TEST_SUPABASE_SERVICE_ROLE_KEY` (use a **development** project) |
| `tests/integration/pdf.test.ts` — real Chromium PDF render, metadata, links, reading order, Arabic extraction | A local Chrome/Edge/Chromium (auto-detected) |
| `tests/e2e/journey.spec.ts` — sign-up → profile → persistence; with `E2E_WITH_AI=1` also manual job → analysis → match → resume → edit → PDF | `E2E_EMAIL`/`E2E_PASSWORD` or `E2E_SIGNUP_EMAIL_DOMAIN`, a configured server |

Automated tests use deterministic fixtures (`tests/fixtures`) and clearly identified fakes for the AI provider and Supabase client; production code never substitutes fabricated AI output.

---

## Deploying (GitHub → Vercel → Supabase)

1. Push this folder to a new GitHub repository (it contains no secrets; `.env*` files are ignored except `.env.example`).
2. In Vercel, **Import Project** from GitHub. Framework preset: Next.js. No build settings need changing.
3. Add the environment variables from the table above in *Project Settings → Environment Variables* (mark `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` as sensitive; do **not** set `CHROME_EXECUTABLE_PATH` — on Vercel the app uses `@sparticuz/chromium`).
4. Deploy, then add the production URL to Supabase *Auth → URL configuration* and set `NEXT_PUBLIC_SITE_URL`.
5. Recommended: Vercel Fluid compute (default) so the PDF function has enough memory (Chromium needs ~1 GB); AI routes declare `maxDuration` up to 180 s.

## Limitations

- **JavaScript-only or login-protected job pages** cannot be read from a URL; the app says so and offers paste/screenshot instead. It never bypasses logins, paywalls, CAPTCHAs or bot protection, and it honours robots.txt.
- **OCR** quality depends on the image; Tesseract runs in the browser and downloads its language data (~10 MB for English + Arabic) from a CDN on first use. Low-confidence words are highlighted rather than guessed.
- **Arabic PDF text layer:** Arabic resumes use the Amiri font because its glyphs map back to real Arabic letters in logical order (Noto Sans Arabic extracted as garbage in Chromium PDFs — see ARCHITECTURE.md). A few Amiri ligatures still extract imperfectly; each PDF is verified (≥ 80 % token recovery for Arabic, ≥ 90 % for English) and refused otherwise.
- **Rate limiting:** burst limits are in-memory per server instance; durable daily AI limits are enforced in the database.
- **ATS behaviour varies by vendor.** The template follows widely accepted ATS-friendly practices but cannot guarantee how a specific system parses or ranks a resume. The match score is an internal heuristic, not an ATS score or hiring prediction.
- **DOCX export** is not implemented yet (the export layer is HTML-template based so a DOCX renderer can be added).
- Google OAuth is not enabled (email/password only).

## Planned improvements

DOCX export · Google OAuth · optional JS-rendering fetcher with per-request SSRF checks · additional resume layouts · cover-letter drafts grounded in the same evidence · Redis/Upstash-backed rate limiting · pgTAP tests in CI with the Supabase CLI.

## License

No license file is included yet — choose one before publishing. **MIT** is a good default for an open-source portfolio project; choose a proprietary license if you plan to commercialise it. Bundled fonts are under the SIL Open Font License (`public/fonts/OFL-*.txt`).
