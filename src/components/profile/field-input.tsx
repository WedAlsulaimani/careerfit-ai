"use client";

import type { UseFormRegister, FieldValues } from "react-hook-form";
import { useI18n } from "@/lib/i18n/client";
import { ENUMS, type FieldDef } from "@/lib/profile/sections";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { cn } from "@/lib/utils";

type FieldText = { label: string; help: string };

export function fieldText(t: ReturnType<typeof useI18n>["t"], group: string, name: string): FieldText {
  const groupDict = (t.fields as Record<string, Record<string, FieldText>>)[group];
  return groupDict?.[name] ?? { label: name, help: "" };
}

export function enumLabel(t: ReturnType<typeof useI18n>["t"], enumName: string, value: string): string {
  return (t.enums as Record<string, Record<string, string>>)[enumName]?.[value] ?? value;
}

export function localizeError(t: ReturnType<typeof useI18n>["t"], message: string | undefined, required?: boolean): string | undefined {
  if (!message) return undefined;
  const known = (t.errors as Record<string, string>)[message];
  if (known) return known;
  return required ? t.errors.fieldRequired : t.errors.validation;
}

/** Renders one registry-defined field with label, help and localized error. */
export function FieldInput<T extends FieldValues>({
  def,
  group,
  register,
  error,
  idPrefix,
}: {
  def: FieldDef;
  group: string;
  register: UseFormRegister<T>;
  error?: string;
  idPrefix: string;
}) {
  const { t } = useI18n();
  const text = fieldText(t, group, def.name);
  const id = `${idPrefix}-${def.name}`;
  const describedBy = error ? `${id}-error` : text.help ? `${id}-help` : undefined;
  const reg = register(def.name as never);
  const common = { id, "aria-invalid": !!error || undefined, "aria-describedby": describedBy };
  const ltr = def.type === "url" || def.type === "email" || def.type === "tel";

  if (def.type === "checkbox") {
    return (
      <div className={cn("flex items-start gap-2.5 pt-1", def.full && "sm:col-span-2")}>
        <Checkbox {...common} {...reg} className="mt-0.5" />
        <div className="space-y-0.5">
          <label htmlFor={id} className="text-sm font-medium">
            {text.label}
          </label>
          {text.help && (
            <p id={`${id}-help`} className="text-xs text-muted-foreground">
              {text.help}
            </p>
          )}
        </div>
      </div>
    );
  }

  const help =
    def.type === "tags"
      ? [text.help, t.profile.tagsHint].filter(Boolean).join(" ")
      : def.type === "lines"
        ? [text.help, t.profile.linesHint].filter(Boolean).join(" ")
        : text.help;

  return (
    <Field id={id} label={text.label} help={help} error={localizeError(t, error, def.required)} required={def.required} className={cn(def.full && "sm:col-span-2")}>
      {def.type === "textarea" || def.type === "lines" ? (
        <Textarea {...common} {...reg} rows={def.type === "lines" ? 4 : 3} />
      ) : def.type === "select" ? (
        <Select {...common} {...reg}>
          {!def.required && <option value="">—</option>}
          {ENUMS[def.options!].map((v) => (
            <option key={v} value={v}>
              {enumLabel(t, def.options!, v)}
            </option>
          ))}
        </Select>
      ) : (
        <Input
          {...common}
          {...reg}
          dir={ltr ? "ltr" : undefined}
          type={def.type === "tags" ? "text" : def.type === "number" ? "number" : def.type}
          inputMode={def.type === "number" ? "decimal" : undefined}
          step={def.type === "number" ? "any" : undefined}
        />
      )}
    </Field>
  );
}
