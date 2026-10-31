import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Briefcase, FileText, Sparkles } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/config";
import { getPageContext } from "@/server/context";
import { getPersonal, profileCompletion } from "@/server/profile/repository";
import { listOpportunities } from "@/server/services/opportunities";
import { listResumes } from "@/server/services/resumes";
import { SECTIONS } from "@/lib/profile/sections";
import { buttonVariants } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeader, Progress } from "@/components/ui/primitives";
import { formatDate } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.dashboard.title };
}

export default async function DashboardPage() {
  const ctx = await getPageContext("/dashboard");
  const { t, locale } = await getI18n();
  const personal = await getPersonal(ctx.supabase, ctx.user.id);

  // First visit after sign-up goes straight to onboarding.
  const neverStarted =
    !personal?.onboarding_completed_at && Number(personal?.onboarding_step ?? 1) === 1 && !personal?.headline && !personal?.phone;
  const [completion, opportunities, resumes, { data: apps }] = await Promise.all([
    profileCompletion(ctx.supabase, ctx.user.id),
    listOpportunities(ctx),
    listResumes(ctx),
    ctx.supabase.from("applications").select("status"),
  ]);
  if (neverStarted && completion.sections.every((s) => s.count === 0)) redirect("/onboarding");

  const name = (personal?.full_name_en as string) || (personal?.full_name_ar as string) || "";
  const recent = [...completion.sections].filter((s) => s.lastUpdated).sort((a, b) => (b.lastUpdated! > a.lastUpdated! ? 1 : -1)).slice(0, 3);
  const statusCounts = new Map<string, number>();
  for (const a of apps ?? []) statusCounts.set(a.status as string, (statusCounts.get(a.status as string) ?? 0) + 1);

  return (
    <>
      <PageHeader
        title={name ? format(t.dashboard.greeting, { name: name.split(" ")[0] }) : t.dashboard.greetingAnon}
        description={t.dashboard.subtitle}
        actions={
          <Link href="/opportunities/new" className={buttonVariants()}>
            <Sparkles aria-hidden />
            {t.dashboard.analyzeCta}
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t.dashboard.profileCard}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-2xl font-semibold">{format(t.dashboard.completion, { percent: completion.percent })}</p>
              <Progress value={completion.percent} label={format(t.dashboard.completion, { percent: completion.percent })} />
              <p className="text-xs text-muted-foreground">{t.dashboard.completionHint}</p>
            </div>
            {recent.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{t.dashboard.recentlyUpdated}</p>
                <ul className="space-y-1 text-sm">
                  {recent.map((r) => (
                    <li key={r.key} className="flex justify-between gap-2">
                      <span className="truncate">{t.profile.sections[r.key].title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatDate(r.lastUpdated, locale)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {!completion.onboardingCompletedAt && (
                <Link href="/onboarding" className={buttonVariants({ size: "sm" })}>
                  {t.dashboard.continueOnboarding}
                </Link>
              )}
              <Link href="/profile/edit" className={buttonVariants({ size: "sm", variant: "secondary" })}>
                {t.dashboard.editProfile}
              </Link>
            </div>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
              {completion.sections
                .filter((s) => SECTIONS[s.key].wizardStep <= 7)
                .map((s) => (
                  <li key={s.key} className="flex justify-between gap-2">
                    <span className="truncate">{t.profile.sections[s.key].title}</span>
                    <span className={s.count ? "text-success" : ""}>{s.count}</span>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t.dashboard.opportunitiesCard}</CardTitle>
            <Link href="/opportunities" className="text-sm text-accent hover:underline">
              {t.dashboard.viewAll}
            </Link>
          </CardHeader>
          <CardContent>
            {opportunities.length === 0 ? (
              <EmptyState icon={<Briefcase aria-hidden />} title={t.dashboard.noOpportunities} action={<Link href="/opportunities/new" className={buttonVariants({ size: "sm" })}>{t.dashboard.analyzeCta}</Link>} />
            ) : (
              <ul className="divide-y divide-border">
                {opportunities.slice(0, 5).map((o) => (
                  <li key={o.id as string}>
                    <Link href={`/opportunities/${o.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-accent">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{(o.title as string) || t.opportunity.untitled}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[(o.organization as string) || null, formatDate(o.created_at as string, locale)].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <Badge tone={o.status === "matched" ? "success" : o.status === "failed" ? "danger" : o.status === "analyzed" ? "warning" : "neutral"}>
                        {t.enums.opportunityStatus[o.status as keyof typeof t.enums.opportunityStatus]}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t.dashboard.resumesCard}</CardTitle>
            <Link href="/resumes" className="text-sm text-accent hover:underline">
              {t.dashboard.viewAll}
            </Link>
          </CardHeader>
          <CardContent>
            {resumes.length === 0 ? (
              <EmptyState icon={<FileText aria-hidden />} title={t.dashboard.noResumes} />
            ) : (
              <ul className="divide-y divide-border">
                {resumes.slice(0, 5).map((r) => (
                  <li key={r.id as string}>
                    <Link href={`/resumes/${r.id}/edit`} className="flex items-center justify-between gap-3 py-3 hover:text-accent">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r.title as string}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.enums.resumeLanguage[r.language as "en" | "ar"]} · {format(t.resumes.version, { n: r.current_version as number })} · {formatDate(r.updated_at as string, locale)}
                        </p>
                      </div>
                      <ArrowRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t.dashboard.trackerCard}</CardTitle>
            <Link href="/applications" className="text-sm text-accent hover:underline">
              {t.dashboard.viewAll}
            </Link>
          </CardHeader>
          <CardContent>
            {statusCounts.size === 0 ? (
              <p className="text-sm text-muted-foreground">{t.dashboard.trackerEmpty}</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {[...statusCounts.entries()].map(([status, count]) => (
                  <li key={status} className="flex justify-between">
                    <span>{t.enums.applicationStatus[status as keyof typeof t.enums.applicationStatus]}</span>
                    <span className="font-medium">{count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
