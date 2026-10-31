"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { api, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** Explicit, revocable consent before any data is sent to the AI provider. */
export function ConsentNotice({ onAccepted }: { onAccepted?: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const accept = async () => {
    setBusy(true);
    try {
      await api("/api/profile/flags", { body: { ai_consent: true } });
      onAccepted?.();
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="consent-title" className="rounded-xl border border-accent/30 bg-accent-soft p-5">
      <div className="flex gap-3">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
        <div className="space-y-3">
          <h2 id="consent-title" className="font-semibold">
            {t.consent.title}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{t.consent.body}</p>
          <Button onClick={accept} loading={busy}>
            {t.consent.accept}
          </Button>
        </div>
      </div>
    </section>
  );
}
