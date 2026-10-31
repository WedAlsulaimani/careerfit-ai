"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/client";
import { api, errorMessage } from "@/lib/api-client";
import { APPLICATION_STATUSES } from "@/lib/schemas/application";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form-controls";
import { Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

export interface ApplicationRow {
  opportunity_id: string;
  status: string;
  applied_on: string | null;
  notes: string | null;
  updated_at: string;
  title: string | null;
  organization: string | null;
}

export function ApplicationsTable({ rows }: { rows: ApplicationRow[] }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState("all");
  const visible = rows.filter((r) => filter === "all" || r.status === filter);

  return (
    <div className="space-y-4">
      <Select aria-label={t.applications.status} value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs">
        <option value="all">{t.applications.filterAll}</option>
        {APPLICATION_STATUSES.map((s) => (
          <option key={s} value={s}>
            {t.enums.applicationStatus[s]}
          </option>
        ))}
      </Select>
      <Card>
        <ul className="divide-y divide-border">
          {visible.map((r) => (
            <ApplicationItem key={r.opportunity_id} row={r} />
          ))}
        </ul>
      </Card>
    </div>
  );
}

function ApplicationItem({ row }: { row: ApplicationRow }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [status, setStatus] = useState(row.status);
  const [appliedOn, setAppliedOn] = useState(row.applied_on ?? "");
  const [notes, setNotes] = useState(row.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState({ status: row.status, appliedOn: row.applied_on ?? "", notes: row.notes ?? "" });
  const dirty = status !== saved.status || appliedOn !== saved.appliedOn || notes !== saved.notes;

  const save = async () => {
    setBusy(true);
    try {
      await api(`/api/applications/${row.opportunity_id}`, { method: "PUT", body: { status, applied_on: appliedOn, notes } });
      toast.success(t.opportunity.statusSaved);
      setSaved({ status, appliedOn, notes });
    } catch (err) {
      toast.error(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="grid gap-3 p-4 lg:grid-cols-[1.4fr_180px_160px_1.4fr_auto] lg:items-start">
      <div className="min-w-0">
        <Link href={`/opportunities/${row.opportunity_id}`} className="block truncate font-medium hover:text-accent" dir="auto">
          {row.title || t.opportunity.untitled}
        </Link>
        <p className="truncate text-xs text-muted-foreground" dir="auto">
          {row.organization} · {t.applications.updated} {formatDate(row.updated_at, locale)}
        </p>
      </div>
      <Select aria-label={t.applications.status} value={status} onChange={(e) => setStatus(e.target.value)}>
        {APPLICATION_STATUSES.map((s) => (
          <option key={s} value={s}>
            {t.enums.applicationStatus[s]}
          </option>
        ))}
      </Select>
      <Input aria-label={t.applications.appliedOn} type="date" value={appliedOn} onChange={(e) => setAppliedOn(e.target.value)} />
      <Textarea aria-label={t.applications.notes} rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t.applications.notes} />
      <Button size="sm" variant="secondary" onClick={save} loading={busy} disabled={!dirty}>
        {t.common.save}
      </Button>
    </li>
  );
}
