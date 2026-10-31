"use client";

import { useRef, useState } from "react";
import { FileUp, Paperclip, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { MAX_UPLOAD_BYTES } from "@/lib/files";
import type { SectionKey } from "@/lib/profile/sections";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";

/** Private supporting document for an entry (transcript, certificate, letter). */
export function AttachmentControl({
  sectionKey,
  entryId,
  purpose,
  attachmentId,
  onChange,
}: {
  sectionKey: SectionKey;
  entryId: string;
  purpose: string;
  attachmentId: string | null;
  onChange: (id: string | null) => void;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setError(null);
    if (file.size > MAX_UPLOAD_BYTES) return setError(t.errors.payload_too_large);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("purpose", purpose);
      const res = await fetch("/api/attachments", { method: "POST", body: fd, credentials: "same-origin" });
      const data = (await res.json().catch(() => null)) as { attachment?: { id: string }; error?: { code: string; message: string } } | null;
      if (!res.ok || !data?.attachment) throw new ApiError(res.status, data?.error?.code ?? "internal", data?.error?.message ?? "", null);
      await api(`/api/profile/sections/${sectionKey}/${entryId}/attachment`, { method: "PUT", body: { attachmentId: data.attachment.id } });
      if (attachmentId) await api(`/api/attachments/${attachmentId}`, { method: "DELETE" }).catch(() => undefined);
      onChange(data.attachment.id);
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async () => {
    if (!attachmentId) return;
    setBusy(true);
    try {
      await api(`/api/profile/sections/${sectionKey}/${entryId}/attachment`, { method: "PUT", body: { attachmentId: null } });
      await api(`/api/attachments/${attachmentId}`, { method: "DELETE" });
      onChange(null);
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2 rounded-lg border border-border p-4" aria-labelledby={`att-${entryId}`}>
      <h3 id={`att-${entryId}`} className="flex items-center gap-2 text-sm font-medium">
        <Paperclip className="size-4" aria-hidden />
        {t.profile.attachment}
      </h3>
      <p className="text-xs text-muted-foreground">{t.profile.attachmentHint}</p>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        {attachmentId && (
          <>
            <a href={`/api/attachments/${attachmentId}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-sm hover:bg-surface-muted">
              {t.profile.viewFile}
            </a>
            <Button size="sm" variant="ghost" onClick={remove} disabled={busy}>
              <Trash2 className="text-danger" aria-hidden />
              {t.profile.removeFile}
            </Button>
          </>
        )}
        <Button size="sm" variant="secondary" loading={busy} onClick={() => input.current?.click()}>
          <FileUp aria-hidden />
          {busy ? t.profile.uploading : t.profile.uploadFile}
        </Button>
        <input
          ref={input}
          type="file"
          className="sr-only"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          aria-label={t.profile.uploadFile}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
      </div>
    </section>
  );
}
