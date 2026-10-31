import type { Metadata } from "next";
import { SignupForm } from "@/components/auth/auth-forms";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.auth.signUp };
}

export default function SignupPage() {
  return <SignupForm />;
}
