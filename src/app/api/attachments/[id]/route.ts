import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, authedRoute, dbError, jsonOk } from "@/server/http";
import type { SupabaseServerClient } from "@/lib/supabase/server";

async function getOwned(supabase: SupabaseServerClient, id: string) {
  if (!z.uuid().safeParse(id).success) throw new AppError(404, "not_found", "Not found.");
  const { data, error } = await supabase.from("attachments").select("id, storage_path").eq("id", id).maybeSingle();
  if (error) dbError(error, "get attachment");
  if (!data) throw new AppError(404, "not_found", "Not found.");
  return data as { id: string; storage_path: string };
}

/** Short-lived signed URL; the bucket itself is private. */
export const GET = authedRoute<{ id: string }>(async (_req, { supabase }, { id }) => {
  const att = await getOwned(supabase, id);
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(att.storage_path, 60);
  if (error || !data) throw new AppError(404, "not_found", "File not available.");
  return NextResponse.redirect(data.signedUrl, { headers: { "cache-control": "no-store" } });
});

export const DELETE = authedRoute<{ id: string }>(async (_req, { supabase }, { id }) => {
  const att = await getOwned(supabase, id);
  const { error: storageError } = await supabase.storage.from("documents").remove([att.storage_path]);
  if (storageError) throw new AppError(500, "internal", "Could not delete the file.");
  const { error } = await supabase.from("attachments").delete().eq("id", id);
  if (error) dbError(error, "delete attachment");
  return jsonOk({ ok: true });
});
