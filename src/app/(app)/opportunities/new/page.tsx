import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";
import { getPageContext } from "@/server/context";
import { getPersonal } from "@/server/profile/repository";
import { IntakeTabs } from "@/components/intake/intake-tabs";
import { ConsentNotice } from "@/components/consent-notice";
import { PageHeader } from "@/components/ui/primitives";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.intake.title };
}

export default async function NewOpportunityPage() {
  const ctx = await getPageContext("/opportunities/new");
  const { t } = await getI18n();
  const personal = await getPersonal(ctx.supabase, ctx.user.id);
  return (
    <>
      <PageHeader title={t.intake.title} description={t.intake.subtitle} />
      <div className="space-y-6">
        {!personal?.ai_consent_at && <ConsentNotice />}
        <IntakeTabs />
      </div>
    </>
  );
}
