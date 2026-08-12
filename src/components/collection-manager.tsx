import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DocEditor } from "@/components/doc-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createDocument,
  deleteDocuments,
  listDocuments,
  saveDocument,
  setDocumentField,
} from "@/lib/admin.functions";
import { CLIENT_COLLECTIONS, getPath, type Json, type JsonDoc } from "@/lib/collections";

function renderCell(value: unknown, kind?: string) {
  if (value === undefined || value === null || value === "")
    return <span className="text-muted-foreground">—</span>;
  if (kind === "image")
    return (
      <img
        src={String(value)}
        alt=""
        className="size-9 rounded-md border border-border object-cover"
      />
    );
  if (kind === "bool" || typeof value === "boolean")
    return value ? (
      <Badge variant="secondary">Yes</Badge>
    ) : (
      <span className="text-muted-foreground">No</span>
    );
  if (kind === "badge") return <Badge variant="outline">{String(value)}</Badge>;
  if (kind === "date") return <span className="text-xs">{String(value).slice(0, 16).replace("T", " ")}</span>;
  if (typeof value === "object") return <span className="font-mono text-xs">{JSON.stringify(value).slice(0, 60)}</span>;
  const text = String(value);
  return <span className="line-clamp-2">{text.length > 90 ? `${text.slice(0, 90)}…` : text}</span>;
}

export type CollectionManagerProps = {
  collection: string;
  title: string;
  description?: string;
  filter?: JsonDoc;
  /** Extra buttons rendered per row, e.g. approve / suspend. */
  rowActions?: (doc: JsonDoc, helpers: { setField: (field: string, value: Json) => void }) => React.ReactNode;
  canCreate?: boolean;
};

export function CollectionManager({
  collection,
  title,
  description,
  filter,
  rowActions,
  canCreate = true,
}: CollectionManagerProps) {
  const meta = CLIENT_COLLECTIONS[collection];
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<JsonDoc | null>(null);
  const [draft, setDraft] = useState<JsonDoc>({});
  const [isNew, setIsNew] = useState(false);
  const limit = 25;

  const key = ["docs", collection, term, page, filter] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      listDocuments({ data: { collection, q: term, page, limit, ...(filter ? { filter } : {}) } }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["docs", collection] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const saveMutation = useMutation({
    mutationFn: async (doc: JsonDoc) => {
      if (isNew) return createDocument({ data: { collection, doc } });
      return saveDocument({ data: { collection, id: String(editing?.["_id"]), patch: doc } });
    },
    onSuccess: () => {
      toast.success(isNew ? "Created" : "Saved");
      setEditing(null);
      setIsNew(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) => deleteDocuments({ data: { collection, ids } }),
    onSuccess: () => {
      toast.success("Deleted");
      setSelected([]);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fieldMutation = useMutation({
    mutationFn: (v: { ids: string[]; field: string; value: Json }) =>
      setDocumentField({ data: { collection, ...v } }),
    onSuccess: () => {
      toast.success("Updated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / limit));

  if (!meta) return <p className="text-destructive">Unknown collection: {collection}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setTerm(q);
            }}
          >
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="w-56 pl-8"
            />
          </form>
          <Button variant="ghost" size="icon" onClick={() => query.refetch()} aria-label="Refresh">
            <RefreshCw className={query.isFetching ? "size-4 animate-spin" : "size-4"} />
          </Button>
          {canCreate && meta.newDoc && (
            <Button
              onClick={() => {
                setIsNew(true);
                setDraft({ ...(meta.newDoc as JsonDoc) });
                setEditing({});
              }}
            >
              <Plus className="size-4" /> New
            </Button>
          )}
        </div>
      </div>

      {selected.length > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
          <span>{selected.length} selected</span>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => deleteMutation.mutate(selected)}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="size-3.5" /> Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">
                <Checkbox
                  checked={items.length > 0 && selected.length === items.length}
                  onCheckedChange={(c) =>
                    setSelected(c ? items.map((i) => String(i["_id"])) : [])
                  }
                />
              </TableHead>
              {meta.columns.map((c) => (
                <TableHead key={c.field} style={c.width ? { width: c.width } : undefined}>
                  {c.label}
                </TableHead>
              ))}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isLoading && (
              <TableRow>
                <TableCell colSpan={meta.columns.length + 2} className="py-10 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!query.isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={meta.columns.length + 2} className="py-10 text-center text-muted-foreground">
                  Nothing here yet.
                </TableCell>
              </TableRow>
            )}
            {items.map((doc) => {
              const id = String(doc["_id"]);
              return (
                <TableRow key={id}>
                  <TableCell>
                    <Checkbox
                      checked={selected.includes(id)}
                      onCheckedChange={(c) =>
                        setSelected((s) => (c ? [...s, id] : s.filter((x) => x !== id)))
                      }
                    />
                  </TableCell>
                  {meta.columns.map((c) => (
                    <TableCell key={c.field} className="max-w-[280px] align-middle">
                      {renderCell(getPath(doc, c.field), c.kind)}
                    </TableCell>
                  ))}
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      {meta.toggles?.map((t) => (
                        <label key={t.field} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {t.label}
                          <Switch
                            checked={!!doc[t.field]}
                            onCheckedChange={(v) =>
                              fieldMutation.mutate({ ids: [id], field: t.field, value: v })
                            }
                          />
                        </label>
                      ))}
                      {rowActions?.(doc, {
                        setField: (field, value) => fieldMutation.mutate({ ids: [id], field, value }),
                      })}
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Edit"
                        onClick={() => {
                          setIsNew(false);
                          setEditing(doc);
                          setDraft(doc);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Delete"
                        onClick={() => deleteMutation.mutate([id])}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} record{total === 1 ? "" : "s"} · page {page} of {pages}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="size-4" /> Prev
          </Button>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <Sheet
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            setIsNew(false);
          }
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>
              {isNew ? `New ${meta.label.replace(/s$/, "")}` : `Edit ${meta.label.replace(/s$/, "")}`}
            </SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-24">
            <DocEditor value={draft} onChange={setDraft} />
          </div>
          <div className="sticky bottom-0 flex gap-2 border-t border-border bg-card px-4 py-3">
            <Button
              onClick={() => saveMutation.mutate(draft)}
              disabled={saveMutation.isPending}
              className="flex-1"
            >
              {saveMutation.isPending ? "Saving…" : "Save changes"}
            </Button>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}