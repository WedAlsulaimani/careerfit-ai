/**
 * Environment access. Values are read lazily so that a missing optional
 * integration (e.g. the AI key) degrades that feature with a clear message
 * instead of breaking the whole build.
 */
export function publicSupabaseConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function requireSupabaseConfig(): { url: string; anonKey: string } {
  const cfg = publicSupabaseConfig();
  if (!cfg) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example).",
    );
  }
  return cfg;
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

const intEnv = (name: string, fallback: number) => {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function aiConfig() {
  const effort = process.env.AI_EFFORT;
  // Gemini is the default; Anthropic remains available with AI_PROVIDER=anthropic.
  const provider = (process.env.AI_PROVIDER === "anthropic" ? "anthropic" : "gemini") as "gemini" | "anthropic";
  return {
    provider,
    model: process.env.AI_MODEL || (provider === "anthropic" ? "claude-opus-5-5" : "gemini-2.5-flash"),
    effort: (effort === "low" || effort === "high" ? effort : "medium") as "low" | "medium" | "high",
    timeoutMs: intEnv("AI_TIMEOUT_MS", 120_000),
    maxRetries: Math.min(intEnv("AI_MAX_RETRIES", 2), 5),
    dailyLimit: intEnv("AI_DAILY_LIMIT", 60),
  };
}

export function urlFetchConfig() {
  return {
    timeoutMs: intEnv("URL_FETCH_TIMEOUT_MS", 10_000),
    maxBytes: intEnv("URL_FETCH_MAX_BYTES", 2_000_000),
  };
}
