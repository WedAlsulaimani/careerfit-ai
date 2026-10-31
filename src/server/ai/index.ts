import "server-only";
import type { z } from "zod";
import { aiConfig } from "@/lib/env";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { AppError } from "@/server/http";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { AIError, type AIProvider, type StructuredRequest, type StructuredResult } from "./provider";

let provider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (provider) return provider;
  const { provider: name } = aiConfig();
  switch (name) {
    case "gemini":
      provider = new GeminiProvider();
      return provider;
    case "anthropic":
      provider = new AnthropicProvider();
      return provider;
    default:
      throw new AIError("not_configured", `Unsupported AI_PROVIDER "${String(name)}".`);
  }
}

/** Test seam: replace the provider with a deterministic fixture. */
export function setAIProviderForTests(p: AIProvider | null) {
  provider = p;
}

interface RunContext {
  supabase: SupabaseServerClient;
  userId: string;
}

/**
 * Runs a structured AI request on behalf of a user:
 *  1. requires recorded consent to send data to the AI provider,
 *  2. enforces the durable daily usage limit,
 *  3. records usage (success or failure) in the append-only ledger,
 *  4. maps provider failures to safe HTTP errors — never to fabricated output.
 */
export async function runStructured<S extends z.ZodType>(
  ctx: RunContext,
  req: StructuredRequest<S>,
): Promise<StructuredResult<z.infer<S>>> {
  const { data: profile } = await ctx.supabase
    .from("profiles")
    .select("ai_consent_at")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!profile?.ai_consent_at) {
    throw new AppError(403, "ai_consent_required", "AI processing requires your consent.");
  }

  const { dailyLimit } = aiConfig();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await ctx.supabase
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ctx.userId)
    .gte("created_at", since);
  if (countError) throw new AppError(500, "internal", "Could not verify usage limits.");
  if ((count ?? 0) >= dailyLimit) {
    throw new AppError(429, "ai_limit_reached", "Daily AI usage limit reached. Try again tomorrow.");
  }

  try {
    const result = await getAIProvider().generateStructured(req);
    await ctx.supabase.from("ai_usage").insert({
      user_id: ctx.userId,
      operation: req.operation,
      model: result.model,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      succeeded: true,
    });
    return result;
  } catch (err) {
    if (err instanceof AIError) {
      await ctx.supabase.from("ai_usage").insert({
        user_id: ctx.userId,
        operation: req.operation,
        model: aiConfig().model,
        succeeded: false,
      });
      switch (err.kind) {
        case "not_configured":
          throw new AppError(503, "ai_not_configured", "AI features are not configured on this server.");
        case "rate_limited":
          throw new AppError(503, "ai_rate_limited", "The AI service is busy. Please retry shortly.");
        case "refused":
          throw new AppError(422, "ai_refused", "The AI declined to process this content.");
        case "invalid_output":
          throw new AppError(502, "ai_invalid_output", "The AI returned an unusable response. Please retry.");
        default:
          throw new AppError(503, "ai_unavailable", "The AI service is unavailable. Please retry later.");
      }
    }
    throw err;
  }
}
