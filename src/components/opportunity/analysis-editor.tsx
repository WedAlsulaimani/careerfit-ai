"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Plus, Quote, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { api, errorMessage } from "@/lib/api-client";
import { REQUIREMENT_CATEGORIES, REQUIREMENT_TYPES, jobAnalysisSchema, type JobAnalysis, type Requirement } from "@/lib/schemas/job";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Alert, Badge } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

type ListKey = "responsibilities" | "ats_keywords" | "tools" | "domain_terms" | "eligibility";
const SCALARS = ["title", "employer", "industry", "employment_type", "location", "seniority", "deadline"] as const;

/** Review/edit the AI's structured analysis, then approve it (a new version is stored each time). */
export function AnalysisEditor({
  opportunityId,
  initial,
  approved,
  onSaved,
}: {
  opportunityId: string;
  initial: JobAnalysis;
  approved: boolean;
  onSaved: (analysis: JobAnalysis, approved: boolean) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [a, setA] = useState<JobAnalysis>(initial);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"save" | "approve" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = (patch: Partial<JobAnalysis>) => {
    setA((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };
  const updateReq = (id: string, patch: Partial<Requirement>) =>
    update({ requirements: a.requirements.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const removeReq = (id: string) => update({ requirements: a.requirements.filter((r) => r.id !== id) });
  const addReq = () => {
    const next = Math.max(0, ...a.requirements.map((r) => Number(r.id.slice(1)))) + 1;
    update({
      requirements: [
        ...a.requirements,
        { id: `r${next}`, text: "", category: "mandatory", type: "technical_skill", keywords: [], source_quote: null, quote_verified: true },
      ],
    });
  };
  const listText = (k: ListKey) => a[k].join("\n");
  const setList = (k: ListKey, v: string) => update({ [k]: v.split("\n").map((s) => s.trim()).filter(Boolean) } as Partial<JobAnalysis>);

  const save = async (approve: boolean) => {
    setError(null);
    const cleaned = { ...a, requirements: a.requirements.filter((r) => r.text.trim()) };
    const parsed = jobAnalysisSchema.safeParse(cleaned);
    if (!parsed.success) {
      setError(t.errors.validation);
      return;
    }
    setBusy(approve ? "approve" : "save");
    try {
      await api(`/api/opportunities/${opportunityId}/analysis`, { method: "PUT", body: { analysis: parsed.data, approve } });
      setA(parsed.data);
      setDirty(false);
      onSaved(parsed.data, approve);
      toast.success(t.common.saved);
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setBusy(null);
    }
  };

  const grouped = REQUIREMENT_CATEGORIES.map((c) => ({ category: c, items: a.requirements.filter((r) => r.category === c) }));

  return (
    <div className="space-y-6">
      {a.uncertain_fields.length > 0 && (
        <Alert tone="warning" title={t.opportunity.uncertain}>
          <ul className="list-disc space-y-0.5 ps-4">
            {a.uncertain_fields.map((u, i) => (
              <li key={i}>
                <span className="font-medium">{u.field}</span>: {u.reason}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {SCALARS.map((k) => (
          <Field key={k} id={`an-${k}`} label={t.opportunity.fields[k]}>
            <Input
              id={`an-${k}`}
              type={k === "deadline" ? "date" : "text"}
              dir="auto"
              value={a[k] ?? ""}
              onChange={(e) => update({ [k]: e.target.value || null } as Partial<JobAnalysis>)}
            />
          </Field>
        ))}
        <Field id="an-summary" label={t.opportunity.fields.summary} className="sm:col-span-2">
          <Textarea id="an-summary" rows={3} dir="auto" value={a.summary ?? ""} onChange={(e) => update({ summary: e.target.value || null })} />
        </Field>
      </div>

      <section className="space-y-4" aria-labelledby="req-heading">
        <div className="flex items-center justify-between gap-2">
          <h3 id="req-heading" className="font-semibold">
            {t.opportunity.requirements} ({a.requirements.length})
          </h3>
          <Button size="sm" variant="secondary" onClick={addReq}>
            <Plus aria-hidden />
            {t.opportunity.addRequirement}
          </Button>
        </div>
        {grouped.map(({ category, items }) =>
          items.length === 0 ? null : (
            <div key={category} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.enums.requirementCategory[category]}</p>
              <ul className="space-y-2">
                {items.map((r) => (
                  <li key={r.id} className="space-y-2 rounded-lg border border-border p-3">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Textarea
                        aria-label={t.opportunity.requirementText}
                        rows={2}
                        dir="auto"
                        value={r.text}
                        onChange={(e) => updateReq(r.id, { text: e.target.value })}
                        className="flex-1"
                      />
                      <div className="flex gap-2 sm:w-72 sm:flex-col">
                        <Select aria-label={t.opportunity.requirements} value={r.category} onChange={(e) => updateReq(r.id, { category: e.target.value as Requirement["category"] })}>
                          {REQUIREMENT_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {t.enums.requirementCategory[c]}
                            </option>
                          ))}
                        </Select>
                        <Select aria-label={t.opportunity.requirementText} value={r.type} onChange={(e) => updateReq(r.id, { type: e.target.value as Requirement["type"] })}>
                          {REQUIREMENT_TYPES.map((c) => (
                            <option key={c} value={c}>
                              {t.enums.requirementType[c]}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Input
                        aria-label={t.opportunity.keywords}
                        placeholder={t.opportunity.keywords}
                        dir="auto"
                        value={r.keywords.join(", ")}
                        onChange={(e) => updateReq(r.id, { keywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 15) })}
                      />
                      <Button size="sm" variant="ghost" onClick={() => removeReq(r.id)} aria-label={t.opportunity.removeRequirement}>
                        <Trash2 className="text-danger" aria-hidden />
                      </Button>
                    </div>
                    {r.source_quote && (
                      <p className="flex gap-1.5 text-xs text-muted-foreground" dir="auto">
                        <Quote className="mt-0.5 size-3 shrink-0" aria-hidden />
                        <span>
                          <span className="font-medium">{t.opportunity.quote}:</span> “{r.source_quote}”
                        </span>
                      </p>
                    )}
                    {!r.quote_verified && (
                      <Badge tone="warning">
                        <AlertTriangle className="size-3" aria-hidden />
                        {t.opportunity.quoteUnverified}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ),
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        {(
          [
            ["responsibilities", t.opportunity.responsibilities],
            ["ats_keywords", t.opportunity.atsKeywords],
            ["tools", t.opportunity.tools],
            ["domain_terms", t.opportunity.domainTerms],
            ["eligibility", t.opportunity.eligibility],
          ] as [ListKey, string][]
        ).map(([k, label]) => (
          <Field key={k} id={`an-${k}`} label={label} help={t.profile.linesHint} className={k === "responsibilities" ? "sm:col-span-2" : undefined}>
            <Textarea id={`an-${k}`} rows={k === "responsibilities" ? 5 : 4} dir="auto" value={listText(k)} onChange={(e) => setList(k, e.target.value)} />
          </Field>
        ))}
      </div>

      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
        {approved && !dirty && (
          <Badge tone="success" className="me-auto">
            <CheckCircle2 className="size-3" aria-hidden />
            {t.opportunity.approved}
          </Badge>
        )}
        <Button variant="secondary" onClick={() => save(false)} loading={busy === "save"} disabled={!dirty || busy !== null}>
          {t.opportunity.saveDraft}
        </Button>
        <Button onClick={() => save(true)} loading={busy === "approve"} disabled={busy !== null || (approved && !dirty)}>
          {approved ? t.opportunity.approveAgain : t.opportunity.approve}
        </Button>
      </div>
    </div>
  );
}
