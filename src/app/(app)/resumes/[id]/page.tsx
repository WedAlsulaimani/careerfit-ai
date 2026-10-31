import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getI18n } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/config";
import { getPageContext, orNotFound } from "@/server/context";
import { getResume } from "@/server/services/resumes";
import { PageHeader } from "@/components/ui/primitives";
import { ResumeActions } from "@/components/resume/resume-actions";
import { ResumePreview } from "@/components/resume/resume-preview";
import { formatDate } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.resumes.title };
}

export default async function ResumePage({ params }: PageProps<"/resumes/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await getPageContext(`/resumes/${id}`);
  const { t, locale } = await getI18n();
  const resume = await orNotFound(getResume(ctx, id));
  const target = [resume.content.meta.targetTitle, resume.content.meta.targetOrganization].filter(Boolean).join(" — ");

  return (
    <>
      <PageHeader
        title={resume.title as string}
        description={[
          target && `${t.editor.targetJob} ${target}`,
          format(t.resumes.version, { n: resume.current_version as number }),
          `${t.resumes.modified} ${formatDate(resume.updated_at as string, locale)}`,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={<ResumeActions id={id} showPreview={false} />}
      />
      <div className="mx-auto max-w-3xl">
        <ResumePreview doc={resume.content} title={resume.title as string} />
      </div>
    </>
  );
}
