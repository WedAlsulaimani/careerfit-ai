"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { useI18n } from "@/lib/i18n/client";
import { api, errorMessage, fieldErrors } from "@/lib/api-client";
import { SECTIONS, emptyEntry, rowToForm, type SectionKey } from "@/lib/profile/sections";
import type { Row } from "@/lib/evidence/catalog";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { FieldInput } from "./field-input";

const draftKey = (section: string, id: string | null) => `cf-draft:${section}:${id ?? "new"}`;

function readDraft(key: string): Record<string, unknown> | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Create/edit form for one entry of any registry section. Unsaved input is
 * kept as a local draft (this browser only) so nothing is lost if the dialog
 * closes or the page reloads; the server validates again on save.
 */
export function EntryForm({
  sectionKey,
  entry,
  onSaved,
  onCancel,
}: {
  sectionKey: SectionKey;
  entry: Row | null;
  onSaved: (row: Row) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const section = SECTIONS[sectionKey];
  const key = draftKey(sectionKey, entry?.id ?? null);
  const baseValues = useMemo(() => (entry ? rowToForm(section, entry) : emptyEntry(section)), [entry, section]);
  // Read once on mount; the form only renders client-side inside a dialog.
  const [initialDraft] = useState(() => (typeof window === "undefined" ? null : readDraft(key)));
  const [restored, setRestored] = useState(Boolean(initialDraft));
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<Record<string, unknown>>({
    resolver: zodResolver(section.schema as z.ZodType<Record<string, unknown>, Record<string, unknown>>),
    defaultValues: initialDraft ? { ...baseValues, ...initialDraft } : baseValues,
    mode: "onBlur",
  });
  const { errors, isSubmitting } = form.formState;
  const values = useWatch({ control: form.control });

  useEffect(() => {
    if (!form.formState.isDirty) return;
    const timer = setTimeout(() => {
      try {
        window.localStorage.setItem(key, JSON.stringify(values));
      } catch {
        /* storage unavailable: drafts are a convenience only */
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [values, key, form.formState.isDirty]);

  const discardDraft = () => {
    try {
      window.localStorage.removeItem(key);
    } catch {}
    form.reset(baseValues);
    setRestored(false);
  };

  const onSubmit = form.handleSubmit(async () => {
    setServerError(null);
    // Send the raw form values; the server applies the same schema.
    const raw = form.getValues();
    try {
      const res = entry
        ? await api<{ entry: Row }>(`/api/profile/sections/${sectionKey}/${entry.id}`, { method: "PATCH", body: raw })
        : await api<{ entry: Row }>(`/api/profile/sections/${sectionKey}`, { method: "POST", body: raw });
      try {
        window.localStorage.removeItem(key);
      } catch {}
      onSaved(res.entry);
    } catch (err) {
      const fe = fieldErrors(err, t);
      for (const [name, message] of Object.entries(fe)) form.setError(name, { message });
      setServerError(errorMessage(err, t));
    }
  });

  const isVisible = (name: string) => {
    const def = section.fields.find((f) => f.name === name);
    if (!def?.showIf) return true;
    const v = values[def.showIf.field];
    if (def.showIf.in) return def.showIf.in.includes(String(v ?? ""));
    if (def.showIf.truthy) return Boolean(v);
    if (def.showIf.falsy) return !v;
    return true;
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {restored && (
        <Alert
          tone="info"
          title={t.profile.draftRestored}
          action={
            <Button size="sm" variant="secondary" onClick={discardDraft}>
              {t.profile.discardDraft}
            </Button>
          }
        />
      )}
      {serverError && <Alert tone="danger">{serverError}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        {section.fields.filter((f) => isVisible(f.name)).map((def) => (
          <FieldInput
            key={def.name}
            def={def}
            group={sectionKey}
            register={form.register}
            error={errors[def.name]?.message as string | undefined}
            idPrefix={`${sectionKey}-${entry?.id ?? "new"}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <Button variant="secondary" onClick={onCancel}>
          {t.common.cancel}
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {t.common.save}
        </Button>
      </div>
    </form>
  );
}
