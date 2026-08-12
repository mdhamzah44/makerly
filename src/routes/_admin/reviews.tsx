import { createFileRoute } from "@tanstack/react-router";

import { CollectionManager } from "@/components/collection-manager";

export const Route = createFileRoute("/_admin/reviews")({
  head: () => ({
    meta: [
      { title: "Reviews · 1Antiq Admin" },
      { name: "description", content: "Moderate customer reviews across the marketplace." },
      { property: "og:title", content: "Reviews · 1Antiq Admin" },
      { property: "og:description", content: "Moderate customer reviews." },
    ],
  }),
  component: () => (
    <CollectionManager
      collection="reviews"
      title="Reviews"
      description="Moderate customer feedback. Deleting a review removes it from the product page."
    />
  ),
});