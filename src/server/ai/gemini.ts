import "server-only";
import { ApiError, FinishReason, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { aiConfig } from "@/lib/env";
import { AIError, type AIProvider, type StructuredRequest, type StructuredResult } from "./provider";

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Google Gemini provider using the official `@google/genai` SDK.
 * Structured output: `responseMimeType: application/json` + `responseJsonSchema`
 * generated from the same Zod schema, then re-validated with Zod here.
 */
export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  private client: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new AIError("not_configured", "GEMINI_API_KEY is not set.");
    if (!this.client) this.client = new GoogleGenAI({ apiKey, httpOptions: { timeout: aiConfig().timeoutMs } });
    return this.client;
  }

  async generateStructured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<StructuredResult<z.infer<S>>> {
    const client = this.getClient();
    const cfg = aiConfig();
    const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(req.schema, { target: "draft-7" }) as Record<string, unknown>;
    void _ignored;

    let lastInvalid = false;
    // One attempt plus controlled retries for transient errors; one extra attempt
    // if the model returned JSON that fails our schema.
    for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
      try {
        const response = await client.models.generateContent({
          model: cfg.model,
          contents: req.input,
          config: {
            systemInstruction: req.system,
            responseMimeType: "application/json",
            responseJsonSchema: jsonSchema,
            maxOutputTokens: req.maxTokens ?? 16000,
            temperature: 0.2,
          },
        });

        if (response.promptFeedback?.blockReason) throw new AIError("refused", "The AI declined to process this request.");
        const candidate = response.candidates?.[0];
        const finish = candidate?.finishReason;
        if (finish === FinishReason.MAX_TOKENS) throw new AIError("invalid_output", "The AI response was truncated.");
        if (
          finish === FinishReason.SAFETY ||
          finish === FinishReason.PROHIBITED_CONTENT ||
          finish === FinishReason.BLOCKLIST ||
          finish === FinishReason.SPII ||
          finish === FinishReason.RECITATION
        ) {
          throw new AIError("refused", "The AI declined to process this request.");
        }

        const text = response.text;
        let parsed: unknown;
        try {
          parsed = text ? JSON.parse(text) : undefined;
        } catch {
          parsed = undefined;
        }
        const checked = req.schema.safeParse(parsed);
        if (!checked.success) {
          if (!lastInvalid) {
            lastInvalid = true;
            continue;
          }
          throw new AIError("invalid_output", "The AI response did not match the expected structure.");
        }
        return {
          data: checked.data as z.infer<S>,
          model: cfg.model,
          usage: {
            inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
            outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
          },
        };
      } catch (err) {
        if (err instanceof AIError) throw err;
        if (err instanceof ApiError) {
          if (err.status === 401 || err.status === 403 || (err.status === 400 && /api key/i.test(err.message))) {
            throw new AIError("not_configured", "The AI provider rejected the configured credentials.");
          }
          if (RETRY_STATUSES.has(err.status) && attempt < cfg.maxRetries) {
            await sleep(Math.min(1000 * 2 ** attempt, 8000));
            continue;
          }
          throw new AIError(err.status === 429 ? "rate_limited" : "unavailable", "The AI provider is currently unavailable.");
        }
        if (attempt < cfg.maxRetries) {
          await sleep(Math.min(1000 * 2 ** attempt, 8000));
          continue;
        }
        throw new AIError("unavailable", "The AI provider is currently unavailable.");
      }
    }
    throw new AIError("unavailable", "The AI provider is currently unavailable.");
  }
}
