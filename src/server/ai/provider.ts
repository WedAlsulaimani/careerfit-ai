import "server-only";
import type { z } from "zod";

/**
 * Provider abstraction. Application services depend only on this interface,
 * so another model vendor can be added without touching business logic.
 */
export interface StructuredRequest<S extends z.ZodType> {
  /** Stable system prompt (cache-friendly: no timestamps or per-request data). */
  system: string;
  /** User-turn content. Untrusted material must already be wrapped (see prompts.ts). */
  input: string;
  schema: S;
  maxTokens?: number;
  /** Label recorded in the usage ledger. */
  operation: string;
}

export interface StructuredResult<T> {
  data: T;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface AIProvider {
  readonly name: string;
  generateStructured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<StructuredResult<z.infer<S>>>;
}

export type AIErrorKind =
  | "not_configured"
  | "unavailable"
  | "rate_limited"
  | "refused"
  | "invalid_output";

/** Typed AI failure. Callers never substitute fabricated output when this is thrown. */
export class AIError extends Error {
  constructor(
    public readonly kind: AIErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "AIError";
  }
}
