import "server-only";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/server/auth";
import { AppError, type ApiContext } from "@/server/http";

/** Server Component equivalent of the API context: verified user + RLS-bound client. */
export async function getPageContext(path?: string): Promise<ApiContext> {
  const user = await requireUser(path);
  const supabase = await createSupabaseServerClient();
  return { user, supabase };
}

/** Converts a service "not found" into the Next.js 404 page. */
export async function orNotFound<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (err) {
    if (err instanceof AppError && err.code === "not_found") notFound();
    throw err;
  }
}
