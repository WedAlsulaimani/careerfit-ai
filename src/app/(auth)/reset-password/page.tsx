import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/auth-forms";
import { getI18n } from "@/lib/i18n/server";
import { requireUser } from "@/server/auth";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.auth.resetTitle };
}

/** Reached through the recovery link, which establishes a session first. */
export default async function ResetPasswordPage() {
  await requireUser("/reset-password");
  return <ResetPasswordForm />;
}
