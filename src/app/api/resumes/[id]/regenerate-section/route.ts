import { z } from "zod";
import { AppError, authedRoute, jsonOk, rateLimit, readJson } from "@/server/http";
import { resumeDocumentSchema } from "@/lib/schemas/resume";
import { suggestSectionRewrite } from "@/server/services/resumes";

export const maxDuration = 120;

/** Returns a suggestion for one section. Nothing is saved until the user applies it. */
export const POST = authedRoute<{ id: string }>(async (req, ctx, { id }) => {
  if (!z.uuid().safeParse(id).success) throw new AppError(404, "not_found", "Not found.");
  rateLimit(`ai:${ctx.user.id}`, 10, 60_000);
  const { sectionId, content } = await readJson(
    req,
    z.object({ sectionId: z.string().min(1).max(40), content: resumeDocumentSchema }),
    600_000,
  );
  return jsonOk({ suggestion: await suggestSectionRewrite(ctx, id, sectionId, content) });
});
