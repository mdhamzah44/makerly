import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { entityByKey, type EntityField } from "@/lib/entities";
import { iconFor } from "@/lib/icon-map";
import {
  createRecord,
  deleteRecord,
  exportRecords,
  getRecord,
  listRecords,
  patchRecord,
} from "@/lib/admin.functions";
import { money, shortDate } from "@/lib/format";

export const Route = createFileRoute("/dashboard/data/$entity")({
  component: EntityBrowser,
});

type Row = Record<string, unknown> & { _id: string };

const BADGE_TONE: Record<string, string> = {
  published: "border-transparent bg-success/15 text-success",
  verified: "border-transparent bg-success/15 text-success",
  approved: "border-transparent bg-success/15 text-success",
  paid: "border-transparent bg-success/15 text-success",
  resolved: "border-transparent bg-success/15 text-success",
  active: "border-transparent bg-success/15 text-success",
  success: "border-transparent bg-success/15 text-success",
  sent: "border-transparent bg-success/15 text-success",
  delivered: "border-transparent bg-success/15 text-success",
  closed: "border-transparent bg-success/15 text-success",
  pending: "border-transparent bg-warning/20 text-warning-foreground",
  under_review: "border-transparent bg-warning/20 text-warning-foreground",
  requested: "border-transparent bg-warning/20 text-warning-foreground",
  scheduled: "border-transparent bg-warning/20 text-warning-foreground",
  processing: "border-transparent bg-warning/20 text-warning-foreground",
  open: "border-transparent bg-warning/20 text-warning-foreground",
  draft: "border-border bg-secondary text-secondary-foreground",
  rejected: "border-transparent bg-destructive/15 text-destructive",
  cancelled: "border-transparent bg-destructive/15 text-destructive",
  failed: "border-transparent bg-destructive/15 text-destructive",
  refund_pending: "border-transparent bg-destructive/15 text-destructive",
};

/** Reads a possibly dot-notation path ("verification.status") out of a nested doc. */
function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

function BadgeValue({ value }: { value: string }) {
  const key = value.toLowerCase().replace(/\s+/g, "_");
  const tone = BADGE_TONE[key] ?? "border-border bg-secondary text-secondary-foreground";
  return <Badge className={`font-medium ${tone}`}>{value.replace(/_/g, " ")}</Badge>;
}

function display(value: unknown, type?: string) {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "date") return shortDate(String(value));
  if (type === "money") return money(Number(value));
  if (type === "badge") return <BadgeValue value={String(value)} />;
  if (type === "image" && typeof value === "string") {
    return (
      <img src={value} alt="" className="h-8 w-8 rounded-md border border-border object-cover" />
    );
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object") return "{…}";
  return String(value).slice(0, 120);
}

