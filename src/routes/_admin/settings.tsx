import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DocEditor } from "@/components/doc-editor";
import { Button } from "@/components/ui/button";
import { loadSiteSettings, saveSiteSettingsFn } from "@/lib/admin.functions";
import type { JsonDoc } from "@/lib/collections";

export const Route = createFileRoute("/_admin/settings")({
  head: () => ({
    meta: [
      { title: "Site settings · 1Antiq Admin" },
      { name: "description", content: "Edit storefront branding, SEO, hero, promos and commerce copy." },
      { property: "og:title", content: "Site settings · 1Antiq Admin" },
      { property: "og:description", content: "Edit storefront branding and copy." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["site-settings"], queryFn: () => loadSiteSettings() });
  const [draft, setDraft] = useState<JsonDoc>({});

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const save = useMutation({
    mutationFn: () => saveSiteSettingsFn({ data: { patch: draft } }),
    onSuccess: () => {
      toast.success("Settings saved");
      void qc.invalidateQueries({ queryKey: ["site-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-muted-foreground">Loading settings…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Site settings</h1>
          <p className="text-sm text-muted-foreground">
            Every storefront setting — branding, header, hero, promos, popup, commerce copy, SEO and translations.
          </p>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save settings"}
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <DocEditor value={draft} onChange={setDraft} />
      </div>
    </div>
  );
}