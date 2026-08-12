import { createFileRoute } from "@tanstack/react-router";

import { CollectionManager } from "@/components/collection-manager";

export const Route = createFileRoute("/_admin/products")({
  head: () => ({
    meta: [
      { title: "Products · 1Antiq Admin" },
      { name: "description", content: "Create, edit, feature and remove marketplace listings." },
      { property: "og:title", content: "Products · 1Antiq Admin" },
      { property: "og:description", content: "Manage every marketplace listing." },
    ],
  }),
  component: () => (
    <CollectionManager
      collection="products"
      title="Products"
      description="Every listing in the catalogue. Edit any field, toggle merchandising flags or remove a listing."
    />
  ),
});