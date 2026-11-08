# Security and privacy

## Authentication and authorization

- Supabase Auth (email/password, email confirmation, password reset). Sessions live in HTTP-only cookies managed by `@supabase/ssr`; `src/proxy.ts` refreshes them on each request.
- **Every protected page** calls `requireUser()` and **every API route** is wrapped by `authedRoute()`, which verifies the JWT with `auth.getClaims()`. The proxy redirect is a convenience, not the security boundary.
- Data access always uses the user's own Supabase client, so **Row Level Security** applies to every query. The service-role key is used in exactly one place: permanent account deletion, after the caller has been authenticated.
- Post-login redirects accept only same-site relative paths (`lib/auth-redirect.ts`).

## Row Level Security

- RLS is enabled on every user-owned table with `select/insert/update/delete` policies `user_id = (select auth.uid())`.
- Composite foreign keys `(id, user_id)` stop rows from referencing another user's records.
- `ai_usage` is append-only for users (no update/delete policy), so usage limits cannot be reset client-side.
- Anonymous role has no table privileges.
- `tests/integration/rls.test.ts` verifies isolation with two real accounts (cross-user read/update/delete, spoofed inserts, child-row spoofing, storage access).

## Storage

- Single **private** bucket `documents` (10 MB limit, PDF/PNG/JPEG/WebP only). Objects live under `<user_id>/…`; storage policies allow only the owner.
- Uploads are validated server-side by size and **magic bytes** (the declared MIME type is not trusted) and stored under random names.
- Downloads use 60-second signed URLs. Attachments are never sent to the AI or embedded in resumes.

## Request security

- **CSRF:** state-changing API calls require a same-origin `Origin`/`Sec-Fetch-Site`, JSON content type, and SameSite=Lax auth cookies.
- **Validation:** every request body is parsed with Zod on the server (size-capped); database CHECK constraints back it up.
- **XSS:** React escapes UI output; the resume template escapes every value and only emits `http(s)`/`mailto` links; the preview iframe is sandboxed without scripts; Zod rejects `javascript:` URLs at input.
- **Headers:** `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy` (camera only for this origin), HSTS.
- **Errors:** responses carry codes and generic messages; logs record error classes and DB error codes, never request bodies, resumes or documents.
- **Rate limiting:** per-user burst limits on AI, URL fetch, upload and PDF routes; durable daily AI limit in the database.

## SSRF protection (URL intake)

`server/jobs/url-guard.ts` + `fetch-url.ts`:

- only `http`/`https`, default ports, no credentials in the URL;
- blocks `localhost` and internal-looking names (`.local`, `.internal`, single-label hosts…);
- resolves DNS and requires **every** address to be public unicast — rejects loopback, private, link-local (incl. `169.254.169.254` metadata), CGNAT, documentation, benchmarking, multicast, reserved, IPv6 ULA/link-local and IPv4-mapped IPv6;
- re-checks addresses **at connect time** through a custom `lookup` on the undici agent (defeats DNS rebinding);
- follows redirects manually (max 5), validating every hop;
- 10 s timeouts, 2 MB response cap, HTML/text content types only;
- honours `robots.txt`; detects login/bot walls and reports them instead of claiming success; never bypasses access controls.

The PDF renderer blocks all network requests, so resume content cannot make the server fetch anything.

## AI and prompt injection

- AI calls are server-side only; keys never reach the browser.
- Explicit, revocable consent is required before any data is sent to the provider (stored as `ai_consent_at`).
- Untrusted content is isolated in tagged blocks with a data-only policy; the model has no tools; outputs are schema-validated and semantically checked; failures never produce substitute content.
- Data minimisation: recommendations, attachments, date of birth and nationality are never included in prompts.

## Privacy controls

- View/edit/delete any entry; delete resumes and opportunities.
- `GET /api/profile/export` downloads all stored data as JSON.
- `DELETE /api/account` removes storage objects and the auth user; all tables cascade.
- Retention: data is kept until the user deletes it; the app does not keep server-side copies of OCR images.

## Secrets

- `.env*` files are git-ignored (except `.env.example`, which contains placeholders only).
- On Vercel, store `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` (or `ANTHROPIC_API_KEY` when using Anthropic) as sensitive environment variables.
