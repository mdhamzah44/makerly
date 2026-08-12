import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { CollectionManager } from "@/components/collection-manager";
import { Button } from "@/components/ui/button";
import { CLIENT_COLLECTIONS } from "@/lib/collections";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_admin/media")({
  head: () => ({
    meta: [
      { title: "Data browser · 1Antiq Admin" },
      { name: "description", content: "Inspect and edit any collection in the marketplace database." },
      { property: "og:title", content: "Data browser · 1Antiq Admin" },
      { property: "og:description", content: "Edit any collection in the database." },
    ],
  }),
  component: DataBrowser,
});

const KEYS = Object.keys(CLIENT_COLLECTIONS);

function DataBrowser() {
  const [active, setActive] = useState<string>("events");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {KEYS.map((key) => (
          <Button
            key={key}
            size="sm"
            variant={active === key ? "default" : "outline"}
            className={cn(active === key && "font-semibold")}
            onClick={() => setActive(key)}
          >
            {CLIENT_COLLECTIONS[key]?.label ?? key}
          </Button>
        ))}
      </div>

      <CollectionManager
        key={active}
        collection={active}
        title={CLIENT_COLLECTIONS[active]?.label ?? active}
        description="Raw database access — every field of every document is editable here."
      />
    </div>
  );
}