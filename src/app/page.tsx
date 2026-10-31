import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  FileSearch,
  FileText,
  Languages,
  Link2,
  ListChecks,
  Lock,
  PenLine,
  ScanLine,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { getSessionUser } from "@/server/auth";
import { Brand } from "@/components/brand";
import { LanguageSwitcher } from "@/components/language-switcher";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const stepIcons = [UserRound, Link2, ListChecks, FileText];
const featureIcons = [ScanLine, FileSearch, BadgeCheck, PenLine, Languages, ListChecks];

export default async function LandingPage() {
  const { t } = await getI18n();
  const user = await getSessionUser();
  const L = t.landing;

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
        <nav aria-label={t.nav.primary} className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Brand />
          <ul className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <li><a className="hover:text-foreground" href="#how">{t.nav.product}</a></li>
            <li><a className="hover:text-foreground" href="#features">{t.nav.features}</a></li>
            <li><a className="hover:text-foreground" href="#privacy">{t.nav.privacy}</a></li>
            <li><a className="hover:text-foreground" href="#faq">{t.nav.faq}</a></li>
          </ul>
          <div className="flex items-center gap-1 sm:gap-2">
            <LanguageSwitcher />
            {user ? (
              <Link href="/dashboard" className={buttonVariants({ size: "sm" })}>
                {t.nav.dashboard}
              </Link>
            ) : (
              <>
                <Link href="/login" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden sm:inline-flex")}>
                  {t.nav.signIn}
                </Link>
                <Link href="/signup" className={buttonVariants({ size: "sm" })}>
                  {t.nav.getStarted}
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>

      <main id="main" className="flex-1">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl gap-12 px-4 pb-16 pt-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pt-24">
          <div className="space-y-6">
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground">
              <ShieldCheck className="size-3.5 text-accent" aria-hidden />
              {L.eyebrow}
            </p>
            <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight text-balance sm:text-5xl">{L.heroTitle}</h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">{L.heroBody}</p>
            <div className="flex flex-wrap gap-3">
              <Link href={user ? "/dashboard" : "/signup"} className={buttonVariants({ size: "lg" })}>
                {L.heroPrimary}
                <ArrowRight className="rtl:rotate-180" aria-hidden />
              </Link>
              <a href="#how" className={buttonVariants({ variant: "secondary", size: "lg" })}>
                {L.heroSecondary}
              </a>
            </div>
            <p className="text-sm text-muted-foreground">{L.heroNote}</p>
          </div>

          {/* Product illustration: a schematic of the real workflow, not a fake screenshot. */}
          <div aria-hidden className="relative">
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{t.nav.analyze}</span>
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-accent">{t.enums.requirementCategory.mandatory}</span>
              </div>
              <div className="space-y-2.5">
                {[t.enums.matchStatus.strong, t.enums.matchStatus.partial, t.enums.matchStatus.missing].map((label, i) => (
                  <div key={label} className="flex items-center gap-3 rounded-lg border border-border p-3">
                    <span className={cn("size-2.5 rounded-full", i === 0 ? "bg-success" : i === 1 ? "bg-warning" : "bg-danger")} />
                    <span className="h-2 flex-1 rounded bg-surface-muted" />
                    <span className="text-xs text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-lg border border-border bg-background p-4">
                <div className="mx-auto mb-3 h-2.5 w-32 rounded bg-foreground/80" />
                <div className="mx-auto mb-4 h-1.5 w-48 rounded bg-muted-foreground/40" />
                {[0, 1, 2].map((k) => (
                  <div key={k} className="mb-3 space-y-1.5">
                    <div className="h-1.5 w-24 rounded bg-foreground/60" />
                    <div className="h-px w-full bg-border" />
                    <div className="h-1.5 w-full rounded bg-muted-foreground/25" />
                    <div className="h-1.5 w-5/6 rounded bg-muted-foreground/25" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-y border-border bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{L.howTitle}</h2>
            <p className="mt-2 text-muted-foreground">{L.howBody}</p>
            <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {L.steps.map((s, i) => {
                const Icon = stepIcons[i];
                return (
                  <li key={s.title} className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-lg bg-accent-soft text-accent">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="text-sm font-medium text-muted-foreground">0{i + 1}</span>
                    </div>
                    <h3 className="font-semibold">{s.title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* Profile + tailored */}
        <section className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold tracking-tight">{L.profileTitle}</h2>
            <p className="leading-relaxed text-muted-foreground">{L.profileBody}</p>
            <ul className="space-y-2">
              {L.profilePoints.map((p) => (
                <li key={p} className="flex gap-2 text-sm">
                  <BadgeCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold tracking-tight">{L.tailoredTitle}</h2>
            <p className="leading-relaxed text-muted-foreground">{L.tailoredBody}</p>
            <h3 className="pt-2 text-lg font-semibold">{L.truthTitle}</h3>
            <p className="leading-relaxed text-muted-foreground">{L.truthBody}</p>
          </div>
        </section>

        {/* ATS */}
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
            <h2 className="text-xl font-semibold tracking-tight">{L.atsTitle}</h2>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {L.atsPoints.map((p) => (
                <li key={p} className="flex gap-2 text-sm">
                  <FileText className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-xs text-muted-foreground">{L.atsNote}</p>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-y border-border bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{L.featuresTitle}</h2>
            <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {L.features.map((f, i) => {
                const Icon = featureIcons[i];
                return (
                  <div key={f.title} className="space-y-2">
                    <Icon className="size-5 text-accent" aria-hidden />
                    <h3 className="font-semibold">{f.title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Privacy */}
        <section id="privacy" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="space-y-3">
              <Lock className="size-6 text-accent" aria-hidden />
              <h2 className="text-2xl font-semibold tracking-tight">{L.privacyTitle}</h2>
            </div>
            <ul className="space-y-3">
              {L.privacyPoints.map((p) => (
                <li key={p} className="flex gap-3 rounded-lg border border-border bg-surface p-4 text-sm">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-t border-border bg-surface">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight">{L.faqTitle}</h2>
            <div className="mt-8 divide-y divide-border rounded-xl border border-border">
              {L.faqs.map((f) => (
                <details key={f.q} className="group p-4 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                    {f.q}
                    <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-6 rounded-2xl bg-foreground p-8 text-background sm:flex-row sm:items-center">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">{L.ctaTitle}</h2>
              <p className="text-sm opacity-80">{L.ctaBody}</p>
            </div>
            <Link href={user ? "/dashboard" : "/signup"} className={buttonVariants({ size: "lg" })}>
              {t.nav.getStarted}
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Brand />
          <p className="max-w-xl">{L.footerNote}</p>
          <p dir="ltr">© {new Date().getFullYear()} CareerFit AI</p>
        </div>
      </footer>
    </>
  );
}
