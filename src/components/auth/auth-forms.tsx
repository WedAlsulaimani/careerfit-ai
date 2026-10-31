"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MailCheck } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/config";
import { safeNextPath } from "@/lib/auth-redirect";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { Alert, Card, CardContent, CardDescription, CardHeader } from "@/components/ui/primitives";

const passwordRule = z
  .string()
  .min(8, "weakPassword")
  .max(72, "weakPassword")
  .refine((p) => /[A-Za-z؀-ۿ]/.test(p) && /\d/.test(p), "weakPassword");

function useSupabase() {
  try {
    return createSupabaseBrowserClient();
  } catch {
    return null;
  }
}

function AuthCard({ title, body, children, footer }: { title: string; body: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <h1 className="text-xl font-semibold leading-tight">{title}</h1>
        <CardDescription>{body}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
      {footer && <div className="border-t border-border px-5 py-4 text-center text-sm text-muted-foreground">{footer}</div>}
    </Card>
  );
}

const authMessage = (t: ReturnType<typeof useI18n>["t"], key: string | undefined) =>
  key ? ((t.auth as Record<string, string>)[key] ?? (t.errors as Record<string, string>)[key] ?? key) : undefined;

export function LoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const supabase = useSupabase();
  const [error, setError] = useState<string | null>(params.get("error") === "auth_link" ? t.auth.authLinkError : null);
  const schema = z.object({ email: z.email("invalidEmail"), password: z.string().min(1, "fieldRequired") });
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    if (!supabase) return setError(t.auth.notConfigured);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword(values);
    if (err) {
      setError(err.code === "email_not_confirmed" ? t.auth.emailNotConfirmed : t.auth.invalidCredentials);
      return;
    }
    router.replace(safeNextPath(params.get("next"), "/dashboard"));
    router.refresh();
  });

  return (
    <AuthCard
      title={t.auth.signInTitle}
      body={t.auth.signInBody}
      footer={
        <>
          {t.auth.noAccount}{" "}
          <Link href="/signup" className="font-medium text-accent hover:underline">
            {t.auth.signUp}
          </Link>
        </>
      }
    >
      {!supabase && <Alert tone="warning">{t.auth.notConfigured}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field id="email" label={t.auth.email} error={authMessage(t, errors.email?.message)} required>
          <Input id="email" type="email" autoComplete="email" dir="ltr" aria-invalid={!!errors.email} {...form.register("email")} />
        </Field>
        <Field id="password" label={t.auth.password} error={authMessage(t, errors.password?.message)} required>
          <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...form.register("password")} />
        </Field>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm text-accent hover:underline">
            {t.auth.forgotLink}
          </Link>
        </div>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          {t.auth.signIn}
        </Button>
      </form>
    </AuthCard>
  );
}

export function SignupForm() {
  const { t } = useI18n();
  const router = useRouter();
  const supabase = useSupabase();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const schema = z
    .object({
      fullName: z.string().trim().min(1, "fieldRequired").max(200),
      email: z.email("invalidEmail"),
      password: passwordRule,
      confirm: z.string(),
    })
    .refine((v) => v.password === v.confirm, { message: "passwordMismatch", path: ["confirm"] });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: "", email: "", password: "", confirm: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    if (!supabase) return setError(t.auth.notConfigured);
    setError(null);
    const { data, error: err } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: { full_name: values.fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
      },
    });
    if (err) {
      setError(err.code === "weak_password" ? t.auth.weakPassword : t.common.errorGeneric);
      return;
    }
    if (data.session) {
      router.replace("/onboarding");
      router.refresh();
    } else {
      setSentTo(values.email);
    }
  });

  if (sentTo) {
    return (
      <AuthCard title={t.auth.checkEmailTitle} body={format(t.auth.checkEmailBody, { email: sentTo })}>
        <div className="flex justify-center py-4 text-accent">
          <MailCheck className="size-10" aria-hidden />
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t.auth.signUpTitle}
      body={t.auth.signUpBody}
      footer={
        <>
          {t.auth.haveAccount}{" "}
          <Link href="/login" className="font-medium text-accent hover:underline">
            {t.auth.signIn}
          </Link>
        </>
      }
    >
      {!supabase && <Alert tone="warning">{t.auth.notConfigured}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field id="fullName" label={t.auth.fullName} error={authMessage(t, errors.fullName?.message)} required>
          <Input id="fullName" autoComplete="name" aria-invalid={!!errors.fullName} {...form.register("fullName")} />
        </Field>
        <Field id="email" label={t.auth.email} error={authMessage(t, errors.email?.message)} required>
          <Input id="email" type="email" autoComplete="email" dir="ltr" aria-invalid={!!errors.email} {...form.register("email")} />
        </Field>
        <Field id="password" label={t.auth.password} help={t.auth.passwordHint} error={authMessage(t, errors.password?.message)} required>
          <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...form.register("password")} />
        </Field>
        <Field id="confirm" label={t.auth.confirmPassword} error={authMessage(t, errors.confirm?.message)} required>
          <Input id="confirm" type="password" autoComplete="new-password" aria-invalid={!!errors.confirm} {...form.register("confirm")} />
        </Field>
        <p className="text-xs text-muted-foreground">{t.auth.termsNote}</p>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          {t.auth.signUp}
        </Button>
      </form>
    </AuthCard>
  );
}

export function ForgotPasswordForm() {
  const { t } = useI18n();
  const supabase = useSupabase();
  const [done, setDone] = useState(false);
  const schema = z.object({ email: z.email("invalidEmail") });
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: "" } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ email }) => {
    if (!supabase) return;
    // The response is identical whether or not the account exists (no account enumeration).
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setDone(true);
  });

  return (
    <AuthCard
      title={t.auth.forgotTitle}
      body={t.auth.forgotBody}
      footer={
        <Link href="/login" className="font-medium text-accent hover:underline">
          {t.auth.signIn}
        </Link>
      }
    >
      {!supabase && <Alert tone="warning">{t.auth.notConfigured}</Alert>}
      {done ? (
        <Alert tone="success">{t.auth.resetSent}</Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field id="email" label={t.auth.email} error={authMessage(t, errors.email?.message)} required>
            <Input id="email" type="email" autoComplete="email" dir="ltr" aria-invalid={!!errors.email} {...form.register("email")} />
          </Field>
          <Button type="submit" className="w-full" loading={isSubmitting} disabled={!supabase}>
            {t.auth.sendReset}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

export function ResetPasswordForm() {
  const { t } = useI18n();
  const router = useRouter();
  const supabase = useSupabase();
  const [error, setError] = useState<string | null>(null);
  const schema = z
    .object({ password: passwordRule, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "passwordMismatch", path: ["confirm"] });
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { password: "", confirm: "" } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ password }) => {
    if (!supabase) return;
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setError(err.code === "weak_password" ? t.auth.weakPassword : t.auth.authLinkError);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  });

  return (
    <AuthCard title={t.auth.resetTitle} body={t.auth.resetBody}>
      {error && <Alert tone="danger">{error}</Alert>}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field id="password" label={t.auth.newPassword} help={t.auth.passwordHint} error={authMessage(t, errors.password?.message)} required>
          <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...form.register("password")} />
        </Field>
        <Field id="confirm" label={t.auth.confirmPassword} error={authMessage(t, errors.confirm?.message)} required>
          <Input id="confirm" type="password" autoComplete="new-password" aria-invalid={!!errors.confirm} {...form.register("confirm")} />
        </Field>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          {t.auth.updatePassword}
        </Button>
      </form>
    </AuthCard>
  );
}
