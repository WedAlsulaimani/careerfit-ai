"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import type { AutosaveStatus } from "./use-autosave";

export function AutosaveIndicator({ status }: { status: AutosaveStatus }) {
  const { t } = useI18n();
  const label =
    status === "saving" || status === "pending"
      ? t.common.saving
      : status === "saved"
        ? t.common.allChangesSaved
        : status === "error"
          ? t.common.errorGeneric
          : t.profile.autosaveOn;
  return (
    <p aria-live="polite" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      {(status === "saving" || status === "pending") && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      {status === "saved" && <Check className="size-3.5 text-success" aria-hidden />}
      {status === "error" && <AlertCircle className="size-3.5 text-danger" aria-hidden />}
      {label}
    </p>
  );
}
