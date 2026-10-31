# API reference

All endpoints are same-origin JSON route handlers under `/api`. Every endpoint except `/api/locale` requires a signed-in session (cookie). State-changing requests must send `content-type: application/json` (uploads: multipart) from the same origin.

Errors have the shape:

```json
{ "error": { "code": "validation", "message": "Validation failed", "details": [{ "path": "end_date", "message": "end_before_start" }] } }
```

Common codes: `unauthorized` 401 · `forbidden` 403 · `not_found` 404 · `conflict` 409 · `validation` 422 · `rate_limited` 429 · `ai_consent_required` 403 · `ai_limit_reached` 429 · `ai_not_configured`/`ai_unavailable`/`ai_rate_limited` 503 · `ai_refused` 422 · `ai_invalid_output` 502 · `url_*` 422 · `pdf_unavailable` 503 · `pdf_validation_failed` 500.

## Profile

| Method | Path | Body / notes |
|---|---|---|
| GET/PUT | `/api/profile/personal` | `personalSchema` |
| GET/PUT | `/api/profile/goals` | `goalsSchema` |
| GET/POST | `/api/profile/sections/{section}` | section ∈ `education, experiences, projects, technical_skills, soft_skills, publications, certifications, achievements, recommendations, languages, additional_records`; body validated by the section schema |
| PATCH/DELETE | `/api/profile/sections/{section}/{id}` | |
| POST | `/api/profile/sections/{section}/{id}/duplicate` | |
| PUT | `/api/profile/sections/{section}/{id}/attachment` | `{ attachmentId: uuid \| null }` (education, certifications, recommendations) |
| POST | `/api/profile/flags` | `{ onboarding_step?, onboarding_complete?, ai_consent?, preferred_locale? }` |
| GET | `/api/profile/export` | JSON download of all user data |
| GET/POST | `/api/attachments` | POST multipart `file`, `purpose`; PDF/PNG/JPEG/WebP ≤ 10 MB |
| GET/DELETE | `/api/attachments/{id}` | GET redirects to a 60 s signed URL |

## Opportunities

| Method | Path | Body / notes |
|---|---|---|
| GET/POST | `/api/opportunities` | POST = manual entry (`manualJobSchema`) |
| POST | `/api/opportunities/url` | `{ url, via: "url" \| "qr" }` — SSRF-safe fetch + extraction |
| POST | `/api/opportunities/text` | `{ source_type: "image" \| "qr", text, meta }` — reviewed OCR/QR text |
| GET/DELETE | `/api/opportunities/{id}` | GET returns opportunity, latest source, analysis, match, application |
| POST | `/api/opportunities/{id}/analyze` | AI requirement analysis → new analysis version |
| PUT | `/api/opportunities/{id}/analysis` | `{ analysis: JobAnalysis, approve: boolean }` — user-reviewed version |
| POST | `/api/opportunities/{id}/match` | Requires an approved analysis |

## Resumes

| Method | Path | Body / notes |
|---|---|---|
| GET/POST | `/api/resumes` | POST `{ opportunityId, language: "en"\|"ar", length: "one_page"\|"two_pages", layout: "classic"\|"compact" }` |
| GET/PUT/DELETE | `/api/resumes/{id}` | PUT `{ title, content: ResumeDocument, baseVersion }` → 409 if `baseVersion` is stale |
| POST | `/api/resumes/{id}/duplicate` | |
| GET/POST | `/api/resumes/{id}/versions` | POST `{ version }` restores by saving a new version |
| POST | `/api/resumes/{id}/regenerate-section` | `{ sectionId, content }` → suggestion only (nothing saved) |
| GET | `/api/resumes/{id}/pdf` | `application/pdf`, `Name_Position_Company.pdf` |

## Applications and account

| Method | Path | Body / notes |
|---|---|---|
| GET | `/api/applications` | |
| PUT/DELETE | `/api/applications/{opportunityId}` | `{ status, applied_on, notes, resume_id? }` |
| DELETE | `/api/account` | `{ confirm: "DELETE" }` — permanent |
| POST | `/api/locale` | `{ locale: "en" \| "ar" }` (no auth) |

## AI integration

- Provider interface: `server/ai/provider.ts`. Implementations: `server/ai/gemini.ts` (default; official `@google/genai`, `responseJsonSchema`) and `server/ai/anthropic.ts` (`@anthropic-ai/sdk`).
- Adding a provider: implement `AIProvider`, add a case in `getAIProvider()`, select it with `AI_PROVIDER`.
- Prompts: `server/ai/prompts.ts`. Model-facing schemas: `server/ai/schemas.ts`. Application schemas: `lib/schemas/*`.
- Operations recorded in `ai_usage.operation`: `job_analysis`, `matching`, `resume_generation`, `section_rewrite`.
