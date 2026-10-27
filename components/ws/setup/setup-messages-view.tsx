"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence } from "framer-motion";
import { Pencil, X } from "lucide-react";
import { api } from "@/lib/api";
import { MERGE_VARS, type StepNode, type WorkflowGraph } from "@/lib/app/workflow";
import type { Channel, WorkflowRecord } from "@/lib/data/types";
import { CHANNEL_NAME } from "@/lib/ws/channels";
import { bodyField, firstLine, readMessages, type MessageRow } from "@/lib/ws/messages";
import { shortDate } from "@/lib/ws/format";
import { useAsync } from "@/lib/ws/use-async";
import { cn } from "@/lib/ws/utils";
import { PageBody, PageHeader, SetupTabs, TopBar } from "@/components/ws/shell/page";
import { useWorkspace } from "@/components/ws/shell/workspace-context";
import { Card, CardHeader, CardTitle } from "@/components/ws/ui/card";
import { Button } from "@/components/ws/ui/button";
import { ChannelTile } from "@/components/ws/ui/channel-tile";
import { Segmented } from "@/components/ws/ui/segmented";
import { Appear, Expand } from "@/components/ws/ui/motion";
import { EmptyState, LoadError, SearchInput, Skeleton } from "@/components/ws/ui/misc";

type Filter = "all" | Channel;

/**
 * Setup · Messages.
 *
 * The reference calls this tab Templates, and describes a shared library where
 * one edit changes every strategy that uses it. This product has no such
 * library: a message lives on the step that sends it. So the tab shows the
 * real copy out of every plan, with the strategy it belongs to, and says
 * plainly that an edit changes that one step.
 */
