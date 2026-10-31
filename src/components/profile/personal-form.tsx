"use client";

import { useState } from "react";
import { useFieldArray, useForm, useWatch, type Control } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { api, fieldErrors } from "@/lib/api-client";
import { personalSchema } from "@/lib/schemas/profile";
import type { FieldDef } from "@/lib/profile/sections";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { FieldInput, localizeError } from "./field-input";
import { useAutosave } from "./use-autosave";
import { AutosaveIndicator } from "./autosave-indicator";

const FIELDS: FieldDef[] = [
  { name: "full_name_en", type: "text" },
  { name: "full_name_ar", type: "text" },
  { name: "headline", type: "text", full: true },
  { name: "email", type: "email" },
  { name: "phone_country_code", type: "tel" },
  { name: "phone", type: "tel" },
  { name: "city", type: "text" },
  { name: "country", type: "text" },
  { name: "linkedin_url", type: "url" },
  { name: "portfolio_url", type: "url" },
  { name: "github_url", type: "url" },
  { name: "summary", type: "textarea", full: true },
  { name: "date_of_birth", type: "date" },
  { name: "nationality", type: "text" },
  { name: "include_dob_in_resume", type: "checkbox", full: true },
  { name: "include_nationality_in_resume", type: "checkbox", full: true },
];

type FormValues = Record<string, unknown> & { other_links: { label: string; url: string }[] };

function toForm(p: Record<string, unknown> | null): FormValues {
  const out: FormValues = { other_links: [] };
  for (const f of FIELDS) {
    const v = p?.[f.name];
    out[f.name] = f.type === "checkbox" ? Boolean(v) : v === null || v === undefined ? "" : String(v);
  }
  out.other_links = Array.isArray(p?.other_links) ? (p!.other_links as { label: string; url: string }[]) : [];
  return out;
}

export function PersonalForm({ initial, onSaved }: { initial: Record<string, unknown> | null; onSaved?: (row: Record<string, unknown>) => void }) {
  const { t } = useI18n();
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const form = useForm<FormValues>({ defaultValues: toForm(initial), mode: "onChange" });
  // The index signature on FormValues hides "other_links" from RHF's path types.
  const links = useFieldArray({
    control: form.control as unknown as Control<{ other_links: { label: string; url: string }[] }>,
    name: "other_links",
  });
  const values = useWatch({ control: form.control }) as FormValues;

  // Client-side validation with the same schema the server uses.
  const parsed = personalSchema.safeParse({ ...values, other_links: (values.other_links ?? []).filter((l) => l.label || l.url) });
  const clientErrors: Record<string, string> = {};
  if (!parsed.success) for (const i of parsed.error.issues) clientErrors[String(i.path[0])] ??= i.message;

  const status = useAutosave(values, form.formState.isDirty && parsed.success, async (v) => {
    try {
      const res = await api<{ personal: Record<string, unknown> }>("/api/profile/personal", {
        method: "PUT",
        body: { ...v, other_links: (v.other_links ?? []).filter((l) => l.label || l.url) },
      });
      setServerErrors({});
      onSaved?.(res.personal);
    } catch (err) {
      setServerErrors(fieldErrors(err, t));
      throw err;
    }
  });

  const errorFor = (name: string) => {
    const touched = (form.formState.dirtyFields as Record<string, unknown>)[name];
    return serverErrors[name] ?? (touched ? clientErrors[name] : undefined);
  };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <CardTitle>{t.profile.personal.title}</CardTitle>
          <CardDescription>{t.profile.personal.description}</CardDescription>
        </div>
        <AutosaveIndicator status={status} />
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => e.preventDefault()} noValidate className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map((def) => (
              <FieldInput key={def.name} def={def} group="personal" register={form.register} error={errorFor(def.name)} idPrefix="personal" />
            ))}
          </div>
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">{t.profile.otherLinks}</legend>
            {links.fields.map((field, index) => (
              <div key={field.id} className="flex flex-col gap-2 sm:flex-row">
                <Input aria-label={t.profile.linkLabel} placeholder={t.profile.linkLabel} {...form.register(`other_links.${index}.label`)} className="sm:max-w-48" />
                <Input aria-label={t.profile.linkUrl} placeholder="https://" dir="ltr" type="url" {...form.register(`other_links.${index}.url`)} />
                <Button variant="ghost" size="icon" aria-label={t.common.delete} onClick={() => links.remove(index)}>
                  <Trash2 className="text-danger" aria-hidden />
                </Button>
              </div>
            ))}
            {clientErrors.other_links && form.formState.dirtyFields.other_links && (
              <p className="text-xs text-danger" role="alert">
                {localizeError(t, "invalid_url")}
              </p>
            )}
            {links.fields.length < 10 && (
              <Button size="sm" variant="secondary" onClick={() => links.append({ label: "", url: "" })}>
                <Plus aria-hidden />
                {t.profile.addLink}
              </Button>
            )}
          </fieldset>
        </form>
      </CardContent>
    </Card>
  );
}
