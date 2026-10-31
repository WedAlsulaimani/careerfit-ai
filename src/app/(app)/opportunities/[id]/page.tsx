import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getPageContext, orNotFound } from "@/server/context";
import { getOpportunityBundle } from "@/server/services/opportunities";
import { getPersonal } from "@/server/profile/repository";
import { OpportunityWorkspace } from "@/components/opportunity/opportunity-workspace";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.opportunity.title };
}

export default async function OpportunityPage({ params }: PageProps<"/opportunities/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await getPageContext(`/opportunities/${id}`);
  const [bundle, personal, { data: resumes }] = await Promise.all([
    orNotFound(getOpportunityBundle(ctx, id)),
    getPersonal(ctx.supabase, ctx.user.id),
    ctx.supabase.from("resumes").select("id, title, language, updated_at").eq("opportunity_id", id).order("updated_at", { ascending: false }),
  ]);
  const o = bundle.opportunity;

  return (
    <Suspense>
      <OpportunityWorkspace
        // Remount when the server data changes (after analyze/match/refresh).
        key={`${bundle.analysis?.id ?? "none"}-${bundle.match?.id ?? "none"}`}
        opportunity={{
          id: o.id as string,
          title: o.title as string | null,
          organization: o.organization as string | null,
          source_type: o.source_type as string,
          source_url: o.source_url as string | null,
          status: o.status as string,
          created_at: o.created_at as string,
        }}
        sourceText={(bundle.source?.raw_text as string | undefined) ?? null}
        sourceMeta={(bundle.source?.extraction_meta as Record<string, unknown> | undefined) ?? null}
        analysis={
          bundle.analysis
            ? { analysis: bundle.analysis.analysis, approved_at: bundle.analysis.approved_at as string | null, created_at: bundle.analysis.created_at as string }
            : null
        }
        match={bundle.match ? { result: bundle.match.result, created_at: bundle.match.created_at as string } : null}
        application={
          bundle.application
            ? { status: bundle.application.status as string, applied_on: bundle.application.applied_on as string | null, notes: bundle.application.notes as string | null }
            : null
        }
        resumes={(resumes ?? []) as { id: string; title: string; language: string; updated_at: string }[]}
        aiConsent={Boolean(personal?.ai_consent_at)}
      />
    </Suspense>
  );
}
