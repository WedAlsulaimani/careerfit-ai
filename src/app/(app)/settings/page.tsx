import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";
import { getPageContext } from "@/server/context";
import { getPersonal } from "@/server/profile/repository";
import { SettingsPanels } from "@/components/settings-panels";
import { PageHeader } from "@/components/ui/primitives";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.settings.title };
}

export default async function SettingsPage() {
  const ctx = await getPageContext("/settings");
  const { t } = await getI18n();
  const [personal, { data: attachments }] = await Promise.all([
    getPersonal(ctx.supabase, ctx.user.id),
    ctx.supabase.from("attachments").select("id, file_name, size_bytes, created_at").order("created_at", { ascending: false }),
  ]);
  return (
    <>
      <PageHeader title={t.settings.title} />
      <SettingsPanels
        aiConsentAt={(personal?.ai_consent_at as string | null) ?? null}
        attachments={(attachments ?? []) as { id: string; file_name: string; size_bytes: number; created_at: string }[]}
      />
    </>
  );
}
