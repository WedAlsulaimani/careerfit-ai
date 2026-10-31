import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";
import { getPageContext } from "@/server/context";
import { loadProfileForEditing } from "@/server/profile/load-all";
import { OnboardingWizard } from "@/components/profile/onboarding-wizard";
import { PageHeader } from "@/components/ui/primitives";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.onboarding.title };
}

export default async function OnboardingPage() {
  const ctx = await getPageContext("/onboarding");
  const { t } = await getI18n();
  const data = await loadProfileForEditing(ctx.supabase, ctx.user.id);
  const step = Number(data.personal?.onboarding_step ?? 1);
  return (
    <>
      <PageHeader title={t.onboarding.title} description={t.onboarding.subtitle} />
      <OnboardingWizard initialStep={step} personal={data.personal} goals={data.goals} sections={data.sections} />
    </>
  );
}
