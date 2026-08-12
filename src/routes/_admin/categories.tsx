import { createFileRoute } from "@tanstack/react-router";

import { CollectionManager } from "@/components/collection-manager";

export const Route = createFileRoute("/_admin/categories")({
  head: () => ({
    meta: [
      { title: "Categories · 1Antiq Admin" },
      { name: "description", content: "Create and reorder marketplace browse categories." },
      { property: "og:title", content: "Categories · 1Antiq Admin" },
      { property: "og:description", content: "Manage browse categories." },
    ],
  }),
  component: () => (
    <CollectionManager
      collection="categories"
      title="Categories"
      description="Browse categories shown across the storefront. Position controls the order."
    />
  ),
});