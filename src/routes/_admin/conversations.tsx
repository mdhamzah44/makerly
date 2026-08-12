import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { listDocuments, loadThread, replyThread, setDocumentField } from "@/lib/admin.functions";
import type { JsonDoc } from "@/lib/collections";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_admin/conversations")({
  head: () => ({
    meta: [
      { title: "Conversations · 1Antiq Admin" },
      { name: "description", content: "Read and reply to customer and seller conversations." },
      { property: "og:title", content: "Conversations · 1Antiq Admin" },
      { property: "og:description", content: "Reply to customer conversations." },
    ],
  }),
  component: ConversationsPage,
});

function ConversationsPage() {
  const qc = useQueryClient();
  const [active, setActive] = useState<string | null>(null);
  const [body, setBody] = useState("");

  const list = useQuery({
    queryKey: ["docs", "conversations"],
    queryFn: () => listDocuments({ data: { collection: "conversations", limit: 100 } }),
  });

  const thread = useQuery({
    queryKey: ["thread", active],
    queryFn: () => loadThread({ data: { id: active as string } }),
    enabled: !!active,
  });

  const reply = useMutation({
    mutationFn: () => replyThread({ data: { id: active as string, body } }),
    onSuccess: () => {
      setBody("");
      void qc.invalidateQueries({ queryKey: ["thread", active] });
      void qc.invalidateQueries({ queryKey: ["docs", "conversations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const close = useMutation({
    mutationFn: (status: string) =>
      setDocumentField({
        data: { collection: "conversations", ids: [active as string], field: "status", value: status },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["docs", "conversations"] });
      void qc.invalidateQueries({ queryKey: ["thread", active] });
    },
  });

  const items = (list.data?.items ?? []) as JsonDoc[];
  const current = thread.data?.conversation;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Conversations</h1>
        <p className="text-sm text-muted-foreground">Support and store threads, answered as staff.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-card">
          {items.length === 0 && <p className="p-4 text-sm text-muted-foreground">No conversations yet.</p>}
          {items.map((c) => {
            const id = String(c["_id"]);
            return (
              <button
                key={id}
                onClick={() => setActive(id)}
                className={cn(
                  "block w-full border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent/50",
                  active === id && "bg-accent",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="line-clamp-1 text-sm font-medium">{String(c["subject"] ?? "Conversation")}</span>
                  {Number(c["unread_staff"] ?? 0) > 0 && <Badge>{String(c["unread_staff"])}</Badge>}
                </div>
                <p className="line-clamp-1 text-xs text-muted-foreground">
                  {String(c["user_name"] ?? "")} · {String(c["last_message"] ?? "")}
                </p>
              </button>
            );
          })}
        </div>

        <div className="flex min-h-[70vh] flex-col rounded-lg border border-border bg-card">
          {!active && (
            <p className="m-auto text-sm text-muted-foreground">Select a conversation to read it.</p>
          )}
          {active && (
            <>
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <div>
                  <p className="font-medium">{String(current?.["subject"] ?? "Conversation")}</p>
                  <p className="text-xs text-muted-foreground">
                    {String(current?.["user_name"] ?? "")} · {String(current?.["store_name"] ?? "Support")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => close.mutate(current?.["status"] === "closed" ? "open" : "closed")}
                >
                  {current?.["status"] === "closed" ? "Reopen" : "Close"}
                </Button>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {(thread.data?.messages ?? []).map((m) => {
                  const staff = m["role"] !== "user";
                  return (
                    <div
                      key={String(m["_id"])}
                      className={cn("max-w-[75%] rounded-lg px-3 py-2 text-sm", staff ? "ml-auto bg-primary/15" : "bg-muted")}
                    >
                      <p className="mb-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                        {String(m["author_name"] ?? m["role"])}
                      </p>
                      <p className="whitespace-pre-wrap">{String(m["body"] ?? "")}</p>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-end gap-2 border-t border-border p-3">
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={2}
                  placeholder="Write a reply as support…"
                />
                <Button onClick={() => reply.mutate()} disabled={!body.trim() || reply.isPending}>
                  Send
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}