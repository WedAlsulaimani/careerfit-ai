import { z } from "zod";
import { AppError, authedRoute, jsonOk, readJson } from "@/server/http";
import { jobAnalysisSchema } from "@/lib/schemas/job";
import { saveReviewedAnalysis } from "@/server/services/opportunities";

const bodySchema = z.object({ analysis: jobAnalysisSchema, approve: z.boolean() });

/** Saves the user's reviewed/edited analysis (new version) and optionally approves it. */
export const PUT = authedRoute<{ id: string }>(async (req, ctx, { id }) => {
  if (!z.uuid().safeParse(id).success) throw new AppError(404, "not_found", "Not found.");
  const { analysis, approve } = await readJson(req, bodySchema, 400_000);
  return jsonOk({ analysis: await saveReviewedAnalysis(ctx, id, analysis, approve) });
});
