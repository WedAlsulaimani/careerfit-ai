import { z } from "zod";
import { AppError, authedRoute, jsonOk, rateLimit } from "@/server/http";
import { analyzeOpportunity } from "@/server/services/opportunities";

export const maxDuration = 120;

export const POST = authedRoute<{ id: string }>(async (_req, ctx, { id }) => {
  if (!z.uuid().safeParse(id).success) throw new AppError(404, "not_found", "Not found.");
  rateLimit(`ai:${ctx.user.id}`, 10, 60_000);
  return jsonOk({ analysis: await analyzeOpportunity(ctx, id) });
});
