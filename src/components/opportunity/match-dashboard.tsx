"use client";

import { CheckCircle2, CircleDashed, HelpCircle, Lightbulb, MinusCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/config";
import type { JobAnalysis, MatchResult } from "@/lib/schemas/job";
import { Badge, Progress } from "@/components/ui/primitives";

const statusIcon = { strong: CheckCircle2, partial: CircleDashed, missing: MinusCircle };
const statusColor = { strong: "text-success", partial: "text-warning", missing: "text-danger" } as const;

export function MatchDashboard({ analysis, match }: { analysis: JobAnalysis; match: MatchResult }) {
  const { t } = useI18n();
  const reqs = new Map(analysis.requirements.map((r) => [r.id, r]));
  const s = match.score;
  const title = (id: string) => match.evidence_titles[id] ?? id;

  const coverage = (value: number | null, count: number, label: string) => (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">{value === null ? t.opportunity.noneInCategory : format(t.opportunity.coverageOf, { value, count })}</span>
      </div>
      <Progress value={value ?? 0} label={label} />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-6 rounded-xl border border-border p-5 sm:grid-cols-[180px_1fr]">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{t.opportunity.matchScore}</p>
          <p className="text-4xl font-semibold tabular-nums">{Math.round(s.overall)}%</p>
        </div>
        <div className="space-y-4">
          {coverage(s.mandatory_coverage, s.mandatory_count, t.opportunity.mandatoryCoverage)}
          {coverage(s.preferred_coverage, s.preferred_count, t.opportunity.preferredCoverage)}
          <p className="flex gap-1.5 text-xs text-muted-foreground">
            <HelpCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {t.opportunity.matchScoreNote}
          </p>
        </div>
      </div>

      {(["strong", "partial", "missing"] as const).map((status) => {
        const items = match.requirements.filter((m) => m.status === status && reqs.has(m.requirement_id));
        if (!items.length) return null;
        const Icon = statusIcon[status];
        return (
          <section key={status} className="space-y-2" aria-labelledby={`match-${status}`}>
            <h3 id={`match-${status}`} className="flex items-center gap-2 font-semibold">
              <Icon className={`size-4 ${statusColor[status]}`} aria-hidden />
              {t.enums.matchStatus[status]} ({items.length})
            </h3>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {items.map((m) => {
                const r = reqs.get(m.requirement_id)!;
                return (
                  <li key={m.requirement_id} className="space-y-1.5 p-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium" dir="auto">
                        {r.text}
                      </p>
                      <Badge tone={r.category === "mandatory" ? "accent" : "neutral"}>{t.enums.requirementCategory[r.category]}</Badge>
                    </div>
                    {m.evidence_ids.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">{t.opportunity.evidence}:</span> {m.evidence_ids.map(title).join(" · ")}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">{t.opportunity.noEvidence}</p>
                    )}
                    {m.reasoning && (
                      <p className="text-xs text-muted-foreground" dir="auto">
                        {m.reasoning}
                      </p>
                    )}
                    {m.adjusted && (
                      <Badge tone="warning">{t.opportunity.adjusted[m.adjusted as keyof typeof t.opportunity.adjusted] ?? m.adjusted}</Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold">{t.opportunity.matchedKeywords}</h3>
          <div className="flex flex-wrap gap-1.5">
            {match.supported_keywords.length ? match.supported_keywords.map((k) => <Badge key={k} tone="success" dir="auto">{k}</Badge>) : <span className="text-sm text-muted-foreground">—</span>}
          </div>
        </div>
        <div className="space-y-2 rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold">{t.opportunity.missingKeywords}</h3>
          <div className="flex flex-wrap gap-1.5">
            {match.unsupported_keywords.length ? match.unsupported_keywords.map((k) => <Badge key={k} dir="auto">{k}</Badge>) : <span className="text-sm text-muted-foreground">—</span>}
          </div>
          <p className="text-xs text-muted-foreground">{t.opportunity.missingKeywordsNote}</p>
        </div>
      </div>

      {match.recommended_evidence_ids.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{t.opportunity.relevantRecords}</h3>
          <ol className="list-decimal space-y-1 ps-5 text-sm">
            {match.recommended_evidence_ids.slice(0, 10).map((id) => (
              <li key={id}>{title(id)}</li>
            ))}
          </ol>
        </div>
      )}

      {match.clarifying_questions.length > 0 && (
        <div className="space-y-2 rounded-lg border border-accent/30 bg-accent-soft p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Lightbulb className="size-4 text-accent" aria-hidden />
            {t.opportunity.questions}
          </h3>
          <ul className="list-disc space-y-1 ps-5 text-sm" dir="auto">
            {match.clarifying_questions.map((q, i) => (
              <li key={i}>
                {q.question}
                {q.evidence_id && <span className="text-xs text-muted-foreground"> — {title(q.evidence_id)}</span>}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{t.opportunity.questionsNote}</p>
        </div>
      )}

      {match.improvement_recommendations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{t.opportunity.recommendations}</h3>
          <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground" dir="auto">
            {match.improvement_recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
