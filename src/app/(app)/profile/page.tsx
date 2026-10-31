import type { Metadata } from "next";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/config";
import { getPageContext } from "@/server/context";
import { loadProfileForEditing } from "@/server/profile/load-all";
import { profileCompletion } from "@/server/profile/repository";
import { SECTIONS, SECTION_KEYS } from "@/lib/profile/sections";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, PageHeader, Progress } from "@/components/ui/primitives";
import { formatDate } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.profile.title };
}

const s = (v: unknown) => (typeof v === "string" ? v : "");

export default async function ProfilePage() {
  const ctx = await getPageContext("/profile");
  const { t, locale } = await getI18n();
  const [data, completion] = await Promise.all([loadProfileForEditing(ctx.supabase, ctx.user.id), profileCompletion(ctx.supabase, ctx.user.id)]);
  const p = data.personal ?? {};
  const ordered = [...SECTION_KEYS].sort((a, b) => SECTIONS[a].wizardStep - SECTIONS[b].wizardStep);

  return (
    <>
      <PageHeader
        title={t.profile.title}
        description={t.profile.subtitle}
        actions={
          <Link href="/profile/edit" className={buttonVariants()}>
            <Pencil aria-hidden />
            {t.profile.editAll}
          </Link>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>{s(p.full_name_en) || s(p.full_name_ar) || t.common.notSet}</CardTitle>
            {s(p.headline) && <p className="text-sm text-muted-foreground">{s(p.headline)}</p>}
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <dl className="space-y-2">
              {[
                [t.fields.personal.email.label, s(p.email)],
                [t.fields.personal.phone.label, [s(p.phone_country_code), s(p.phone)].filter(Boolean).join(" ")],
                [t.fields.personal.city.label, [s(p.city), s(p.country)].filter(Boolean).join(", ")],
                [t.fields.personal.linkedin_url.label, s(p.linkedin_url)],
                [t.fields.personal.github_url.label, s(p.github_url)],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="break-words" dir="auto">{v}</dd>
                  </div>
                ))}
            </dl>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{format(t.dashboard.completion, { percent: completion.percent })}</p>
              <Progress value={completion.percent} label={format(t.dashboard.completion, { percent: completion.percent })} />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
          {ordered.map((key) => {
            const entries = data.sections[key];
            const section = SECTIONS[key];
            const last = completion.sections.find((c) => c.key === key)?.lastUpdated;
            return (
              <Card key={key}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm">{t.profile.sections[key].title}</CardTitle>
                    <Link href={`/profile/edit#section-${key}`} className="text-xs text-accent hover:underline">
                      {t.common.edit}
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {entries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t.onboarding.noEntries}</p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {entries.slice(0, 4).map((e) => (
                        <li key={e.id} className="truncate">
                          {String(e[section.titleField] ?? "")}
                        </li>
                      ))}
                      {entries.length > 4 && <li className="text-xs text-muted-foreground">+{entries.length - 4}</li>}
                    </ul>
                  )}
                  {last && <p className="text-xs text-muted-foreground">{format(t.common.lastUpdated, { date: formatDate(last, locale) })}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}
