import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError, authedRoute, dbError, jsonOk, rateLimit } from "@/server/http";
import { detectFileType, MAX_UPLOAD_BYTES } from "@/lib/files";

const purposeSchema = z.enum(["transcript", "project", "certification", "recommendation", "other"]);

export const GET = authedRoute(async (_req, { supabase }) => {
  const { data, error } = await supabase
    .from("attachments")
    .select("id, file_name, mime_type, size_bytes, purpose, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) dbError(error, "list attachments");
  return jsonOk({ attachments: data ?? [] });
});

/** Private upload: validated by size and magic bytes, stored under "<user_id>/". */
export const POST = authedRoute(async (req, { supabase, user }) => {
  rateLimit(`upload:${user.id}`, 20, 60_000);
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > MAX_UPLOAD_BYTES + 100_000) throw new AppError(413, "payload_too_large", "File is too large (max 10 MB).");

  const form = await req.formData();
  const file = form.get("file");
  const purpose = purposeSchema.parse(form.get("purpose") ?? "other");
  if (!(file instanceof File)) throw new AppError(422, "validation", "No file provided.");
  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) throw new AppError(413, "payload_too_large", "File is too large (max 10 MB).");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectFileType(bytes);
  if (!type) throw new AppError(422, "validation", "Only PDF, PNG, JPEG or WebP files are accepted.");

  const path = `${user.id}/${randomUUID()}.${type.ext}`;
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(path, bytes, { contentType: type.mime, upsert: false });
  if (uploadError) throw new AppError(500, "internal", "Upload failed.");

  const safeName = file.name.normalize("NFKC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 200) || `file.${type.ext}`;
  const { data, error } = await supabase
    .from("attachments")
    .insert({
      user_id: user.id,
      storage_path: path,
      file_name: safeName,
      mime_type: type.mime,
      size_bytes: bytes.byteLength,
      purpose,
    })
    .select("id, file_name, mime_type, size_bytes, purpose, created_at")
    .single();
  if (error) {
    await supabase.storage.from("documents").remove([path]);
    dbError(error, "insert attachment");
  }
  return jsonOk({ attachment: data }, { status: 201 });
});
