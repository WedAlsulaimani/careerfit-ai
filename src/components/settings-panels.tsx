"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/config";
import { api, errorMessage } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ConsentNotice } from "@/components/consent-notice";

export function SettingsPanels({
  aiConsentAt,
  attachments,
}: {
  aiConsentAt: string | null;
  attachments: { id: string; file_name: string; size_bytes: number; created_at: string }[];
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [docs, setDocs] = useState(attachments);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const withdraw = async () => {
    setBusy("consent");
    try {
      await api("/api/profile/flags", { body: { ai_consent: false } });
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, t));
    } finally {
      setBusy(null);
    }
  };

  const removeDoc = async (id: string) => {
    setBusy(id);
    try {
      await api(`/api/attachments/${id}`, { method: "DELETE" });
      setDocs((d) => d.filter((x) => x.id !== id));
    } catch (err) {
      toast.error(errorMessage(err, t));
    } finally {
      setBusy(null);
    }
  };

  const deleteAccount = async () => {
    setBusy("account");
    try {
      await api("/api/account", { method: "DELETE", body: { confirm: "DELETE" } });
      router.replace("/");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, t));
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t.settings.language}</CardTitle>
          <CardDescription>{t.settings.languageHelp}</CardDescription>
        </CardHeader>
        <CardContent>
          <LanguageSwitcher persistToProfile className="border border-border" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.settings.ai}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {aiConsentAt ? (
            <>
              <p className="text-sm">{format(t.consent.given, { date: formatDate(aiConsentAt, locale) })}</p>
              <p className="text-sm text-muted-foreground">{t.consent.body}</p>
              <Button variant="secondary" onClick={withdraw} loading={busy === "consent"}>
                {t.consent.withdraw}
              </Button>
            </>
          ) : (
            <ConsentNotice />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.settings.documents}</CardTitle>
          <CardDescription>{t.profile.attachmentHint}</CardDescription>
        </CardHeader>
        <CardContent>
          {docs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.settings.documentsEmpty}</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                  <a href={`/api/attachments/${d.id}`} target="_blank" rel="noopener noreferrer" className="truncate hover:text-accent" dir="auto">
                    {d.file_name}
                  </a>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    {(d.size_bytes / 1024).toFixed(0)} KB · {formatDate(d.created_at, locale)}
                    <Button size="icon" variant="ghost" aria-label={t.common.delete} onClick={() => removeDoc(d.id)} loading={busy === d.id}>
                      <Trash2 className="text-danger" aria-hidden />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.settings.dataTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t.settings.retentionTitle}</h3>
            <p className="text-sm text-muted-foreground">{t.settings.retentionBody}</p>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t.settings.exportTitle}</h3>
            <p className="text-sm text-muted-foreground">{t.settings.exportBody}</p>
            <a href="/api/profile/export" className={buttonVariants({ variant: "secondary" })}>
              <Download aria-hidden />
              {t.settings.exportButton}
            </a>
          </div>
          <div className="space-y-3 rounded-lg border border-danger/30 bg-danger-soft p-4">
            <h3 className="text-sm font-semibold text-danger">{t.settings.deleteTitle}</h3>
            <Alert tone="danger">{t.settings.deleteBody}</Alert>
            <Field id="delete-confirm" label={t.settings.deleteConfirmLabel}>
              <Input id="delete-confirm" dir="ltr" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" className="max-w-xs" />
            </Field>
            <Button variant="danger" disabled={confirmText !== "DELETE"} loading={busy === "account"} onClick={deleteAccount}>
              <Trash2 aria-hidden />
              {busy === "account" ? t.settings.deleting : t.settings.deleteButton}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
