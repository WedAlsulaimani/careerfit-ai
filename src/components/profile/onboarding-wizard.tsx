"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/config";
import { api } from "@/lib/api-client";
import { SECTIONS, WIZARD_STEPS, type SectionKey } from "@/lib/profile/sections";
import type { Row } from "@/lib/evidence/catalog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Progress } from "@/components/ui/primitives";
import { PersonalForm } from "./personal-form";
import { GoalsForm } from "./goals-form";
import { SectionEditor } from "./section-editor";
import { cn } from "@/lib/utils";

export function OnboardingWizard({
  initialStep,
  personal,
  goals,
  sections,
}: {
  initialStep: number;
  personal: Record<string, unknown> | null;
  goals: Record<string, unknown> | null;
  sections: Record<SectionKey, Row[]>;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const total = WIZARD_STEPS.length;
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 1), total));
  const [finishing, setFinishing] = useState(false);
  // Latest saved data per step, so revisiting a step never shows stale values.
  const [personalState, setPersonalState] = useState(personal);
  const [goalsState, setGoalsState] = useState(goals);
  const [sectionsState, setSectionsState] = useState(sections);
  const current = WIZARD_STEPS[step - 1];

  const stepTitle = (i: number) => {
    const s = WIZARD_STEPS[i];
    if (s.kind === "personal") return t.profile.personal.title;
    if (s.kind === "goals") return t.profile.goals.title;
    if (s.kind === "section") return t.profile.sections[s.key].title;
    return t.onboarding.reviewTitle;
  };

  const go = (n: number) => {
    const next = Math.min(Math.max(n, 1), total);
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
    // Progress is persisted so the user can continue later from any device.
    void api("/api/profile/flags", { body: { onboarding_step: next } }).catch(() => undefined);
  };

  const finish = async () => {
    setFinishing(true);
    try {
      await api("/api/profile/flags", { body: { onboarding_complete: true, onboarding_step: total } });
    } finally {
      router.push("/dashboard");
      router.refresh();
    }
  };

  const saveLater = async () => {
    await api("/api/profile/flags", { body: { onboarding_step: step } }).catch(() => undefined);
    router.push("/dashboard");
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
      <aside className="hidden lg:block">
        <ol className="sticky top-8 space-y-1 text-sm">
          {WIZARD_STEPS.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => go(i + 1)}
                aria-current={i + 1 === step ? "step" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start",
                  i + 1 === step ? "bg-accent-soft font-medium text-accent" : "text-muted-foreground hover:bg-surface-muted",
                )}
              >
                {i + 1 < step ? <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden /> : <Circle className="size-4 shrink-0" aria-hidden />}
                <span className="truncate">{stepTitle(i)}</span>
              </button>
            </li>
          ))}
        </ol>
      </aside>

      <div className="min-w-0 space-y-6">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{format(t.onboarding.stepOf, { current: step, total })}</p>
          <Progress value={(step / total) * 100} label={format(t.onboarding.stepOf, { current: step, total })} />
        </div>

        {current.kind === "personal" && <PersonalForm initial={personalState} onSaved={setPersonalState} />}
        {current.kind === "goals" && <GoalsForm initial={goalsState} onSaved={setGoalsState} />}
        {current.kind === "section" && (
          <SectionEditor
            key={current.key}
            sectionKey={current.key}
            initialEntries={sectionsState[current.key]}
            onEntriesChange={(entries) => setSectionsState((prev) => ({ ...prev, [current.key]: entries }))}
          />
        )}
        {current.kind === "review" && <ReviewStep sections={sectionsState} personal={personalState} goals={goalsState} onJump={go} />}

        <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" onClick={saveLater}>
            {t.onboarding.saveLater}
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => go(step - 1)} disabled={step === 1}>
              <ArrowLeft className="rtl:rotate-180" aria-hidden />
              {t.common.back}
            </Button>
            {current.kind === "review" ? (
              <Button onClick={finish} loading={finishing}>
                {t.onboarding.finish}
              </Button>
            ) : (
              <>
                {current.kind === "section" && (
                  <Button variant="secondary" onClick={() => go(step + 1)}>
                    {t.common.skip}
                  </Button>
                )}
                <Button onClick={() => go(step + 1)}>
                  {t.common.next}
                  <ArrowRight className="rtl:rotate-180" aria-hidden />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewStep({
  sections,
  personal,
  goals,
  onJump,
}: {
  sections: Record<SectionKey, Row[]>;
  personal: Record<string, unknown> | null;
  goals: Record<string, unknown> | null;
  onJump: (step: number) => void;
}) {
  const { t } = useI18n();
  const personalDone = Boolean(personal?.full_name_en || personal?.full_name_ar);
  const goalsDone = Array.isArray(goals?.target_titles) && (goals!.target_titles as unknown[]).length > 0;
  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{t.onboarding.reviewTitle}</h2>
          <p className="text-sm text-muted-foreground">{t.onboarding.reviewBody}</p>
        </div>
        <ul className="divide-y divide-border rounded-lg border border-border">
          <li className="flex items-center justify-between gap-3 p-3 text-sm">
            <button type="button" className="text-start font-medium hover:underline" onClick={() => onJump(1)}>
              {t.profile.personal.title}
            </button>
            <span className={personalDone ? "text-success" : "text-muted-foreground"}>{personalDone ? t.onboarding.complete : t.common.notSet}</span>
          </li>
          <li className="flex items-center justify-between gap-3 p-3 text-sm">
            <button type="button" className="text-start font-medium hover:underline" onClick={() => onJump(2)}>
              {t.profile.goals.title}
            </button>
            <span className={goalsDone ? "text-success" : "text-muted-foreground"}>{goalsDone ? t.onboarding.complete : t.common.notSet}</span>
          </li>
          {(Object.keys(SECTIONS) as SectionKey[]).map((key) => {
            const count = sections[key]?.length ?? 0;
            return (
              <li key={key} className="flex items-center justify-between gap-3 p-3 text-sm">
                <button type="button" className="text-start font-medium hover:underline" onClick={() => onJump(SECTIONS[key].wizardStep)}>
                  {t.profile.sections[key].title}
                </button>
                <span className={count ? "text-success" : "text-muted-foreground"}>
                  {count ? format(t.onboarding.entries, { count }) : t.onboarding.noEntries}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
