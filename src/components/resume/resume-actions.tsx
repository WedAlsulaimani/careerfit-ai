"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Download, Eye, Pencil, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { api, errorMessage } from "@/lib/api-client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

export function ResumeActions({ id, showPreview = true }: { id: string; showPreview?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const duplicate = async () => {
    setBusy(true);
    try {
      const res = await api<{ resume: { id: string } }>(`/api/resumes/${id}/duplicate`, { method: "POST" });
      toast.success(t.resumes.duplicated);
      router.push(`/resumes/${res.resume.id}/edit`);
    } catch (err) {
      toast.error(errorMessage(err, t));
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/resumes/${id}`, { method: "DELETE" });
      toast.success(t.resumes.deleted);
      setConfirm(false);
      router.push("/resumes");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-1">
      {showPreview && (
        <Link href={`/resumes/${id}`} className={buttonVariants({ size: "sm", variant: "ghost" })}>
          <Eye aria-hidden />
          {t.common.preview}
        </Link>
      )}
      <Link href={`/resumes/${id}/edit`} className={buttonVariants({ size: "sm", variant: "ghost" })}>
        <Pencil aria-hidden />
        {t.resumes.edit}
      </Link>
      <a href={`/api/resumes/${id}/pdf`} className={buttonVariants({ size: "sm", variant: "ghost" })}>
        <Download aria-hidden />
        {t.common.download}
      </a>
      <Button size="sm" variant="ghost" onClick={duplicate} disabled={busy}>
        <Copy aria-hidden />
        {t.common.duplicate}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirm(true)} disabled={busy}>
        <Trash2 className="text-danger" aria-hidden />
        {t.common.delete}
      </Button>
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t.common.confirmDeleteTitle}
        description={t.resumes.deleteConfirm}
        closeLabel={t.common.close}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              {t.common.cancel}
            </Button>
            <Button variant="danger" onClick={remove} loading={busy}>
              {t.common.delete}
            </Button>
          </>
        }
      />
    </div>
  );
}
