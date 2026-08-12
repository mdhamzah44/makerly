import { createFileRoute } from "@tanstack/react-router";

import { CollectionManager } from "@/components/collection-manager";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_admin/users")({
  head: () => ({
    meta: [
      { title: "Users · 1Antiq Admin" },
      { name: "description", content: "Suspend, restore and edit marketplace shopper accounts." },
      { property: "og:title", content: "Users · 1Antiq Admin" },
      { property: "og:description", content: "Manage marketplace shopper accounts." },
    ],
  }),
  component: UsersPage,
});

function UsersPage() {
  return (
    <CollectionManager
      collection="users"
      title="Marketplace users"
      description="Shopper and seller-owner accounts. Console credentials live under Admin accounts."
      rowActions={(doc, { setField }) => (
        <Button
          size="sm"
          variant={doc["is_suspended"] ? "secondary" : "outline"}
          onClick={() => setField("is_suspended", !doc["is_suspended"])}
        >
          {doc["is_suspended"] ? "Restore" : "Suspend"}
        </Button>
      )}
    />
  );
}