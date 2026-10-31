import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { aiConfig } from "@/lib/env";
import { AIError, type AIProvider, type StructuredRequest, type StructuredResult } from "./provider";

/**
 * Claude provider using the official SDK with structured outputs
 * (`output_config.format`). The SDK validates the response against the Zod
 * schema; callers still run their own semantic validation afterwards.
 */
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new AIError("not_configured", "ANTHROPIC_API_KEY is not set.");
    }
    if (!this.client) {
      const cfg = aiConfig();
      this.client = new Anthropic({ timeout: cfg.timeoutMs, maxRetries: cfg.maxRetries });
    }
    return this.client;
  }

  async generateStructured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<StructuredResult<z.infer<S>>> {
    const client = this.getClient();
    const cfg = aiConfig();
    const useFallback = process.env.AI_REFUSAL_FALLBACK !== "off";

    let response;
    try {
      response = await client.beta.messages.parse({
        model: cfg.model,
        max_tokens: req.maxTokens ?? 16000,
        system: req.system,
        messages: [{ role: "user", content: req.input }],
        output_config: { format: betaZodOutputFormat(req.schema), effort: cfg.effort },
        // Server-side refusal fallback: a policy decline is retried on a
        // fallback model inside the same call instead of failing outright.
        ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      });
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        throw new AIError("not_configured", "The AI provider rejected the configured credentials.");
      }
      if (err instanceof Anthropic.RateLimitError) {
        throw new AIError("rate_limited", "The AI provider is rate limiting requests.");
      }
      if (err instanceof Anthropic.BadRequestError || err instanceof Anthropic.NotFoundError) {
        throw new AIError("unavailable", `The AI request was rejected (${err.status}).`);
      }
      if (err instanceof Anthropic.APIConnectionError || err instanceof Anthropic.APIError) {
        throw new AIError("unavailable", "The AI provider is currently unavailable.");
      }
      // Structured-output parse failures surface as generic errors from the helper.
      throw new AIError("invalid_output", "The AI response could not be parsed.");
    }

    if (response.stop_reason === "refusal") {
      throw new AIError("refused", "The AI declined to process this request.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new AIError("invalid_output", "The AI response was truncated.");
    }
    if (response.parsed_output === null || response.parsed_output === undefined) {
      throw new AIError("invalid_output", "The AI response did not match the expected structure.");
    }

    return {
      data: response.parsed_output as z.infer<S>,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens ?? 0,
        outputTokens: response.usage.output_tokens ?? 0,
      },
    };
  }
}
