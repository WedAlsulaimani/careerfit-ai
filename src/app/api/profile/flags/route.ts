import { z } from "zod";
import { authedRoute, jsonOk, readJson } from "@/server/http";
import { updateProfileFlags } from "@/server/profile/repository";

const flagsSchema = z.object({
  onboarding_step: z.number().int().min(1).max(14).optional(),
  onboarding_complete: z.boolean().optional(),
  ai_consent: z.boolean().optional(),
  preferred_locale: z.enum(["en", "ar"]).optional(),
});

export const POST = authedRoute(async (req, { supabase, user }) => {
  const body = await readJson(req, flagsSchema);
  await updateProfileFlags(supabase, user.id, {
    ...(body.onboarding_step !== undefined ? { onboarding_step: body.onboarding_step } : {}),
    ...(body.onboarding_complete !== undefined
      ? { onboarding_completed_at: body.onboarding_complete ? new Date().toISOString() : null }
      : {}),
    ...(body.ai_consent !== undefined ? { ai_consent_at: body.ai_consent ? new Date().toISOString() : null } : {}),
    ...(body.preferred_locale ? { preferred_locale: body.preferred_locale } : {}),
  });
  return jsonOk({ ok: true });
});
