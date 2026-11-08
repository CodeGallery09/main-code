"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { MERGE_VARS } from "@/lib/app/workflow";
import type { MessageTemplate, TemplateKind } from "@/lib/data/types";
import { shortDate } from "@/lib/ws/format";
import { useAsync } from "@/lib/ws/use-async";
import { cn } from "@/lib/ws/utils";
import { Card, CardHeader, CardTitle, FILL } from "@/components/ws/ui/card";
import { Button } from "@/components/ws/ui/button";
import { ChannelTile } from "@/components/ws/ui/channel-tile";
import { Segmented } from "@/components/ws/ui/segmented";
import { Expand } from "@/components/ws/ui/motion";
import { EmptyState, LoadError, Skeleton } from "@/components/ws/ui/misc";

const KIND_NAME: Record<TemplateKind, string> = {
  li_invite: "Invite note",
  li_msg: "LinkedIn message",
  email: "Email",
};
const KIND_CHANNEL: Record<TemplateKind, "linkedin" | "email"> = {
  li_invite: "linkedin",
  li_msg: "linkedin",
  email: "email",
};
/** LinkedIn refuses a longer note; the builder caps it the same. */
const NOTE_LIMIT = 300;

const INPUT =
  "w-full rounded-lg border border-input bg-card px-[10px] py-[7px] text-[12px] leading-[1.5] placeholder:text-faint";

/**
 * The workspace's message templates: written once here, picked in the builder on the step they
 * fit. Picking copies the words into the step, so editing a template never changes a running plan.
 */
export function TemplatesCard() {
  const list = useAsync(() => api.templates(), []);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const templates = list.data?.templates ?? [];

  async function remove(id: string) {
    setRemoving(id);
    try {
      await api.deleteTemplate(id);
      list.reload();
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Card className={FILL}>
      <CardHeader>
        <CardTitle>Templates</CardTitle>
        <Button size="sm" variant={editing === "new" ? "default" : "outline"} onClick={() => setEditing(editing === "new" ? null : "new")}>
          {editing === "new" ? <X aria-hidden strokeWidth={2.2} /> : <Plus aria-hidden strokeWidth={2.2} />}
          {editing === "new" ? "Close" : "New template"}
        </Button>
      </CardHeader>

      <div className="px-4 pb-3 pt-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        <AnimatePresence initial={false}>
          {editing === "new" && (
            <Expand>
              <TemplateEditor
                onSaved={() => {
                  setEditing(null);
                  list.reload();
                }}
              />
            </Expand>
          )}
        </AnimatePresence>

        {list.state === "loading" ? (
          [0, 1].map((i) => <Skeleton key={i} className="my-2 h-[40px] rounded-lg" />)
        ) : list.state === "failed" ? (
          <LoadError message="We couldn't load your templates." onRetry={list.reload} />
        ) : templates.length === 0 && editing !== "new" ? (
          <EmptyState>No templates yet.</EmptyState>
        ) : (
          templates.map((t) => (
            <div key={t.id} className="border-b border-secondary last:border-b-0">
              <div className="flex items-center gap-3 py-[9px]">
                <ChannelTile channel={KIND_CHANNEL[t.kind]} />
                <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                  <span className="truncate text-[12.5px] font-semibold">{t.name}</span>
                  <span className="truncate text-[11.5px] text-muted-foreground">
                    {t.kind === "email" && t.subject ? `${t.subject} — ` : ""}
                    {t.body.replace(/\s+/g, " ")}
                  </span>
                </span>
                <span className="hidden shrink-0 flex-col items-end gap-[2px] sm:flex">
                  <span className="font-mono text-[10.5px] text-muted-foreground">{KIND_NAME[t.kind]}</span>
                  <span className="font-mono text-[10.5px] text-muted-foreground">{shortDate(t.updatedAt)}</span>
                </span>
                <Button
                  variant={editing === t.id ? "default" : "outline"}
                  size="icon-sm"
                  aria-expanded={editing === t.id}
                  aria-label={`Edit ${t.name}`}
                  onClick={() => setEditing(editing === t.id ? null : t.id)}
                >
                  {editing === t.id ? <X aria-hidden strokeWidth={2.2} /> : <Pencil aria-hidden strokeWidth={1.8} />}
                </Button>
                <Button
                  variant="danger"
                  size="icon-sm"
                  disabled={removing === t.id}
                  aria-label={`Delete ${t.name}`}
                  onClick={() => void remove(t.id)}
                >
                  <Trash2 aria-hidden strokeWidth={1.8} />
                </Button>
              </div>
              <AnimatePresence initial={false}>
                {editing === t.id && (
                  <Expand>
                    <TemplateEditor
                      template={t}
                      onSaved={() => {
                        setEditing(null);
                        list.reload();
                      }}
                    />
                  </Expand>
                )}
              </AnimatePresence>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

/** A new template, or an existing one's name, subject and words. Its type is fixed once saved. */
function TemplateEditor({ template, onSaved }: { template?: MessageTemplate; onSaved: () => void }) {
  const [kind, setKind] = useState<TemplateKind>(template?.kind ?? "li_invite");
  const [name, setName] = useState(template?.name ?? "");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = template?.id ?? "new";
  const over = kind === "li_invite" && body.length > NOTE_LIMIT;

  async function save() {
    setBusy(true);
    setError("");
    try {
      if (template) await api.updateTemplate(template.id, { name, body, ...(kind === "email" ? { subject } : {}) });
      else await api.createTemplate({ kind, name, body, ...(kind === "email" ? { subject } : {}) });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That template couldn't be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-3 flex flex-col gap-3 rounded-[10px] border border-border bg-chrome px-[14px] py-3">
      {!template ? (
        <Segmented<TemplateKind>
          label="Template type"
          value={kind}
          onChange={setKind}
          className="self-start"
          options={(Object.keys(KIND_NAME) as TemplateKind[]).map((k) => ({ value: k, label: KIND_NAME[k] }))}
        />
      ) : null}
      <div className="flex flex-col gap-[5px]">
        <label htmlFor={`tpl-${key}-name`} className="label-mono">
          Name
        </label>
        <input id={`tpl-${key}-name`} value={name} onChange={(e) => setName(e.target.value)} className={INPUT} />
      </div>
      {kind === "email" ? (
        <div className="flex flex-col gap-[5px]">
          <label htmlFor={`tpl-${key}-subject`} className="label-mono">
            Subject
          </label>
          <input id={`tpl-${key}-subject`} value={subject} onChange={(e) => setSubject(e.target.value)} className={INPUT} />
        </div>
      ) : null}
      <div className="flex flex-col gap-[5px]">
        <label htmlFor={`tpl-${key}-body`} className="label-mono">
          {kind === "li_invite" ? "Note" : "Message"}
        </label>
        <textarea
          id={`tpl-${key}-body`}
          rows={kind === "email" ? 7 : 4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={INPUT}
        />
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {MERGE_VARS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setBody((b) => `${b} ${v}`.trimStart())}
                className="rounded-md bg-accent px-[7px] py-[2px] font-mono text-[10.5px] text-body hover:bg-sunken"
              >
                {v}
              </button>
            ))}
          </div>
          {kind === "li_invite" ? (
            <span className={cn("font-mono text-[10.5px] text-muted-foreground", over && "text-warning")}>
              {body.length}/{NOTE_LIMIT}
            </span>
          ) : null}
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-[11.5px] text-warning">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button size="sm" disabled={busy || !name.trim() || !body.trim() || over} onClick={() => void save()}>
          {busy ? "Saving…" : template ? "Save changes" : "Save template"}
        </Button>
      </div>
    </div>
  );
}
