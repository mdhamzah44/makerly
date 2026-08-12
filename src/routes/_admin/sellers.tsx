import { createFileRoute } from "@tanstack/react-router";

import { CollectionManager } from "@/components/collection-manager";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_admin/sellers")({
  head: () => ({
    meta: [
      { title: "Sellers · 1Antiq Admin" },
      { name: "description", content: "Approve, suspend and edit marketplace seller stores." },
      { property: "og:title", content: "Sellers · 1Antiq Admin" },
      { property: "og:description", content: "Approve or suspend marketplace stores." },
    ],
  }),
  component: SellersPage,
});

function SellersPage() {
  return (
    <CollectionManager
      collection="sellers"
      title="Sellers"
      description="Approve new stores, suspend bad actors and edit any store detail."
      rowActions={(doc, { setField }) => {
        const status = String(doc["status"] ?? "pending");
        return (
          <div className="flex gap-1">
            {status !== "approved" && (
              <Button size="sm" variant="secondary" onClick={() => setField("status", "approved")}>
                Approve
              </Button>
            )}
            {status !== "suspended" ? (
              <Button size="sm" variant="outline" onClick={() => setField("status", "suspended")}>
                Suspend
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setField("status", "approved")}>
                Unsuspend
              </Button>
            )}
          </div>
        );
      }}
    />
  );
}