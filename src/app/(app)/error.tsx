"use client";

import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-lg py-16">
      <Alert tone="danger" title={t.errors.internal} action={<Button onClick={reset}>{t.common.retry}</Button>} />
    </div>
  );
}
