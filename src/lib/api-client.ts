"use client";

import type { Dictionary } from "@/lib/i18n/dictionaries/en";

/** Typed error returned by the app's JSON API. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: init.signal,
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string; details?: unknown } } | null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code ?? "internal", data?.error?.message ?? res.statusText, data?.error?.details ?? null);
  }
  return data as T;
}

/** Localised message for an API error code. */
export function errorMessage(err: unknown, t: Dictionary): string {
  if (err instanceof ApiError) {
    const msg = (t.errors as Record<string, string>)[err.code];
    return msg ?? t.common.errorGeneric;
  }
  return t.common.errorGeneric;
}

/** Field-level errors from a 422 validation response, localised where possible. */
export function fieldErrors(err: unknown, t: Dictionary): Record<string, string> {
  if (!(err instanceof ApiError) || err.code !== "validation" || !Array.isArray(err.details)) return {};
  const out: Record<string, string> = {};
  for (const d of err.details as { path: string; message: string }[]) {
    const key = d.path.split(".")[0];
    out[key] = (t.errors as Record<string, string>)[d.message] ?? t.errors.validation;
  }
  return out;
}
