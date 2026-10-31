import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type z } from "zod";
import { createSupabaseServerClient, type SupabaseServerClient } from "@/lib/supabase/server";
import { getSessionUser, type SessionUser } from "@/server/auth";
import { publicSupabaseConfig } from "@/lib/env";

/** Machine-readable error codes; the UI maps them to localized messages. */
export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation"
  | "conflict"
  | "rate_limited"
  | "payload_too_large"
  | "not_configured"
  | "ai_not_configured"
  | "ai_unavailable"
  | "ai_rate_limited"
  | "ai_refused"
  | "ai_invalid_output"
  | "ai_limit_reached"
  | "ai_consent_required"
  | "url_invalid"
  | "url_blocked"
  | "url_robots_disallowed"
  | "url_fetch_failed"
  | "url_not_html"
  | "url_too_large"
  | "url_no_content"
  | "not_a_job_posting"
  | "pdf_unavailable"
  | "pdf_validation_failed"
  | "internal";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message?: string,
    public readonly details?: unknown,
  ) {
    super(message ?? code);
    this.name = "AppError";
  }
}

export const jsonOk = <T>(data: T, init?: ResponseInit) => NextResponse.json(data, init);

function errorResponse(err: unknown) {
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details ?? null } },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "validation",
          message: "Validation failed",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 422 },
    );
  }
  // Never echo internals or user content back; log the error class only.
  console.error("[api] unhandled error:", err instanceof Error ? `${err.name}: ${err.message}` : typeof err);
  return NextResponse.json({ error: { code: "internal", message: "Something went wrong." } }, { status: 500 });
}

export interface ApiContext {
  user: SessionUser;
  supabase: SupabaseServerClient;
}

/**
 * Wraps an authenticated route handler: verifies the session, applies a
 * same-origin check to state-changing requests (CSRF defence in depth on top of
 * SameSite cookies + JSON content type), and converts errors to safe responses.
 */
export function authedRoute<P = Record<string, string>>(
  handler: (req: Request, ctx: ApiContext, params: P) => Promise<Response>,
) {
  return async (req: Request, routeCtx: { params: Promise<P> }) => {
    try {
      if (!publicSupabaseConfig()) throw new AppError(503, "not_configured", "Supabase is not configured.");
      if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      const user = await getSessionUser();
      if (!user) throw new AppError(401, "unauthorized", "Please sign in.");
      const supabase = await createSupabaseServerClient();
      const params = await routeCtx.params;
      return await handler(req, { user, supabase }, params);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new AppError(403, "forbidden", "Cross-site request rejected.");
  }
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new AppError(403, "forbidden", "Invalid origin.");
    }
    if (!host || originHost !== host) throw new AppError(403, "forbidden", "Cross-origin request rejected.");
  }
}

/** Parses a JSON body with a size cap and validates it against a schema. */
export async function readJson<S extends z.ZodType>(req: Request, schema: S, maxBytes = 200_000): Promise<z.infer<S>> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) {
    throw new AppError(415 as number, "validation", "Expected application/json.");
  }
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new AppError(413, "payload_too_large", "Request body is too large.");
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new AppError(400, "validation", "Malformed JSON.");
  }
  return schema.parse(data);
}

/** Throws a typed error for a Supabase/PostgREST failure without leaking details. */
export function dbError(error: { code?: string; message?: string } | null, context: string): never {
  if (error?.code === "PGRST116") throw new AppError(404, "not_found", "Not found.");
  if (error?.code === "23505") throw new AppError(409, "conflict", "Already exists.");
  if (error?.code === "23514" || error?.code === "22P02" || error?.code === "22007") {
    throw new AppError(422, "validation", "Invalid value.");
  }
  console.error(`[db] ${context} failed:`, error?.code ?? "unknown");
  throw new AppError(500, "internal", "Database error.");
}

// ---------------------------------------------------------------------------
// Burst rate limiting (per instance). Durable daily AI limits are enforced
// through the ai_usage table in src/server/ai/usage.ts.
// ---------------------------------------------------------------------------
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    }
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    throw new AppError(429, "rate_limited", "Too many requests. Please wait a moment.", {
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    });
  }
}