/** Full, read-only rendering used in the "View details" dialog — every field, not just list columns. */
function DetailValue({ value, type }: { value: unknown; type?: string | undefined }) {
  if (value === null || value === undefined || value === "")
    return <span className="text-muted-foreground">—</span>;
  if (type === "date") return <>{shortDate(String(value))}</>;
  if (type === "money") return <>{money(Number(value))}</>;
  if (type === "badge") return <BadgeValue value={String(value)} />;
  if (typeof value === "boolean") return <>{value ? "Yes" : "No"}</>;
  if (type === "image" && typeof value === "string") {
    return (
      <img src={value} alt="" className="h-20 w-20 rounded-md border border-border object-cover" />
    );
  }
  if (Array.isArray(value) && value.every((v) => v && typeof v === "object" && "url" in v)) {
    return (
      <div className="flex flex-wrap gap-2">
        {(value as { url: string }[]).map((img, i) => (
          <img
            key={i}
            src={img.url}
            alt=""
            className="h-16 w-16 rounded-md border border-border object-cover"
          />
        ))}
      </div>
    );
  }
  if (typeof value === "object") {
    return (
      <pre className="max-h-64 overflow-auto rounded-md bg-secondary/50 p-2 text-xs whitespace-pre-wrap">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  return <span className="whitespace-pre-wrap break-words">{String(value)}</span>;
}

function EntityBrowser() {
  const { entity } = useParams({ from: "/dashboard/data/$entity" });
  const def = entityByKey(entity);
  const qc = useQueryClient();
  const list = useServerFn(listRecords);
  const patch = useServerFn(patchRecord);
  const create = useServerFn(createRecord);
  const remove = useServerFn(deleteRecord);
  const exportFn = useServerFn(exportRecords);
  const getOne = useServerFn(getRecord);

  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [filterIndex, setFilterIndex] = useState(-1);
  const [editing, setEditing] = useState<Row | null>(null);
  const [viewing, setViewing] = useState<Row | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const filter = filterIndex >= 0 ? (def?.filters?.[filterIndex]?.query ?? null) : null;

  const { data, isFetching } = useQuery({
    queryKey: ["entity", entity, q, page, filterIndex],
    queryFn: () => list({ data: { entity, q, page, filter } }),
    staleTime: 30_000,
    enabled: !!def,
  });

  const listFields = useMemo(() => (def?.fields ?? []).filter((f) => f.list).slice(0, 6), [def]);
  const editableFields = useMemo(() => (def?.fields ?? []).filter((f) => f.editable), [def]);

  if (!def) return <p className="text-muted-foreground">Unknown collection.</p>;

  const draftFromFields = (fields: EntityField[], source: Row | null) => {
    const next: Record<string, string> = {};
    for (const f of fields) {
      const v = source ? getPath(source, f.key) : undefined;
      next[f.key] =
        v === null || v === undefined
          ? ""
          : typeof v === "object"
            ? JSON.stringify(v, null, 2)
            : String(v);
    }
    return next;
  };

  const openEditor = (row: Row) => {
    setEditing(row);
    setDraft(draftFromFields(editableFields, row));
  };

  const openCreator = () => {
    setCreating(true);
    setDraft(draftFromFields(editableFields, null));
  };

  const openViewer = async (row: Row) => {
    setViewing(row);
    try {
      const full = (await getOne({ data: { entity, id: row._id } })) as Row;
      setViewing(full);
    } catch {
      /* fall back to the row already shown in the table */
    }
  };

  const buildPayload = () => {
    const payload: Record<string, unknown> = {};
    for (const f of editableFields) {
      const raw = draft[f.key] ?? "";
      if (f.type === "boolean") payload[f.key] = raw === "true";
      else if (f.type === "number" || f.type === "money")
        payload[f.key] = raw === "" ? undefined : Number(raw) || 0;
      else if (f.type === "json") {
        if (!raw.trim()) continue;
        try {
          payload[f.key] = JSON.parse(raw);
        } catch {
          toast.error(`${f.label} isn't valid JSON.`);
          throw new Error("invalid_json");
        }
      } else payload[f.key] = raw;
    }
    return payload;
  };

  const save = async () => {
    if (!editing) return;
    let payload: Record<string, unknown>;
    try {
      payload = buildPayload();
    } catch {
      return;
    }
    setSaving(true);
    try {
      await patch({ data: { entity, id: editing._id, patch: payload } });
      toast.success("Saved.");
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ["entity", entity] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const saveNew = async () => {
    let payload: Record<string, unknown>;
    try {
      payload = buildPayload();
    } catch {
      return;
    }
    setSaving(true);
    try {
      await create({ data: { entity, patch: payload } });
      toast.success(`${def.label} created.`);
      setCreating(false);
      void qc.invalidateQueries({ queryKey: ["entity", entity] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const Icon = iconFor(def.icon);

  const renderField = (f: EntityField) => {
    const badgeOptions = def.filters
      ? Array.from(
          new Set(
            def.filters
              .map((flt) => flt.query[f.key])
              .filter((v): v is string => typeof v === "string"),
          ),
        )
      : [];
    if (f.type === "boolean") {
      return (
        <select
          id={f.key}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={draft[f.key] || "false"}
          onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
        >
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
    }
    if (f.type === "json" || f.multiline) {
      return (
        <textarea
          id={f.key}
          rows={f.type === "json" ? 6 : 3}
          className={`w-full rounded-md border border-input bg-background px-3 py-2 text-sm ${f.type === "json" ? "font-mono text-xs" : ""}`}
          value={draft[f.key] ?? ""}
          onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
        />
      );
    }
    if (f.type === "date") {
      const v = draft[f.key] ?? "";
      const asDateInput = v ? v.slice(0, 10) : "";
      return (
        <Input
          id={f.key}
          type="date"
          value={asDateInput}
          onChange={(e) =>
            setDraft({
              ...draft,
              [f.key]: e.target.value ? new Date(e.target.value).toISOString() : "",
            })
          }
        />
      );
    }
    if (f.type === "number" || f.type === "money") {
      return (
        <Input
          id={f.key}
          type="number"
          step={f.type === "money" ? "0.01" : "1"}
          value={draft[f.key] ?? ""}
          onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
        />
      );
    }
    return (
      <>
        <Input
          id={f.key}
          list={badgeOptions.length ? `${f.key}-options` : undefined}
          value={draft[f.key] ?? ""}
          onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
        />
        {badgeOptions.length > 0 && (
          <datalist id={`${f.key}-options`}>
            {badgeOptions.map((opt) => (
              <option key={opt} value={opt} />
            ))}
          </datalist>
        )}
      </>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{def.group}</p>
          <h1 className="font-display text-2xl font-semibold">{def.plural}</h1>
        </div>
        {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        <span className="text-sm text-muted-foreground">{data?.total ?? 0} records</span>
        <div className="ml-auto flex gap-2">
          {editableFields.length > 0 && (
            <Button size="sm" onClick={openCreator}>
              <Plus className="mr-2 h-4 w-4" />
              Add {def.label.toLowerCase()}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void exportFn({ data: { entity, q } }).then((res) => {
                const blob = new Blob([JSON.stringify(res.rows, null, 2)], {
                  type: "application/json",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${entity}.json`;
                a.click();
                URL.revokeObjectURL(url);
              });
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {def.hint && <p className="text-sm text-muted-foreground">{def.hint}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder={`Search ${def.plural.toLowerCase()}…`}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
        {(def.filters ?? []).map((f, i) => (
          <Button
            key={f.label}
            size="sm"
            variant={filterIndex === i ? "default" : "outline"}
            onClick={() => {
              setFilterIndex(filterIndex === i ? -1 : i);
              setPage(1);
            }}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <div className="surface-card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              {listFields.map((f) => (
                <th key={f.key} className="px-4 py-3 font-medium">
                  {f.label}
                </th>
              ))}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((row) => (
              <tr
                key={(row as Row)._id}
                className="border-b border-border/60 last:border-0 hover:bg-secondary/40"
              >
                {listFields.map((f) => (
                  <td key={f.key} className="px-4 py-3 align-top">
                    {display(getPath(row, f.key), f.type)}
                  </td>
                ))}
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => void openViewer(row as Row)}>
                    View
                  </Button>
                  {editableFields.length > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => openEditor(row as Row)}>
                      Edit
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (!confirm("Delete this record permanently?")) return;
                      void remove({ data: { entity, id: (row as Row)._id } }).then(() => {
                        toast.success("Deleted.");
                        return qc.invalidateQueries({ queryKey: ["entity", entity] });
                      });
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
            {!data?.rows?.length && (
              <tr>
                <td
                  colSpan={listFields.length + 1}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  No records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {data?.page ?? 1} of {data?.pages ?? 1}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={(data?.page ?? 1) >= (data?.pages ?? 1)}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>

      {/* View details — read-only, shows every field including non-editable/system data */}
      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{def.label} details</DialogTitle>
          </DialogHeader>
          {viewing && (
            <dl className="grid gap-3 sm:grid-cols-2">
              {def.fields.map((f) => (
                <div
                  key={f.key}
                  className={f.type === "json" ? "sm:col-span-2 space-y-1" : "space-y-1"}
                >
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {f.label}
                  </dt>
                  <dd className="text-sm">
                    <DetailValue value={getPath(viewing, f.key)} type={f.type} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit {def.label.toLowerCase()}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {editableFields.map((f) => (
              <div
                key={f.key}
                className={
                  f.type === "json" || f.multiline ? "space-y-1 sm:col-span-2" : "space-y-1"
                }
              >
                <Label htmlFor={f.key}>{f.label}</Label>
                {renderField(f)}
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
              <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create */}
      <Dialog open={creating} onOpenChange={(v) => !v && setCreating(false)}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add {def.label.toLowerCase()}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {editableFields.map((f) => (
              <div
                key={f.key}
                className={
                  f.type === "json" || f.multiline ? "space-y-1 sm:col-span-2" : "space-y-1"
                }
              >
                <Label htmlFor={f.key}>{f.label}</Label>
                {renderField(f)}
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
              <Button variant="outline" onClick={() => setCreating(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={() => void saveNew()} disabled={saving}>
                {saving ? "Creating…" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