export function SetupMessagesView() {
  const { badges } = useWorkspace();
  const workflows = useAsync(() => api.workflows(), []);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const rows = useMemo(() => readMessages(workflows.data?.items ?? []), [workflows.data]);
  const needle = q.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      (filter === "all" || r.channel === filter) &&
      (!needle ||
        r.strategyName.toLowerCase().includes(needle) ||
        r.body.toLowerCase().includes(needle) ||
        (r.subject ?? "").toLowerCase().includes(needle)),
  );
  const count = (f: Filter) => (f === "all" ? rows.length : rows.filter((r) => r.channel === f).length);
  const channels: Filter[] = ["all", ...([...new Set(rows.map((r) => r.channel))] as Channel[])];

  return (
    <>
      <TopBar title="Setup" />
      <SetupTabs
        issues={badges.config}
        right={<SearchInput id="message-search" placeholder="Search messages" value={q} onChange={setQ} className="w-[240px]" />}
      />
      <PageBody className="gap-[18px]">
        <Appear>
          <PageHeader
            title="Messages"
            subtitle="Every message in your plans, with the strategy it belongs to. Editing one changes that step — there is no shared template library yet, so nothing else moves with it."
          />
        </Appear>

        {rows.length > 0 && (
          <Appear index={1}>
            <Segmented<Filter>
              label="Filter by channel"
              value={filter}
              onChange={setFilter}
              className="self-start"
              options={channels.map((c) => ({
                value: c,
                label: c === "all" ? "All" : CHANNEL_NAME[c],
                count: count(c),
              }))}
            />
          </Appear>
        )}

        <Appear index={2}>
          <Card>
            <CardHeader>
              <CardTitle>{filter === "all" ? "All messages" : `${CHANNEL_NAME[filter]} messages`}</CardTitle>
              <span className="font-mono text-[11px] text-muted-foreground">
                {shown.length} {shown.length === 1 ? "message" : "messages"}
              </span>
            </CardHeader>

            {workflows.state === "loading" ? (
              <div className="px-[18px] py-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3 border-b border-divider py-[14px] last:border-b-0">
                    <Skeleton className="size-[32px] rounded-lg" />
                    <Skeleton className="h-[12px] flex-1" />
                  </div>
                ))}
              </div>
            ) : workflows.state === "failed" ? (
              <LoadError message="We couldn't load your messages." onRetry={workflows.reload} />
            ) : shown.length === 0 ? (
              <EmptyState>
                {rows.length === 0
                  ? "No messages yet. They appear here as soon as a strategy has a touch that sends one."
                  : "No messages match this filter."}
              </EmptyState>
            ) : (
              <div className="px-[18px] pb-3 pt-1">
                {shown.map((row) => (
                  <div key={row.key} className="border-b border-secondary last:border-b-0">
                    <div className="flex flex-wrap items-center gap-3 py-[13px]">
                      <ChannelTile channel={row.channel} />
                      <span className="flex min-w-0 flex-1 basis-[280px] flex-col gap-[2px]">
                        <span className="truncate text-[13.5px] font-semibold">{row.what}</span>
                        <span className="truncate text-[12.5px] text-muted-foreground">{firstLine(row)}</span>
                      </span>
                      <span className="flex shrink-0 basis-[180px] flex-col gap-[2px]">
                        <Link
                          href={`/dashboard/workflows/${row.strategyId}`}
                          className="truncate font-mono text-[10.5px] text-muted-foreground hover:underline"
                        >
                          {row.strategyName}
                        </Link>
                        <span className="font-mono text-[10.5px] text-muted-foreground">
                          edited {shortDate(row.updatedAt)}
                        </span>
                      </span>
                      <Button
                        variant={editing === row.key ? "default" : "outline"}
                        size="icon-sm"
                        aria-expanded={editing === row.key}
                        aria-label={`Edit the ${row.what.toLowerCase()} in ${row.strategyName}`}
                        onClick={() => setEditing(editing === row.key ? null : row.key)}
                      >
                        {editing === row.key ? <X aria-hidden strokeWidth={2.2} /> : <Pencil aria-hidden strokeWidth={1.8} />}
                      </Button>
                    </div>
                    <AnimatePresence initial={false}>
                      {editing === row.key && (
                        <Expand>
                          <MessageEditor
                            row={row}
                            records={workflows.data?.items ?? []}
                            onSaved={() => {
                              setEditing(null);
                              workflows.reload();
                            }}
                          />
                        </Expand>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Appear>

        <p className="rounded-[10px] bg-accent px-[15px] py-[13px] text-[12.5px] leading-[1.55] text-muted-foreground">
          WhatsApp and SMS messages would need approval before they could send — WhatsApp by Meta, SMS through DLT
          registration. Neither channel is connected, which is why neither is offered in the builder.
        </p>
      </PageBody>
    </>
  );
}

/** Edit one step's copy and write it back to that strategy's plan. */
function MessageEditor({
  row,
  records,
  onSaved,
}: {
  row: MessageRow;
  records: WorkflowRecord[];
  onSaved: () => void;
}) {
  const [subject, setSubject] = useState(row.subject ?? "");
  const [body, setBody] = useState(row.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const record = records.find((r) => r.strategyId === row.strategyId);
    if (!record) {
      setError("That strategy could not be found any more.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const field = bodyField(row.kind);
      const graph: WorkflowGraph = {
        ...record.graph,
        nodes: (record.graph.nodes as StepNode[]).map((n) =>
          n.id === row.nodeId
            ? { ...n, data: { ...n.data, [field]: body, ...(row.subject !== null ? { subject } : {}) } }
            : n,
        ),
      };
      await api.saveWorkflow(row.strategyId, { name: record.name, graph });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That message could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-[13px] flex flex-col gap-3 rounded-[10px] border border-border bg-chrome px-[14px] py-3">
      {row.subject !== null && (
        <div className="flex flex-col gap-[5px]">
          <label htmlFor={`${row.key}-subject`} className="label-mono">
            Subject
          </label>
          <input
            id={`${row.key}-subject`}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="h-[34px] rounded-lg border border-input bg-card px-[11px] text-[13px]"
          />
        </div>
      )}

      <div className="flex flex-col gap-[5px]">
        <label htmlFor={`${row.key}-body`} className="label-mono">
          {row.kind === "call" ? "What to cover on the call" : "Message"}
        </label>
        <textarea
          id={`${row.key}-body`}
          rows={7}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full resize-y rounded-lg border border-input bg-card px-[12px] py-[9px] text-[13.5px] leading-[1.6]"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="label-mono">Insert</span>
        {MERGE_VARS.map((token) => (
          <button
            key={token}
            type="button"
            onClick={() => setBody((b) => `${b}${token}`)}
            className={cn(
              "inline-flex h-[26px] items-center rounded-md border border-input bg-card px-[9px] font-mono text-[11px]",
            )}
          >
            {token}
          </button>
        ))}
      </div>

      <p className="text-[12px] leading-[1.55] text-muted-foreground">
        A token with nothing behind it sends as a blank, so keep one out unless every lead in the audience has it.
        {row.kind === "li_invite" ? " LinkedIn invite notes are limited to 300 characters." : ""}
      </p>

      {error ? (
        <p role="alert" className="text-[12.5px] text-warning">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        {row.kind === "li_invite" && (
          <span className={cn("font-mono text-[11px]", body.length > 300 ? "text-warning" : "text-muted-foreground")}>
            {body.length} / 300
          </span>
        )}
        <Button size="sm" disabled={busy || (row.kind === "li_invite" && body.length > 300)} onClick={() => void save()}>
          {busy ? "Saving…" : "Save the message"}
        </Button>
      </div>
    </div>
  );
}
