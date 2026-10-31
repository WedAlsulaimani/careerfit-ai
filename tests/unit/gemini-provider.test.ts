import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const generateContent = vi.fn();
vi.mock("@google/genai", async () => {
  const actual = await vi.importActual<typeof import("@google/genai")>("@google/genai");
  return { ...actual, GoogleGenAI: class { models = { generateContent }; } };
});

import { ApiError, FinishReason } from "@google/genai";
import { GeminiProvider } from "@/server/ai/gemini";
import { getAIProvider, setAIProviderForTests } from "@/server/ai";
import { aiConfig } from "@/lib/env";
import { aiJobAnalysisSchema, aiMatchSchema, aiResumePlanSchema, aiSectionRewriteSchema } from "@/server/ai/schemas";

const schema = z.object({ title: z.string(), n: z.number() });
const req = { system: "sys", input: "in", schema, operation: "t" };
const ok = (obj: unknown, extra: Record<string, unknown> = {}) => ({
  text: JSON.stringify(obj),
  candidates: [{ finishReason: FinishReason.STOP }],
  usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7 },
  ...extra,
});
const apiError = (status: number) => new ApiError({ message: `http ${status}`, status });

describe("Gemini provider", () => {
  beforeEach(() => {
    generateContent.mockReset();
    process.env.GEMINI_API_KEY = "test-key";
    process.env.AI_MAX_RETRIES = "1";
    delete process.env.AI_PROVIDER;
    delete process.env.AI_MODEL;
  });
  afterEach(() => setAIProviderForTests(null));

  it("is the default provider and sends a JSON schema with system instruction", async () => {
    expect(aiConfig().provider).toBe("gemini");
    expect(getAIProvider().name).toBe("gemini");
    generateContent.mockResolvedValue(ok({ title: "x", n: 1 }));
    const res = await new GeminiProvider().generateStructured(req);
    expect(res).toMatchObject({ data: { title: "x", n: 1 }, usage: { inputTokens: 11, outputTokens: 7 } });
    const call = generateContent.mock.calls[0][0];
    expect(call.config.systemInstruction).toBe("sys");
    expect(call.config.responseMimeType).toBe("application/json");
    expect(call.config.responseJsonSchema.properties.title.type).toBe("string");
    expect(call.config.responseJsonSchema.$schema).toBeUndefined();
  });

  it("anthropic stays selectable", () => {
    process.env.AI_PROVIDER = "anthropic";
    expect(aiConfig().provider).toBe("anthropic");
    expect(aiConfig().model).toBe("claude-opus-5-5");
  });

  it("requires a server-side key", async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    await expect(new GeminiProvider().generateStructured(req)).rejects.toMatchObject({ kind: "not_configured" });
  });

  it("retries once when the JSON does not match the schema, then fails without fabricating", async () => {
    generateContent.mockResolvedValueOnce(ok({ title: 5 })).mockResolvedValueOnce(ok({ title: "fixed", n: 2 }));
    await expect(new GeminiProvider().generateStructured(req)).resolves.toMatchObject({ data: { title: "fixed" } });
    generateContent.mockReset();
    generateContent.mockResolvedValue(ok({ nope: true }));
    await expect(new GeminiProvider().generateStructured(req)).rejects.toMatchObject({ kind: "invalid_output" });
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it.each([
    [ok({}, { promptFeedback: { blockReason: "SAFETY" } }), "refused"],
    [ok({}, { candidates: [{ finishReason: FinishReason.SAFETY }] }), "refused"],
    [ok({}, { candidates: [{ finishReason: FinishReason.MAX_TOKENS }] }), "invalid_output"],
  ])("maps blocked/truncated responses (%#)", async (response, kind) => {
    generateContent.mockResolvedValue(response);
    await expect(new GeminiProvider().generateStructured(req)).rejects.toMatchObject({ kind });
  });

  it("maps HTTP failures and retries transient ones", async () => {
    generateContent.mockRejectedValueOnce(apiError(503)).mockResolvedValueOnce(ok({ title: "t", n: 1 }));
    await expect(new GeminiProvider().generateStructured(req)).resolves.toMatchObject({ data: { n: 1 } });

    generateContent.mockReset();
    generateContent.mockRejectedValue(apiError(429));
    await expect(new GeminiProvider().generateStructured(req)).rejects.toMatchObject({ kind: "rate_limited" });

    generateContent.mockReset();
    generateContent.mockRejectedValue(apiError(403));
    await expect(new GeminiProvider().generateStructured(req)).rejects.toMatchObject({ kind: "not_configured" });

    generateContent.mockReset();
    generateContent.mockRejectedValue(apiError(400));
    await expect(new GeminiProvider().generateStructured(req)).rejects.toMatchObject({ kind: "unavailable" });
  }, 20_000);

  it("all application AI schemas convert to JSON Schema", () => {
    for (const s of [aiJobAnalysisSchema, aiMatchSchema, aiResumePlanSchema, aiSectionRewriteSchema]) {
      const js = z.toJSONSchema(s, { target: "draft-7" }) as { type: string };
      expect(js.type).toBe("object");
    }
  });
});
