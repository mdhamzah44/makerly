import { createFileRoute } from "@tanstack/react-router";

import { CollectionManager } from "@/components/collection-manager";

export const Route = createFileRoute("/_admin/pages")({
  head: () => ({
    meta: [
      { title: "Pages · 1Antiq Admin" },
      { name: "description", content: "Edit static marketplace pages such as policies and help." },
      { property: "og:title", content: "Pages · 1Antiq Admin" },
      { property: "og:description", content: "Edit static marketplace pages." },
    ],
  }),
  component: () => (
    <CollectionManager
      collection="pages"
      title="Pages"
      description="Policy and help pages. Sections are edited as JSON: an array of { heading, body }."
    />
  ),
});