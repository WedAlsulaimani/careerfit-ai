# CareerFit AI

Bilingual (EN/AR, RTL) AI career platform: Master Career Profile -> job intake -> AI analysis -> evidence-grounded
matching -> truthful tailored resume -> ATS-friendly PDF. Next.js 16 (App Router, Turbopack) + React 19 + TypeScript
strict + Tailwind 4 + Supabase (Postgres/Auth/Storage). Read `AGENTS.md` first: Next 16 differs from older versions;
docs live in `node_modules/next/dist/docs/`.

## Commands (all verified on Windows 11, Node 26, npm 11)
- `npm install` - install dependencies
- `npm run dev` - dev server at http://localhost:3000 (needs `.env.local`, copy from `.env.example`)
- `npm run typecheck` - `next typegen && tsc --noEmit`
- `npm run lint` - ESLint (must report 0 errors and 0 warnings)
- `npm test` - Vitest unit + integration (live-service tests skip without env vars)
- `npx vitest run tests/unit/<file>.test.ts` - a single test file
- `npm run build` - production build
- `npm run verify` - typecheck + lint + test + build; run before every PR
- `npm run test:e2e` - Playwright; use `PW_CHANNEL=msedge` when Chromium is not installed

## Layout
- `src/lib/*` pure, unit-tested domain logic (schemas, evidence, matching, resume, i18n); no I/O.
- `src/server/*` server-only code: AI providers, services, PDF, SSRF-safe URL fetch. `src/app/api/*` thin routes.
- `supabase/migrations/*` the only schema source; `tests/{unit,integration,e2e}` mirror the code.
- `.claude/hooks/secret-guard.mjs` PreToolUse hook that blocks secret leaks (see Security).

## Conventions
- TypeScript strict, no `any`; validate every request body with Zod; reuse schemas from `src/lib/schemas`.
- Every user-visible string goes in BOTH `src/lib/i18n/dictionaries/en.ts` and `ar.ts` (ar must match the en type).
- Use logical CSS (`ms-`, `pe-`, `start-`) so RTL works. API routes use `authedRoute()`; pages call `requireUser()`.
- AI: Gemini is the default provider (`AI_PROVIDER=gemini`); Anthropic is optional. Models write plans, never facts.
- Commits: Conventional Commits (`fix(auth): ...`), small and focused; one concern per branch/PR.

## Security rules (non-negotiable)
- Never commit `.env*` (except `.env.example`), API keys, tokens or passwords; never paste secrets in chat or tests.
- AI/service-role keys are server-side only; never expose them via `NEXT_PUBLIC_*`.
- Never invent resume facts: every claim must trace to a profile record (`src/lib/evidence/validate.ts`).
- Redirect targets must pass `safeNextPath()`. All outbound job-URL fetches go through the SSRF guard.
- No deploys, pushes, force-pushes or remote GitHub setting changes without explicit user approval.

## Definition of Done
1. A test directly covers the change (written failing first for bug fixes).
2. `npm run verify` passes with 0 type errors, 0 lint problems, 0 failing tests, successful build.
3. No secrets or unrelated changes in the diff (`git diff --stat` reviewed); docs/PROGRESS.md updated if behavior changed.
4. Commits are descriptive; the PR states the problem, the change and the test evidence.
