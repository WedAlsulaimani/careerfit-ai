"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  History,
  Plus,
  Redo2,
  Save,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/config";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import type { ResumeBullet, ResumeDocument, ResumeItem, ResumeSection, ResumeSectionType } from "@/lib/schemas/resume";
import { SECTION_HEADINGS } from "@/lib/resume/labels";
import { keywordCoverage } from "@/lib/resume/keywords";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { ResumePreview } from "./resume-preview";
import { useHistory } from "./use-history";

const REGENERABLE: ResumeSectionType[] = ["summary", "experience", "internships", "research", "projects", "leadership", "volunteer", "publications", "awards", "additional", "education", "certifications"];
const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export interface ProfileItemOption {
  sourceRef: string;
  label: string;
  sectionType: ResumeSectionType;
  items: { en: ResumeItem; ar: ResumeItem };
}

interface Props {
  resumeId: string;
  initialTitle: string;
  initialDoc: ResumeDocument;
  initialVersion: number;
  keywords: string[];
  evidenceTitles: Record<string, string>;
  profileItems: ProfileItemOption[];
  versions: { version: number; reason: string; created_at: string }[];
  canRegenerate: boolean;
}

export function ResumeEditor(props: Props) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const history = useHistory<ResumeDocument>(props.initialDoc);
  const doc = history.value;
  const [title, setTitle] = useState(props.initialTitle);
  const [version, setVersion] = useState(props.initialVersion);
  const [savedDoc, setSavedDoc] = useState(JSON.stringify(props.initialDoc));
  const [savedTitle, setSavedTitle] = useState(props.initialTitle);
  const [busy, setBusy] = useState<"save" | "pdf" | "regen" | null>(null);
  const [conflict, setConflict] = useState(false);
  const [suggestion, setSuggestion] = useState<{ sectionId: string; section: ResumeSection; notes: string[] } | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const dirty = JSON.stringify(doc) !== savedDoc || title !== savedTitle;

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement)?.tagName === "TEXTAREA" || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        history.undo();
      } else if (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey)) {
        e.preventDefault();
        history.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history]);

  const coverage = useMemo(() => keywordCoverage(doc, props.keywords), [doc, props.keywords]);
  const usedRefs = new Set(doc.sections.flatMap((s) => s.items.map((i) => i.sourceRef).filter(Boolean)));
  const addable = props.profileItems.filter((p) => !usedRefs.has(p.sourceRef));

  // ---- mutations ---------------------------------------------------------
  const patchSection = (id: string, fn: (s: ResumeSection) => ResumeSection, group?: string) =>
    history.set((d) => ({ ...d, sections: d.sections.map((s) => (s.id === id ? fn(s) : s)) }), group);
  const patchItem = (sid: string, iid: string, fn: (i: ResumeItem) => ResumeItem, group?: string) =>
    patchSection(sid, (s) => ({ ...s, items: s.items.map((i) => (i.id === iid ? fn(i) : i)) }), group);
  const patchBullet = (sid: string, iid: string, bid: string, fn: (b: ResumeBullet) => ResumeBullet, group?: string) =>
    patchItem(sid, iid, (i) => ({ ...i, bullets: i.bullets.map((b) => (b.id === bid ? fn(b) : b)) }), group);
  const move = <T,>(arr: T[], index: number, delta: number) => {
    const next = [...arr];
    const target = index + delta;
    if (target < 0 || target >= arr.length) return arr;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  };

  const setLanguage = (lang: "en" | "ar") =>
    history.set((d) => ({
      ...d,
      language: lang,
      sections: d.sections.map((s) =>
        // Swap standard headings; keep headings the user customised.
        s.heading === SECTION_HEADINGS[d.language][s.type] ? { ...s, heading: SECTION_HEADINGS[lang][s.type] } : s,
      ),
    }));

  const addCustomSection = () =>
    history.set((d) => ({
      ...d,
      sections: [
        ...d.sections,
        { id: uid("s"), type: "custom", heading: t.editor.newSectionHeading, visible: true, text: "", textEvidenceRefs: [], textFlags: [], items: [] },
      ],
    }));

  const addFromProfile = (ref: string) => {
    const option = props.profileItems.find((p) => p.sourceRef === ref);
    if (!option) return;
    const item = { ...option.items[doc.language], id: uid("i") };
    history.set((d) => {
      const existing = d.sections.find((s) => s.type === option.sectionType);
      if (existing) return { ...d, sections: d.sections.map((s) => (s.id === existing.id ? { ...s, items: [...s.items, item] } : s)) };
      return {
        ...d,
        sections: [
          ...d.sections,
          { id: uid("s"), type: option.sectionType, heading: SECTION_HEADINGS[d.language][option.sectionType], visible: true, text: "", textEvidenceRefs: [], textFlags: [], items: [item] },
        ],
      };
    });
  };

  // ---- server actions ----------------------------------------------------
  const save = async (): Promise<boolean> => {
    setBusy("save");
    try {
      const res = await api<{ resume: { current_version: number } }>(`/api/resumes/${props.resumeId}`, {
        method: "PUT",
        body: { title, content: doc, baseVersion: version },
      });
      setVersion(res.resume.current_version);
      setSavedDoc(JSON.stringify(doc));
      setSavedTitle(title);
      toast.success(format(t.editor.saved, { n: res.resume.current_version }));
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setConflict(true);
      else toast.error(errorMessage(err, t));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const exportPdf = async () => {
    if (dirty && !(await save())) return;
    setBusy("pdf");
    try {
      const res = await fetch(`/api/resumes/${props.resumeId}/pdf`, { credentials: "same-origin" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
        throw new ApiError(res.status, data?.error?.code ?? "internal", data?.error?.message ?? "", null);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") ?? "";
      const name = /filename\*=UTF-8''([^;]+)/.exec(disposition)?.[1];
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name ? decodeURIComponent(name) : "resume.pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (err) {
      toast.error(`${t.editor.pdfError} ${errorMessage(err, t)}`);
    } finally {
      setBusy(null);
    }
  };

  const regenerate = async (sectionId: string) => {
    setBusy("regen");
    try {
      const res = await api<{ suggestion: { section: ResumeSection; notes: string[] } }>(`/api/resumes/${props.resumeId}/regenerate-section`, {
        body: { sectionId, content: doc },
      });
      setSuggestion({ sectionId, ...res.suggestion });
    } catch (err) {
      toast.error(errorMessage(err, t));
    } finally {
      setBusy(null);
    }
  };

  const restore = async (v: number) => {
    if (dirty && !window.confirm(t.editor.leaveWarning)) return;
    try {
      const res = await api<{ resume: { current_version: number; content: ResumeDocument; title: string } }>(`/api/resumes/${props.resumeId}/versions`, { body: { version: v } });
      history.reset(res.resume.content);
      setSavedDoc(JSON.stringify(res.resume.content));
      setVersion(res.resume.current_version);
      setShowVersions(false);
      toast.success(t.editor.restored);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, t));
    }
  };

  const flagText = (flag: string) => {
    const [code, value] = flag.split(/:(.*)/s);
    const tpl = (t.editor.flags as Record<string, string>)[code];
    return tpl ? format(tpl, { value: value ?? "" }) : flag;
  };
  const evidenceLine = (refs: string[]) =>
    refs.length ? format(t.editor.evidenceFrom, { titles: refs.map((r) => props.evidenceTitles[r] ?? r).join(" · ") }) : null;

  // ---- render ------------------------------------------------------------
  return (
    <div className="space-y-4">
      <div className="sticky top-14 z-20 -mx-4 flex flex-wrap items-center gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:top-0">
        <Link href="/resumes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
          {t.editor.back}
        </Link>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {dirty ? t.common.unsavedChanges : format(t.resumes.version, { n: version })}
          </span>
          <Button size="icon" variant="ghost" onClick={history.undo} disabled={!history.canUndo} aria-label={t.editor.undo} title={t.editor.undo}>
            <Undo2 className="rtl:-scale-x-100" aria-hidden />
          </Button>
          <Button size="icon" variant="ghost" onClick={history.redo} disabled={!history.canRedo} aria-label={t.editor.redo} title={t.editor.redo}>
            <Redo2 className="rtl:-scale-x-100" aria-hidden />
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setShowVersions(true)}>
            <History aria-hidden />
            {t.editor.versions}
          </Button>
          <Button size="sm" variant="secondary" onClick={save} loading={busy === "save"} disabled={!dirty || busy !== null}>
            <Save aria-hidden />
            {t.editor.save}
          </Button>
          <Button size="sm" onClick={exportPdf} loading={busy === "pdf"} disabled={busy !== null}>
            <Download aria-hidden />
            {busy === "pdf" ? t.editor.exporting : t.editor.exportPdf}
          </Button>
        </div>
      </div>

      {conflict && (
        <Alert tone="danger" title={t.editor.conflict} action={<Button size="sm" onClick={() => window.location.reload()}>{t.editor.reload}</Button>} />
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Controls */}
        <div className="min-w-0 space-y-4">
          <Card>
            <CardContent className="grid gap-4 pt-5 sm:grid-cols-3">
              <Field id="ed-title" label={t.editor.resumeTitle} className="sm:col-span-3">
                <Input id="ed-title" dir="auto" value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <Field id="ed-lang" label={t.editor.language} help={t.editor.languageSwitchNote} className="sm:col-span-2">
                <Select id="ed-lang" value={doc.language} onChange={(e) => setLanguage(e.target.value as "en" | "ar")}>
                  <option value="en">{t.enums.resumeLanguage.en}</option>
                  <option value="ar">{t.enums.resumeLanguage.ar}</option>
                </Select>
              </Field>
              <Field id="ed-layout" label={t.editor.layout}>
                <Select id="ed-layout" value={doc.layout} onChange={(e) => history.set((d) => ({ ...d, layout: e.target.value as ResumeDocument["layout"] }))}>
                  <option value="classic">{t.enums.resumeLayout.classic}</option>
                  <option value="compact">{t.enums.resumeLayout.compact}</option>
                </Select>
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.editor.header}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {(["name", "headline", "email", "phone", "location"] as const).map((k) => (
                <Field key={k} id={`ed-h-${k}`} label={t.editor[k]} className={k === "headline" ? "sm:col-span-2" : undefined}>
                  <Input
                    id={`ed-h-${k}`}
                    dir={k === "email" || k === "phone" ? "ltr" : "auto"}
                    value={doc.header[k]}
                    onChange={(e) => history.set((d) => ({ ...d, header: { ...d.header, [k]: e.target.value } }), `h-${k}`)}
                  />
                </Field>
              ))}
              {doc.header.links.length > 0 && (
                <div className="space-y-1 sm:col-span-2">
                  <p className="text-sm font-medium">{t.editor.links}</p>
                  <ul className="space-y-1">
                    {doc.header.links.map((l, i) => (
                      <li key={`${l.url}-${i}`} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate" dir="ltr">{l.url}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={t.common.delete}
                          onClick={() => history.set((d) => ({ ...d, header: { ...d.header, links: d.header.links.filter((_, j) => j !== i) } }))}
                        >
                          <Trash2 className="text-danger" aria-hidden />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {doc.sections.map((section, sIndex) => (
            <Card key={section.id} className={section.visible ? undefined : "opacity-70"}>
              <CardHeader className="gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    aria-label={t.editor.sectionHeading}
                    dir="auto"
                    value={section.heading}
                    onChange={(e) => patchSection(section.id, (s) => ({ ...s, heading: e.target.value }), `sh-${section.id}`)}
                    className="h-9 min-w-40 flex-1 font-semibold"
                  />
                  <div className="flex">
                    <Button size="icon" variant="ghost" aria-label={t.editor.moveUp} disabled={sIndex === 0} onClick={() => history.set((d) => ({ ...d, sections: move(d.sections, sIndex, -1) }))}>
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label={t.editor.moveDown} disabled={sIndex === doc.sections.length - 1} onClick={() => history.set((d) => ({ ...d, sections: move(d.sections, sIndex, 1) }))}>
                      <ArrowDown aria-hidden />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={section.visible ? t.editor.hideSection : t.editor.showSection}
                      aria-pressed={!section.visible}
                      onClick={() => patchSection(section.id, (s) => ({ ...s, visible: !s.visible }))}
                    >
                      {section.visible ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
                    </Button>
                    <Button size="icon" variant="ghost" aria-label={t.editor.deleteSection} onClick={() => history.set((d) => ({ ...d, sections: d.sections.filter((s) => s.id !== section.id) }))}>
                      <Trash2 className="text-danger" aria-hidden />
                    </Button>
                  </div>
                </div>
                {props.canRegenerate && REGENERABLE.includes(section.type) && (
                  <div>
                    <Button size="sm" variant="secondary" onClick={() => regenerate(section.id)} loading={busy === "regen"} disabled={busy !== null}>
                      <Sparkles aria-hidden />
                      {busy === "regen" ? t.editor.regenerating : t.editor.regenerate}
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {(section.type === "summary" || section.type === "custom") && (
                  <Field id={`ed-text-${section.id}`} label={t.editor.summaryText}>
                    <Textarea
                      id={`ed-text-${section.id}`}
                      dir="auto"
                      rows={4}
                      value={section.text}
                      onChange={(e) => patchSection(section.id, (s) => ({ ...s, text: e.target.value, textFlags: [] }), `st-${section.id}`)}
                    />
                  </Field>
                )}
                {section.textFlags.length > 0 && <FlagList flags={section.textFlags.map(flagText)} />}
                {section.type === "summary" && evidenceLine(section.textEvidenceRefs) && <p className="text-xs text-muted-foreground">{evidenceLine(section.textEvidenceRefs)}</p>}

                {section.items.map((item, iIndex) => (
                  <div key={item.id} className={`space-y-3 rounded-lg border border-border p-3 ${item.visible ? "" : "opacity-60"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium" dir="auto">{item.title || item.inline.slice(0, 60)}</p>
                      <div className="flex">
                        <Button size="icon" variant="ghost" aria-label={t.editor.moveUp} disabled={iIndex === 0} onClick={() => patchSection(section.id, (s) => ({ ...s, items: move(s.items, iIndex, -1) }))}>
                          <ArrowUp aria-hidden />
                        </Button>
                        <Button size="icon" variant="ghost" aria-label={t.editor.moveDown} disabled={iIndex === section.items.length - 1} onClick={() => patchSection(section.id, (s) => ({ ...s, items: move(s.items, iIndex, 1) }))}>
                          <ArrowDown aria-hidden />
                        </Button>
                        <Button size="icon" variant="ghost" aria-label={item.visible ? t.editor.hideItem : t.editor.showItem} aria-pressed={!item.visible} onClick={() => patchItem(section.id, item.id, (i) => ({ ...i, visible: !i.visible }))}>
                          {item.visible ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
                        </Button>
                        <Button size="icon" variant="ghost" aria-label={t.editor.deleteItem} onClick={() => patchSection(section.id, (s) => ({ ...s, items: s.items.filter((i) => i.id !== item.id) }))}>
                          <Trash2 className="text-danger" aria-hidden />
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {(["title", "subtitle", "meta", "location"] as const).map((k) =>
                        k === "location" && !item.location && section.type !== "experience" && section.type !== "internships" ? null : (
                          <Field key={k} id={`${item.id}-${k}`} label={t.editor[`item${k[0].toUpperCase()}${k.slice(1)}` as "itemTitle"]}>
                            <Input id={`${item.id}-${k}`} dir="auto" value={item[k]} onChange={(e) => patchItem(section.id, item.id, (i) => ({ ...i, [k]: e.target.value }), `${item.id}-${k}`)} />
                          </Field>
                        ),
                      )}
                    </div>
                    {(item.inline || section.type === "skills" || section.type === "languages") && (
                      <Field id={`${item.id}-inline`} label={t.editor.itemInline}>
                        <Textarea id={`${item.id}-inline`} rows={2} dir="auto" value={item.inline} onChange={(e) => patchItem(section.id, item.id, (i) => ({ ...i, inline: e.target.value }), `${item.id}-inline`)} />
                      </Field>
                    )}
                    {(item.details.length > 0 || section.type === "education") && (
                      <Field id={`${item.id}-details`} label={t.editor.itemDetails}>
                        <Textarea
                          id={`${item.id}-details`}
                          rows={Math.max(2, item.details.length)}
                          dir="auto"
                          value={item.details.join("\n")}
                          onChange={(e) => patchItem(section.id, item.id, (i) => ({ ...i, details: e.target.value.split("\n").filter((l) => l.trim()).slice(0, 10) }), `${item.id}-details`)}
                        />
                      </Field>
                    )}
                    {item.bullets.length > 0 && <p className="text-xs font-medium text-muted-foreground">{t.editor.bullets}</p>}
                    <ul className="space-y-2">
                      {item.bullets.map((b) => (
                        <li key={b.id} className="space-y-1.5">
                          <div className="flex gap-2">
                            <Textarea
                              aria-label={t.editor.bullets}
                              rows={2}
                              dir="auto"
                              value={b.text}
                              onChange={(e) => patchBullet(section.id, item.id, b.id, (x) => ({ ...x, text: e.target.value, status: "user_edited", flags: [] }), b.id)}
                              className={b.status === "needs_review" ? "border-warning" : undefined}
                            />
                            <div className="flex flex-col">
                              <Button size="icon" variant="ghost" aria-label={b.visible ? t.editor.hideItem : t.editor.showItem} aria-pressed={!b.visible} onClick={() => patchBullet(section.id, item.id, b.id, (x) => ({ ...x, visible: !x.visible }))}>
                                {b.visible ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
                              </Button>
                              <Button size="icon" variant="ghost" aria-label={t.editor.deleteBullet} onClick={() => patchItem(section.id, item.id, (i) => ({ ...i, bullets: i.bullets.filter((x) => x.id !== b.id) }))}>
                                <Trash2 className="text-danger" aria-hidden />
                              </Button>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {b.status === "needs_review" && (
                              <>
                                <Badge tone="warning">
                                  <AlertTriangle className="size-3" aria-hidden />
                                  {t.editor.needsReview}
                                </Badge>
                                <Button size="sm" variant="link" onClick={() => patchBullet(section.id, item.id, b.id, (x) => ({ ...x, status: "user_edited", flags: [], visible: true }))}>
                                  {t.editor.approveBullet}
                                </Button>
                              </>
                            )}
                            {b.status === "user_edited" && <Badge>{t.editor.userEdited}</Badge>}
                            {!b.visible && <Badge>{t.editor.bulletHidden}</Badge>}
                          </div>
                          {b.flags.length > 0 && <FlagList flags={b.flags.map(flagText)} />}
                          {evidenceLine(b.evidenceRefs) && <p className="text-xs text-muted-foreground">{evidenceLine(b.evidenceRefs)}</p>}
                        </li>
                      ))}
                    </ul>
                    {section.type !== "skills" && section.type !== "languages" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          patchItem(section.id, item.id, (i) => ({
                            ...i,
                            bullets: [...i.bullets, { id: uid("b"), text: "", evidenceRefs: i.sourceRef ? [i.sourceRef] : [], status: "user_edited", flags: [], visible: true }],
                          }))
                        }
                      >
                        <Plus aria-hidden />
                        {t.editor.addBullet}
                      </Button>
                    )}
                  </div>
                ))}
                {section.type === "custom" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      patchSection(section.id, (s) => ({
                        ...s,
                        items: [...s.items, { id: uid("i"), sourceRef: null, title: "", subtitle: "", meta: "", location: "", details: [], inline: "", bullets: [], links: [], visible: true }],
                      }))
                    }
                  >
                    <Plus aria-hidden />
                    {t.editor.addItem}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button variant="secondary" onClick={addCustomSection}>
              <Plus aria-hidden />
              {t.editor.addSection}
            </Button>
            {addable.length > 0 && (
              <Select aria-label={t.editor.addFromProfile} value="" onChange={(e) => e.target.value && addFromProfile(e.target.value)} className="sm:max-w-sm">
                <option value="">{t.editor.addFromProfile}…</option>
                {addable.map((p) => (
                  <option key={p.sourceRef} value={p.sourceRef}>
                    {SECTION_HEADINGS[locale][p.sectionType]}: {p.label}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </div>

        {/* Preview + insights */}
        <div className="min-w-0 space-y-4 xl:sticky xl:top-20 xl:self-start">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">{t.editor.preview}</h2>
            <p className="text-xs text-muted-foreground">{t.editor.previewNote}</p>
          </div>
          <ResumePreview doc={doc} title={title} />
          {props.keywords.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t.editor.keywordsTitle}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t.editor.keywordsPresent} ({coverage.present.length})</p>
                  <div className="flex flex-wrap gap-1">{coverage.present.map((k) => <Badge key={k} tone="success" dir="auto">{k}</Badge>)}</div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t.editor.keywordsAbsent} ({coverage.absent.length})</p>
                  <div className="flex flex-wrap gap-1">{coverage.absent.map((k) => <Badge key={k} dir="auto">{k}</Badge>)}</div>
                </div>
                <p className="text-xs text-muted-foreground">{t.editor.keywordsNote}</p>
              </CardContent>
            </Card>
          )}
          {doc.meta.notes.length > 0 && (
            <Alert tone="info" title={t.editor.notesTitle}>
              <ul className="list-disc space-y-0.5 ps-4" dir="auto">
                {doc.meta.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </Alert>
          )}
        </div>
      </div>

      <Dialog
        open={suggestion !== null}
        onClose={() => setSuggestion(null)}
        title={t.editor.suggestionTitle}
        description={t.editor.suggestionBody}
        closeLabel={t.common.close}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSuggestion(null)}>
              {t.editor.discardSuggestion}
            </Button>
            <Button
              onClick={() => {
                if (!suggestion) return;
                patchSection(suggestion.sectionId, () => suggestion.section);
                setSuggestion(null);
              }}
            >
              <CheckCircle2 aria-hidden />
              {t.editor.applySuggestion}
            </Button>
          </>
        }
      >
        {suggestion && (
          <SuggestionDiff current={doc.sections.find((s) => s.id === suggestion.sectionId)} next={suggestion.section} notes={suggestion.notes} flagText={flagText} />
        )}
      </Dialog>

      <Dialog open={showVersions} onClose={() => setShowVersions(false)} title={t.editor.versions} closeLabel={t.common.close} size="sm">
        <ul className="divide-y divide-border">
          {props.versions.map((v) => (
            <li key={v.version} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span>
                {format(t.resumes.version, { n: v.version })} <span className="text-xs text-muted-foreground">· {v.reason} · {formatDate(v.created_at, locale)}</span>
              </span>
              {v.version !== version && (
                <Button size="sm" variant="secondary" onClick={() => restore(v.version)}>
                  {t.editor.restore}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}

function FlagList({ flags }: { flags: string[] }) {
  return (
    <ul className="space-y-0.5 text-xs text-warning">
      {flags.map((f, i) => (
        <li key={i} className="flex gap-1">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
          {f}
        </li>
      ))}
    </ul>
  );
}

function SuggestionDiff({
  current,
  next,
  notes,
  flagText,
}: {
  current: ResumeSection | undefined;
  next: ResumeSection;
  notes: string[];
  flagText: (f: string) => string;
}) {
  const { t } = useI18n();
  const column = (s: ResumeSection | undefined, label: string) => (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      {s?.type === "summary" ? (
        <p className="text-sm" dir="auto">{s.text}</p>
      ) : (
        s?.items.map((i) => (
          <div key={i.id} className="space-y-1">
            <p className="text-sm font-medium" dir="auto">{i.title}</p>
            <ul className="list-disc space-y-1 ps-5 text-sm" dir="auto">
              {i.bullets.map((b) => (
                <li key={b.id} className={b.status === "needs_review" ? "text-warning" : undefined}>
                  {b.text}
                  {b.flags.length > 0 && <span className="block text-xs">{b.flags.map(flagText).join(" · ")}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="grid gap-6 md:grid-cols-2">
        {column(current, t.editor.current)}
        {column(next, t.editor.suggestionTitle)}
      </div>
      {notes.length > 0 && (
        <Alert tone="info">
          <ul className="list-disc ps-4">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </Alert>
      )}
    </div>
  );
}
