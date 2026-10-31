import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { publicSupabaseConfig } from "@/lib/env";

export interface SessionUser {
  id: string;
  email: string | null;
}

/**
 * Data Access Layer entry point. Verifies the session server-side
 * (getClaims validates the JWT signature) and returns a narrow user object.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  if (!publicSupabaseConfig()) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const claims = data.claims as { sub: string; email?: string };
  return { id: claims.sub, email: claims.email ?? null };
});

/** For protected pages: redirects to /login when there is no valid session. */
export async function requireUser(nextPath?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  }
  return user;
}
