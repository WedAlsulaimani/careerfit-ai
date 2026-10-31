import { authedRoute, jsonOk, rateLimit, readJson } from "@/server/http";
import { generateResumeSchema } from "@/lib/schemas/resume";
import { generateResume, listResumes } from "@/server/services/resumes";

export const maxDuration = 180;

export const GET = authedRoute(async (_req, ctx) => jsonOk({ resumes: await listResumes(ctx) }));

export const POST = authedRoute(async (req, ctx) => {
  rateLimit(`ai:${ctx.user.id}`, 10, 60_000);
  const input = await readJson(req, generateResumeSchema);
  return jsonOk({ resume: await generateResume(ctx, input) }, { status: 201 });
});
