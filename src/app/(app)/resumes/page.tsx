import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/config";
import { getPageContext } from "@/server/context";
import { listResumes } from "@/server/services/resumes";
import { buttonVariants } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { ResumeActions } from "@/components/resume/resume-actions";
import { formatDate } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.resumes.title };
}

export default async function ResumesPage() {
  const ctx = await getPageContext("/resumes");
  const { t, locale } = await getI18n();
  const resumes = await listResumes(ctx);

  return (
    <>
      <PageHeader title={t.resumes.title} description={t.resumes.subtitle} />
      {resumes.length === 0 ? (
        <EmptyState
          icon={<FileText aria-hidden />}
          title={t.resumes.empty}
          action={
            <Link href="/opportunities/new" className={buttonVariants({ size: "sm" })}>
              {t.resumes.emptyCta}
            </Link>
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {resumes.map((r) => {
              const job = (Array.isArray(r.job_opportunities) ? r.job_opportunities[0] : r.job_opportunities) as { title?: string; organization?: string } | null;
              return (
                <li key={r.id as string} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 space-y-1">
                    <Link href={`/resumes/${r.id}/edit`} className="block truncate font-medium hover:text-accent" dir="auto">
                      {r.title as string}
                    </Link>
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {job?.title && (
                        <span dir="auto">
                          {t.resumes.relatedJob}: {[job.title, job.organization].filter(Boolean).join(" — ")}
                        </span>
                      )}
                      <Badge>{t.enums.resumeLanguage[r.language as "en" | "ar"]}</Badge>
                      <span>{format(t.resumes.version, { n: r.current_version as number })}</span>
                      <span>
                        {t.resumes.generated} {formatDate(r.created_at as string, locale)}
                      </span>
                      <span>
                        {t.resumes.modified} {formatDate(r.updated_at as string, locale)}
                      </span>
                    </p>
                  </div>
                  <ResumeActions id={r.id as string} />
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
