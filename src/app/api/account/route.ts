import { z } from "zod";
import { AppError, authedRoute, jsonOk, readJson } from "@/server/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Permanent account deletion. Removes the user's private files, then the auth
 * user; every table cascades from auth.users, so all profile data, analyses,
 * resumes and versions are deleted with it.
 */
export const DELETE = authedRoute(async (req, { supabase, user }) => {
  await readJson(req, z.object({ confirm: z.literal("DELETE") }));

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    throw new AppError(503, "not_configured", "Account deletion is not configured on this server.");
  }

  // Remove storage objects in pages of 100 under "<user_id>/".
  for (;;) {
    const { data: objects, error } = await admin.storage.from("documents").list(user.id, { limit: 100 });
    if (error) throw new AppError(500, "internal", "Could not delete stored files.");
    if (!objects?.length) break;
    const { error: removeError } = await admin.storage.from("documents").remove(objects.map((o) => `${user.id}/${o.name}`));
    if (removeError) throw new AppError(500, "internal", "Could not delete stored files.");
    if (objects.length < 100) break;
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw new AppError(500, "internal", "Could not delete the account.");
  await supabase.auth.signOut();
  return jsonOk({ ok: true });
});
