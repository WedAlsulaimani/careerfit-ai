import type { Metadata } from "next";
import { ListChecks } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { getPageContext } from "@/server/context";
import { dbError } from "@/server/http";
import { ApplicationsTable, type ApplicationRow } from "@/components/applications-table";
import { EmptyState, PageHeader } from "@/components/ui/primitives";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.applications.title };
}

export default async function ApplicationsPage() {
  const ctx = await getPageContext("/applications");
  const { t } = await getI18n();
  const { data, error } = await ctx.supabase
    .from("applications")
    .select("opportunity_id, status, applied_on, notes, updated_at, job_opportunities(title, organization)")
    .order("updated_at", { ascending: false })
    .limit(300);
  if (error) dbError(error, "list applications");

  const rows: ApplicationRow[] = (data ?? []).map((a) => {
    const job = (Array.isArray(a.job_opportunities) ? a.job_opportunities[0] : a.job_opportunities) as { title?: string; organization?: string } | null;
    return {
      opportunity_id: a.opportunity_id as string,
      status: a.status as string,
      applied_on: a.applied_on as string | null,
      notes: a.notes as string | null,
      updated_at: a.updated_at as string,
      title: job?.title ?? null,
      organization: job?.organization ?? null,
    };
  });

  return (
    <>
      <PageHeader title={t.applications.title} description={t.applications.subtitle} />
      {rows.length === 0 ? <EmptyState icon={<ListChecks aria-hidden />} title={t.applications.empty} /> : <ApplicationsTable rows={rows} />}
    </>
  );
}
