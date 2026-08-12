import { createFileRoute } from "@tanstack/react-router";

import { CollectionManager } from "@/components/collection-manager";

export const Route = createFileRoute("/_admin/audit")({
  head: () => ({
    meta: [
      { title: "Audit log · 1Antiq Admin" },
      { name: "description", content: "Every change made through the admin console." },
      { property: "og:title", content: "Audit log · 1Antiq Admin" },
      { property: "og:description", content: "Every change made through the console." },
    ],
  }),
  component: () => (
    <CollectionManager
      collection="admin_audit"
      title="Audit log"
      description="Read-only record of every write performed from this console."
      canCreate={false}
    />
  ),
});