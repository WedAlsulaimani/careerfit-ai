"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, FileText, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import type { JobAnalysis, MatchResult } from "@/lib/schemas/job";
import { APPLICATION_STATUSES } from "@/lib/schemas/application";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { ConsentNotice } from "@/components/consent-notice";
import { AnalysisEditor } from "./analysis-editor";
import { MatchDashboard } from "./match-dashboard";

export interface WorkspaceProps {
  opportunity: { id: string; title: string | null; organization: string | null; source_type: string; source_url: string | null; status: string; created_at: string };
  sourceText: string | null;
  sourceMeta: Record<string, unknown> | null;
  analysis: { analysis: JobAnalysis; approved_at: string | null; created_at: string } | null;
  match: { result: MatchResult; created_at: string } | null;
  application: { status: string; applied_on: string | null; notes: string | null } | null;
  resumes: { id: string; title: string; language: string; updated_at: string }[];
  aiConsent: boolean;
}

export function OpportunityWorkspace(props: WorkspaceProps) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { opportunity } = props;

  const [analysis, setAnalysis] = useState(props.analysis);
  const match = props.match;
  const [busy, setBusy] = useState<"analyze" | "match" | "generate" | "delete" | null>(null);
  const [error, setError] = useState<{ where: string; message: string; code?: string } | null>(null);
  const [consent, setConsent] = useState(props.aiConsent);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [gen, setGen] = useState({ language: locale as "en" | "ar", length: "one_page", layout: "classic" });
  const autoRan = useRef(false);

  const fail = (where: string, err: unknown) =>
    setError({ where, message: errorMessage(err, t), code: err instanceof ApiError ? err.code : undefined });

  const analyze = async () => {
    setError(null);
    setBusy("analyze");
    try {
      await api(`/api/opportunities/${opportunity.id}/analyze`, { method: "POST" });
      router.replace(`/opportunities/${opportunity.id}`);
      router.refresh();
    } catch (err) {
      fail("analysis", err);
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (!autoRan.current && params.get("autoAnalyze") === "1" && !props.analysis && consent) {
      autoRan.current = true;
      void analyze();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consent]);

  const runMatch = async () => {
    setError(null);
    setBusy("match");
    try {
      await api(`/api/opportunities/${opportunity.id}/match`, { method: "POST" });
      router.refresh();
    } catch (err) {
      fail("match", err);
    } finally {
      setBusy(null);
    }
  };

  const generate = async () => {
    setError(null);
    setBusy("generate");
    try {
      const res = await api<{ resume: { id: string } }>("/api/resumes", { body: { opportunityId: opportunity.id, ...gen } });
      router.push(`/resumes/${res.resume.id}/edit`);
    } catch (err) {
      fail("generate", err);
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("delete");
    try {
      await api(`/api/opportunities/${opportunity.id}`, { method: "DELETE" });
      router.push("/opportunities");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, t));
      setBusy(null);
    }
  };

  const approved = Boolean(analysis?.approved_at);
  const errorFor = (where: string) =>
    error?.where === where ? (
      error.code === "ai_consent_required" ? (
        <ConsentNotice onAccepted={() => { setConsent(true); setError(null); }} />
      ) : (
        <Alert tone="danger">{error.message}</Alert>
      )
    ) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight" dir="auto">
            {opportunity.title || t.opportunity.untitled}
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {opportunity.organization && <span dir="auto">{opportunity.organization}</span>}
            <Badge>{t.enums.sourceType[opportunity.source_type as keyof typeof t.enums.sourceType]}</Badge>
            <Badge tone={opportunity.status === "matched" ? "success" : opportunity.status === "failed" ? "danger" : "neutral"}>
              {t.enums.opportunityStatus[opportunity.status as keyof typeof t.enums.opportunityStatus]}
            </Badge>
            <span>{formatDate(opportunity.created_at, locale)}</span>
          </p>
        </div>
        <div className="flex gap-2">
          {opportunity.source_url && (
            <a href={opportunity.source_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-surface-muted">
              <ExternalLink className="size-4" aria-hidden />
              {t.opportunity.original}
            </a>
          )}
          <Button variant="ghost" size="icon" aria-label={t.common.delete} onClick={() => setConfirmDelete(true)}>
            <Trash2 className="text-danger" aria-hidden />
          </Button>
        </div>
      </div>

      {!consent && <ConsentNotice onAccepted={() => setConsent(true)} />}

      {/* Step 1: analysis */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle>{t.opportunity.steps.review}</CardTitle>
            <CardDescription>{t.opportunity.analysisHelp}</CardDescription>
          </div>
          {analysis && (
            <Button size="sm" variant="secondary" onClick={analyze} loading={busy === "analyze"} disabled={!consent || busy !== null}>
              <RefreshCw aria-hidden />
              {t.opportunity.reanalyze}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {errorFor("analysis")}
          {busy === "analyze" && <Alert tone="info">{t.intake.analyzing}</Alert>}
          {!analysis && busy !== "analyze" && (
            <Button onClick={analyze} disabled={!consent}>
              <Sparkles aria-hidden />
              {t.opportunity.analyzeNow}
            </Button>
          )}
          {analysis && (
            <AnalysisEditor
              key={analysis.created_at}
              opportunityId={opportunity.id}
              initial={analysis.analysis}
              approved={approved}
              onSaved={(a, ok) => {
                setAnalysis((prev) => (prev ? { ...prev, analysis: a, approved_at: ok ? new Date().toISOString() : null } : prev));
                router.refresh();
              }}
            />
          )}
        </CardContent>
      </Card>

      {/* Step 2: match */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
          <CardTitle>{t.opportunity.steps.match}</CardTitle>
          <Button size="sm" onClick={runMatch} loading={busy === "match"} disabled={!approved || !consent || busy !== null}>
            {match ? t.opportunity.rerunMatch : t.opportunity.runMatch}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {!approved && <p className="text-sm text-muted-foreground">{t.opportunity.needsApproval}</p>}
          {errorFor("match")}
          {busy === "match" && <Alert tone="info">{t.opportunity.matching}</Alert>}
          {match && analysis && <MatchDashboard analysis={analysis.analysis} match={match.result} />}
        </CardContent>
      </Card>

      {/* Step 3: generate */}
      <Card>
        <CardHeader>
          <CardTitle>{t.opportunity.steps.generate}</CardTitle>
          <CardDescription>{t.opportunity.generateHelp}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!match && <p className="text-sm text-muted-foreground">{t.opportunity.needsMatch}</p>}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="gen-lang" label={t.opportunity.resumeLanguage}>
              <Select id="gen-lang" value={gen.language} onChange={(e) => setGen((g) => ({ ...g, language: e.target.value as "en" | "ar" }))}>
                <option value="en">{t.enums.resumeLanguage.en}</option>
                <option value="ar">{t.enums.resumeLanguage.ar}</option>
              </Select>
            </Field>
            <Field id="gen-length" label={t.opportunity.resumeLength}>
              <Select id="gen-length" value={gen.length} onChange={(e) => setGen((g) => ({ ...g, length: e.target.value }))}>
                <option value="one_page">{t.enums.resumeLength.one_page}</option>
                <option value="two_pages">{t.enums.resumeLength.two_pages}</option>
              </Select>
            </Field>
            <Field id="gen-layout" label={t.opportunity.resumeLayout}>
              <Select id="gen-layout" value={gen.layout} onChange={(e) => setGen((g) => ({ ...g, layout: e.target.value }))}>
                <option value="classic">{t.enums.resumeLayout.classic}</option>
                <option value="compact">{t.enums.resumeLayout.compact}</option>
              </Select>
            </Field>
          </div>
          {errorFor("generate")}
          {busy === "generate" && <Alert tone="info">{t.opportunity.generating}</Alert>}
          <Button onClick={generate} loading={busy === "generate"} disabled={!match || !consent || busy !== null}>
            <FileText aria-hidden />
            {t.opportunity.generate}
          </Button>
          {props.resumes.length > 0 && (
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-sm font-medium">{t.opportunity.resumesFromThis}</p>
              <ul className="space-y-1 text-sm">
                {props.resumes.map((r) => (
                  <li key={r.id}>
                    <Link href={`/resumes/${r.id}/edit`} className="text-accent hover:underline">
                      {r.title}
                    </Link>{" "}
                    <span className="text-xs text-muted-foreground">
                      {t.enums.resumeLanguage[r.language as "en" | "ar"]} · {formatDate(r.updated_at, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <TrackerCard opportunityId={opportunity.id} initial={props.application} />

      {props.sourceText && (
        <details className="rounded-xl border border-border bg-surface p-4">
          <summary className="cursor-pointer text-sm font-medium">{t.opportunity.viewSource}</summary>
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground" dir="auto">
            {props.sourceText}
          </pre>
        </details>
      )}

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t.common.confirmDeleteTitle}
        description={t.opportunity.deleteConfirm}
        closeLabel={t.common.close}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              {t.common.cancel}
            </Button>
            <Button variant="danger" onClick={remove} loading={busy === "delete"}>
              {t.common.delete}
            </Button>
          </>
        }
      />
    </div>
  );
}

function TrackerCard({ opportunityId, initial }: { opportunityId: string; initial: WorkspaceProps["application"] }) {
  const { t } = useI18n();
  const toast = useToast();
  const [status, setStatus] = useState(initial?.status ?? "saved");
  const [appliedOn, setAppliedOn] = useState(initial?.applied_on ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api(`/api/applications/${opportunityId}`, { method: "PUT", body: { status, applied_on: appliedOn, notes } });
      toast.success(t.opportunity.statusSaved);
    } catch (err) {
      toast.error(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.opportunity.tracker}</CardTitle>
        <CardDescription>{t.applications.subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="tr-status" label={t.applications.status}>
            <Select id="tr-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {APPLICATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t.enums.applicationStatus[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="tr-date" label={t.opportunity.appliedOn}>
            <Input id="tr-date" type="date" value={appliedOn} onChange={(e) => setAppliedOn(e.target.value)} />
          </Field>
          <Field id="tr-notes" label={t.opportunity.notes} className="sm:col-span-2">
            <Textarea id="tr-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        <Button variant="secondary" onClick={save} loading={busy}>
          {t.opportunity.saveStatus}
        </Button>
      </CardContent>
    </Card>
  );
}
