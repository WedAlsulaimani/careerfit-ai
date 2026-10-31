"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Briefcase, FileText, LayoutDashboard, ListChecks, LogOut, Menu, Settings, Sparkles, UserRound, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Brand } from "@/components/brand";
import { LanguageSwitcher } from "@/components/language-switcher";
import { cn } from "@/lib/utils";

export function AppShell({ email, children }: { email: string | null; children: ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  // The mobile menu is "open for a pathname", so navigating closes it without an effect.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;

  const items = [
    { href: "/dashboard", label: t.nav.dashboard, icon: LayoutDashboard },
    { href: "/profile", label: t.nav.profile, icon: UserRound },
    { href: "/opportunities/new", label: t.nav.analyze, icon: Sparkles },
    { href: "/opportunities", label: t.nav.opportunities, icon: Briefcase },
    { href: "/resumes", label: t.nav.resumes, icon: FileText },
    { href: "/applications", label: t.nav.applications, icon: ListChecks },
    { href: "/settings", label: t.nav.settings, icon: Settings },
  ];
  const isActive = (href: string) =>
    href === "/opportunities" ? pathname === href || (/^\/opportunities\/(?!new)/.test(pathname)) : pathname === href || pathname.startsWith(`${href}/`);

  const signOut = async () => {
    try {
      await createSupabaseBrowserClient().auth.signOut();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  };

  const nav = (
    <nav aria-label={t.nav.primary} className="flex flex-1 flex-col gap-1">
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
            isActive(href) ? "bg-accent-soft font-medium text-accent" : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );

  const footer = (
    <div className="space-y-2 border-t border-border pt-3">
      {email && (
        <p className="truncate px-3 text-xs text-muted-foreground" dir="ltr" title={email}>
          {email}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <LanguageSwitcher persistToProfile />
        <button
          type="button"
          onClick={signOut}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted-foreground hover:bg-surface-muted hover:text-foreground"
        >
          <LogOut className="size-4 rtl:rotate-180" aria-hidden />
          {t.nav.signOut}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 border-e border-border bg-surface p-4 lg:flex">
        <div className="px-2 pt-1">
          <Brand href="/dashboard" />
        </div>
        {nav}
        {footer}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface/90 px-4 backdrop-blur lg:hidden">
          <Brand href="/dashboard" />
          <button
            type="button"
            onClick={() => setOpenAt(open ? null : pathname)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={t.common.menu}
            className="rounded-md p-2 hover:bg-surface-muted"
          >
            {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </header>
        {open && (
          <div id="mobile-nav" className="flex flex-col gap-4 border-b border-border bg-surface p-4 lg:hidden">
            {nav}
            {footer}
          </div>
        )}
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
