import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getI18n } from "@/lib/i18n/server";
import { getPageContext, orNotFound } from "@/server/context";
import { getResume, listVersions } from "@/server/services/resumes";
import { loadSnapshot } from "@/server/profile/repository";
import { buildEvidenceCatalog } from "@/lib/evidence/catalog";
import { allowedSections, factualItem } from "@/lib/resume/compose";
import { jobAnalysisSchema } from "@/lib/schemas/job";
import { ResumeEditor, type ProfileItemOption } from "@/components/resume/resume-editor";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.editor.title };
}

export default async function ResumeEditPage({ params }: PageProps<"/resumes/[id]/edit">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await getPageContext(`/resumes/${id}/edit`);
  const resume = await orNotFound(getResume(ctx, id));

  const [versions, snapshot, analysisRow] = await Promise.all([
    listVersions(ctx, id),
    loadSnapshot(ctx.supabase, ctx.user.id),
    resume.opportunity_id
      ? ctx.supabase
          .from("job_analyses")
          .select("analysis")
          .eq("opportunity_id", resume.opportunity_id)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle()
          .then((r) => r.data)
      : Promise.resolve(null),
  ]);

  const analysis = analysisRow ? jobAnalysisSchema.safeParse(analysisRow.analysis) : null;
  const keywords = analysis?.success ? [...new Set([...analysis.data.ats_keywords, ...analysis.data.tools])] : [];

  const records = buildEvidenceCatalog(snapshot);
  const evidenceTitles = Object.fromEntries(records.map((r) => [r.id, r.title]));
  // Profile records that can be added back into the resume (facts only, no AI text).
  const profileItems: ProfileItemOption[] = records
    .filter((r) => r.kind !== "skill" && r.kind !== "language")
    .map((r) => ({
      sourceRef: r.id,
      label: r.title,
      sectionType: allowedSections(r)[0],
      items: { en: { ...factualItem(r, "en"), bullets: [] }, ar: { ...factualItem(r, "ar"), bullets: [] } },
    }))
    .filter((p) => p.sectionType);

  return (
    <ResumeEditor
      resumeId={resume.id as string}
      initialTitle={resume.title as string}
      initialDoc={resume.content}
      initialVersion={resume.current_version as number}
      keywords={keywords}
      evidenceTitles={evidenceTitles}
      profileItems={profileItems}
      versions={versions as { version: number; reason: string; created_at: string }[]}
      canRegenerate={Boolean(resume.opportunity_id)}
    />
  );
}
