import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, Sparkles } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { getPageContext } from "@/server/context";
import { listOpportunities } from "@/server/services/opportunities";
import { buttonVariants } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { formatDate } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.opportunity.listTitle };
}

export default async function OpportunitiesPage() {
  const ctx = await getPageContext("/opportunities");
  const { t, locale } = await getI18n();
  const items = await listOpportunities(ctx);

  return (
    <>
      <PageHeader
        title={t.opportunity.listTitle}
        description={t.opportunity.listSubtitle}
        actions={
          <Link href="/opportunities/new" className={buttonVariants()}>
            <Sparkles aria-hidden />
            {t.nav.analyze}
          </Link>
        }
      />
      {items.length === 0 ? (
        <EmptyState icon={<Briefcase aria-hidden />} title={t.dashboard.noOpportunities} action={<Link href="/opportunities/new" className={buttonVariants({ size: "sm" })}>{t.dashboard.analyzeCta}</Link>} />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {items.map((o) => (
              <li key={o.id as string}>
                <Link href={`/opportunities/${o.id}`} className="flex flex-col gap-2 p-4 hover:bg-surface-muted sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium" dir="auto">{(o.title as string) || t.opportunity.untitled}</p>
                    <p className="truncate text-xs text-muted-foreground" dir="auto">
                      {[(o.organization as string) || null, (o.location as string) || null].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge>{t.enums.sourceType[o.source_type as keyof typeof t.enums.sourceType]}</Badge>
                    <Badge tone={o.status === "matched" ? "success" : o.status === "failed" ? "danger" : o.status === "analyzed" ? "warning" : "neutral"}>
                      {t.enums.opportunityStatus[o.status as keyof typeof t.enums.opportunityStatus]}
                    </Badge>
                    <span>{formatDate(o.created_at as string, locale)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
