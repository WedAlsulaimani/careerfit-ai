"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Image as ImageIcon, Keyboard, Link2, QrCode } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { api, ApiError, errorMessage, fieldErrors } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form-controls";
import { Alert, Card, CardContent } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { ImageIntake } from "./image-intake";
import { QrIntake } from "./qr-intake";

type Tab = "url" | "image" | "qr" | "manual";
const FALLBACK_CODES = new Set(["url_blocked", "url_robots_disallowed", "url_fetch_failed", "url_not_html", "url_too_large", "url_no_content"]);

export function IntakeTabs() {
  const { t } = useI18n();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("url");
  const tabs: { id: Tab; label: string; icon: typeof Link2 }[] = [
    { id: "url", label: t.intake.tabs.url, icon: Link2 },
    { id: "image", label: t.intake.tabs.image, icon: ImageIcon },
    { id: "qr", label: t.intake.tabs.qr, icon: QrCode },
    { id: "manual", label: t.intake.tabs.manual, icon: Keyboard },
  ];

  const opened = (id: string) => router.push(`/opportunities/${id}?autoAnalyze=1`);

  return (
    <Card>
      <div role="tablist" aria-label={t.intake.title} className="flex overflow-x-auto border-b border-border">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(e) => {
              const order: Tab[] = ["url", "image", "qr", "manual"];
              const dir = document.documentElement.dir === "rtl" ? -1 : 1;
              const delta = e.key === "ArrowRight" ? dir : e.key === "ArrowLeft" ? -dir : 0;
              if (delta) {
                const next = order[(order.indexOf(tab) + delta + order.length) % order.length];
                setTab(next);
                document.getElementById(`tab-${next}`)?.focus();
              }
            }}
            className={cn(
              "flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors",
              tab === id ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>
      <CardContent className="pt-5">
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === "url" && <UrlIntake onCreated={opened} onFallback={setTab} />}
          {tab === "image" && <ImageIntake onCreated={opened} />}
          {tab === "qr" && <QrIntake onCreated={opened} onFallback={setTab} />}
          {tab === "manual" && <ManualIntake onCreated={opened} />}
        </div>
      </CardContent>
    </Card>
  );
}

export function UrlIntake({
  onCreated,
  onFallback,
  initialUrl = "",
  via = "url",
}: {
  onCreated: (id: string) => void;
  onFallback: (tab: Tab) => void;
  initialUrl?: string;
  via?: "url" | "qr";
}) {
  const { t } = useI18n();
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; fallback: boolean } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ opportunity: { id: string } }>("/api/opportunities/url", { body: { url, via } });
      onCreated(res.opportunity.id);
    } catch (err) {
      // Never claim success: show the reason and offer the fallbacks.
      setError({ message: errorMessage(err, t), fallback: err instanceof ApiError && FALLBACK_CODES.has(err.code) });
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field id="job-url" label={t.intake.urlLabel} help={t.intake.urlHelp} required>
        <Input id="job-url" type="url" dir="ltr" inputMode="url" placeholder={t.intake.urlPlaceholder} value={url} onChange={(e) => setUrl(e.target.value)} required />
      </Field>
      {error && (
        <Alert
          tone={error.fallback ? "warning" : "danger"}
          title={error.message}
          action={
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => onFallback("manual")}>
                {t.intake.useManual}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => onFallback("image")}>
                {t.intake.useImage}
              </Button>
            </div>
          }
        >
          {t.intake.fallbackBody}
        </Alert>
      )}
      <Button type="submit" loading={busy} disabled={!url.trim()}>
        {busy ? t.intake.fetching : t.intake.fetch}
      </Button>
    </form>
  );
}

const MANUAL_FIELDS = [
  ["title", "text", true],
  ["organization", "text", false],
  ["location", "text", false],
  ["employment_type", "text", false],
  ["deadline", "date", false],
  ["source_url", "url", false],
  ["description", "textarea", false],
  ["responsibilities", "textarea", false],
  ["required_skills", "textarea", false],
  ["preferred_skills", "textarea", false],
  ["education_requirements", "textarea", false],
  ["experience_requirements", "textarea", false],
  ["languages", "text", false],
  ["additional_requirements", "textarea", false],
] as const;

export function ManualIntake({ onCreated }: { onCreated: (id: string) => void }) {
  const { t } = useI18n();
  const form = useForm<Record<string, string>>({ defaultValues: Object.fromEntries(MANUAL_FIELDS.map(([n]) => [n, ""])) });
  const [error, setError] = useState<string | null>(null);
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    if (!values.title.trim()) {
      form.setError("title", { message: t.errors.fieldRequired });
      return;
    }
    try {
      const res = await api<{ opportunity: { id: string } }>("/api/opportunities", { body: values });
      onCreated(res.opportunity.id);
    } catch (err) {
      for (const [k, m] of Object.entries(fieldErrors(err, t))) form.setError(k, { message: m });
      setError(errorMessage(err, t));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <p className="text-sm text-muted-foreground">{t.intake.manualIntro}</p>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        {MANUAL_FIELDS.map(([name, type, required]) => {
          const id = `manual-${name}`;
          const label = t.intake.manual[name];
          const err = errors[name]?.message;
          return (
            <Field key={name} id={id} label={label} error={err} required={required} className={cn(type === "textarea" && "sm:col-span-2")}>
              {type === "textarea" ? (
                <Textarea id={id} rows={name === "description" ? 6 : 3} aria-invalid={!!err} {...form.register(name)} />
              ) : (
                <Input id={id} type={type} dir={type === "url" ? "ltr" : undefined} aria-invalid={!!err} {...form.register(name)} />
              )}
            </Field>
          );
        })}
      </div>
      <Button type="submit" loading={isSubmitting}>
        {isSubmitting ? t.intake.creating : t.intake.submitManual}
      </Button>
    </form>
  );
}
