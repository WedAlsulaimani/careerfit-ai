"use client";

import { useForm, useWatch } from "react-hook-form";
import { useI18n } from "@/lib/i18n/client";
import { api } from "@/lib/api-client";
import { goalsSchema, WORK_ARRANGEMENTS } from "@/lib/schemas/profile";
import type { FieldDef } from "@/lib/profile/sections";
import { Checkbox, Field, Select } from "@/components/ui/form-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { FieldInput, fieldText } from "./field-input";
import { useAutosave } from "./use-autosave";
import { AutosaveIndicator } from "./autosave-indicator";

const TAG_FIELDS: FieldDef[] = [
  { name: "target_titles", type: "tags", full: true },
  { name: "industries", type: "tags" },
  { name: "specializations", type: "tags" },
  { name: "interests", type: "tags" },
  { name: "preferred_locations", type: "tags" },
];

type FormValues = Record<string, unknown> & { work_arrangements: string[]; willing_to_relocate: string; objective: string };

function toForm(g: Record<string, unknown> | null): FormValues {
  const out: FormValues = {
    work_arrangements: Array.isArray(g?.work_arrangements) ? (g!.work_arrangements as string[]) : [],
    willing_to_relocate: g?.willing_to_relocate === true ? "true" : g?.willing_to_relocate === false ? "false" : "",
    objective: typeof g?.objective === "string" ? g.objective : "",
  };
  for (const f of TAG_FIELDS) out[f.name] = Array.isArray(g?.[f.name]) ? (g![f.name] as string[]).join(", ") : "";
  return out;
}

export function GoalsForm({ initial, onSaved }: { initial: Record<string, unknown> | null; onSaved?: (row: Record<string, unknown>) => void }) {
  const { t } = useI18n();
  const form = useForm<FormValues>({ defaultValues: toForm(initial) });
  const values = useWatch({ control: form.control }) as FormValues;
  const parsed = goalsSchema.safeParse(values);
  const status = useAutosave(values, form.formState.isDirty && parsed.success, async (v) => {
    const res = await api<{ goals: Record<string, unknown> }>("/api/profile/goals", { method: "PUT", body: v });
    onSaved?.(res.goals);
  });
  const relocate = fieldText(t, "goals", "willing_to_relocate");
  const arrangements = fieldText(t, "goals", "work_arrangements");

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <CardTitle>{t.profile.goals.title}</CardTitle>
          <CardDescription>{t.profile.goals.description}</CardDescription>
        </div>
        <AutosaveIndicator status={status} />
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => e.preventDefault()} noValidate className="grid gap-4 sm:grid-cols-2">
          {TAG_FIELDS.map((def) => (
            <FieldInput key={def.name} def={def} group="goals" register={form.register} idPrefix="goals" />
          ))}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{arrangements.label}</legend>
            <div className="flex flex-wrap gap-4">
              {WORK_ARRANGEMENTS.map((w) => (
                <label key={w} className="inline-flex items-center gap-2 text-sm">
                  <Checkbox value={w} {...form.register("work_arrangements")} />
                  {t.enums.workArrangement[w]}
                </label>
              ))}
            </div>
          </fieldset>
          <Field id="goals-relocate" label={relocate.label}>
            <Select id="goals-relocate" {...form.register("willing_to_relocate")}>
              <option value="">—</option>
              <option value="true">{t.common.yes}</option>
              <option value="false">{t.common.no}</option>
            </Select>
          </Field>
          <FieldInput def={{ name: "objective", type: "textarea", full: true }} group="goals" register={form.register} idPrefix="goals" />
        </form>
      </CardContent>
    </Card>
  );
}
