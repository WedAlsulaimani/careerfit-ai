import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";
import { getPageContext } from "@/server/context";
import { loadProfileForEditing } from "@/server/profile/load-all";
import { SECTIONS, SECTION_KEYS } from "@/lib/profile/sections";
import { PersonalForm } from "@/components/profile/personal-form";
import { GoalsForm } from "@/components/profile/goals-form";
import { SectionEditor } from "@/components/profile/section-editor";
import { PageHeader } from "@/components/ui/primitives";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.profile.editAll };
}

export default async function ProfileEditPage() {
  const ctx = await getPageContext("/profile/edit");
  const { t } = await getI18n();
  const data = await loadProfileForEditing(ctx.supabase, ctx.user.id);
  const ordered = [...SECTION_KEYS].sort((a, b) => SECTIONS[a].wizardStep - SECTIONS[b].wizardStep);

  return (
    <>
      <PageHeader title={t.profile.editAll} description={t.profile.subtitle} />
      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <nav aria-label={t.profile.sectionsNav} className="hidden lg:block">
          <ul className="sticky top-8 space-y-1 text-sm">
            <li><a href="#personal" className="block rounded-md px-2 py-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground">{t.profile.personal.title}</a></li>
            <li><a href="#goals" className="block rounded-md px-2 py-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground">{t.profile.goals.title}</a></li>
            {ordered.map((k) => (
              <li key={k}>
                <a href={`#section-${k}`} className="block rounded-md px-2 py-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground">
                  {t.profile.sections[k].title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-6">
          <div id="personal" className="scroll-mt-20"><PersonalForm initial={data.personal} /></div>
          <div id="goals" className="scroll-mt-20"><GoalsForm initial={data.goals} /></div>
          {ordered.map((k) => (
            <div key={k} className="scroll-mt-20">
              <SectionEditor sectionKey={k} initialEntries={data.sections[k]} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
