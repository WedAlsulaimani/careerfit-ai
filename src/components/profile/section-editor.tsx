"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { api, errorMessage } from "@/lib/api-client";
import { SECTIONS, type SectionKey } from "@/lib/profile/sections";
import type { Row } from "@/lib/evidence/catalog";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { EntryForm } from "./entry-form";
import { enumLabel } from "./field-input";
import { AttachmentControl } from "./attachment-control";

const ATTACHMENT_COLUMNS: Partial<Record<SectionKey, { column: string; purpose: string }>> = {
  education: { column: "transcript_attachment_id", purpose: "transcript" },
  certifications: { column: "attachment_id", purpose: "certification" },
  recommendations: { column: "attachment_id", purpose: "recommendation" },
};

/** List + add/edit/duplicate/delete for one repeatable profile section. */
export function SectionEditor({
  sectionKey,
  initialEntries,
  onEntriesChange,
}: {
  sectionKey: SectionKey;
  initialEntries: Row[];
  onEntriesChange?: (entries: Row[]) => void;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const section = SECTIONS[sectionKey];
  const [entries, setEntries] = useState<Row[]>(initialEntries);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const text = t.profile.sections[sectionKey];
  const attachment = ATTACHMENT_COLUMNS[sectionKey];
  const notify = useRef(onEntriesChange);
  useEffect(() => {
    notify.current = onEntriesChange;
  });
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    notify.current?.(entries);
  }, [entries]);

  const subtitle = (row: Row) =>
    section.subtitleFields
      .map((f) => {
        const def = section.fields.find((x) => x.name === f);
        const v = row[f];
        if (v === null || v === undefined || v === "") return null;
        return def?.type === "select" && def.options ? enumLabel(t, def.options, String(v)) : String(v);
      })
      .filter(Boolean)
      .join(" · ");

  const onSaved = (row: Row) => {
    setEntries((list) => (list.some((e) => e.id === row.id) ? list.map((e) => (e.id === row.id ? row : e)) : [row, ...list]));
    setEditing(null);
    toast.success(t.profile.entrySaved);
  };

  const duplicate = async (row: Row) => {
    setBusy(true);
    try {
      const res = await api<{ entry: Row }>(`/api/profile/sections/${sectionKey}/${row.id}/duplicate`, { method: "POST" });
      setEntries((list) => [res.entry, ...list]);
      toast.success(t.profile.entryDuplicated);
    } catch (err) {
      toast.error(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/api/profile/sections/${sectionKey}/${deleting.id}`, { method: "DELETE" });
      setEntries((list) => list.filter((e) => e.id !== deleting.id));
      toast.success(t.profile.entryDeleted);
      setDeleting(null);
    } catch (err) {
      toast.error(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card id={`section-${sectionKey}`}>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 sm:flex-nowrap">
        <div className="space-y-1">
          <CardTitle>{text.title}</CardTitle>
          <CardDescription>{text.description}</CardDescription>
          {section.privateSection && (
            <Badge tone="accent" className="mt-1">
              <Lock className="size-3" aria-hidden />
              {t.profile.privateBadge}
            </Badge>
          )}
        </div>
        <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>
          <Plus aria-hidden />
          {t.profile.addEntry}
        </Button>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">{t.profile.emptySection}</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {entries.map((row) => (
              <li key={row.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-medium">{String(row[section.titleField] ?? "")}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {subtitle(row)}
                    {row.updated_at ? ` · ${formatDate(String(row.updated_at), locale)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="icon" variant="ghost" aria-label={`${t.common.edit}: ${String(row[section.titleField] ?? "")}`} onClick={() => setEditing(row)}>
                    <Pencil aria-hidden />
                  </Button>
                  <Button size="icon" variant="ghost" disabled={busy} aria-label={`${t.common.duplicate}: ${String(row[section.titleField] ?? "")}`} onClick={() => duplicate(row)}>
                    <Copy aria-hidden />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={`${t.common.delete}: ${String(row[section.titleField] ?? "")}`} onClick={() => setDeleting(row)}>
                    <Trash2 className="text-danger" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? `${t.profile.newEntry} — ${text.title}` : `${t.profile.editEntry} — ${text.title}`}
        description={text.description}
        closeLabel={t.common.close}
      >
        {editing !== null && (
          <div className="space-y-6">
            <EntryForm
              sectionKey={sectionKey}
              entry={editing === "new" ? null : editing}
              onSaved={onSaved}
              onCancel={() => setEditing(null)}
            />
            {attachment && editing !== "new" && (
              <AttachmentControl
                sectionKey={sectionKey}
                entryId={editing.id}
                purpose={attachment.purpose}
                attachmentId={(editing[attachment.column] as string | null | undefined) ?? null}
                onChange={(attId) => {
                  const updated = { ...editing, [attachment.column]: attId };
                  setEditing(updated);
                  setEntries((list) => list.map((e) => (e.id === updated.id ? updated : e)));
                }}
              />
            )}
          </div>
        )}
      </Dialog>

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t.common.confirmDeleteTitle}
        description={t.common.confirmDeleteBody}
        closeLabel={t.common.close}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              {t.common.cancel}
            </Button>
            <Button variant="danger" loading={busy} onClick={confirmDelete}>
              {t.common.delete}
            </Button>
          </>
        }
      >
        {deleting && <p className="font-medium">{String(deleting[section.titleField] ?? "")}</p>}
      </Dialog>
    </Card>
  );
}
