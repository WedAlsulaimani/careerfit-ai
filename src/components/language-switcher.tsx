"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className, persistToProfile = false }: { className?: string; persistToProfile?: boolean }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const next = locale === "ar" ? "en" : "ar";

  const change = () =>
    start(async () => {
      await fetch("/api/locale", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      if (persistToProfile) {
        await fetch("/api/profile/flags", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ preferred_locale: next }),
        }).catch(() => undefined);
      }
      router.refresh();
    });

  return (
    <button
      type="button"
      onClick={change}
      disabled={pending}
      aria-label={t.common.switchLanguage}
      lang={next}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted-foreground hover:bg-surface-muted hover:text-foreground disabled:opacity-50",
        className,
      )}
    >
      <Languages className="size-4" aria-hidden />
      {next === "ar" ? t.common.arabic : t.common.english}
    </button>
  );
}
