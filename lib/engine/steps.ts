/**
 * What happens when a lead reaches one step of a plan — as data, with no side effects.
 *
 * The runner (in the repository) loads a due job, calls `runStep`, and applies what comes back:
 * log lines, a to-do for a person, and the next job. Keeping the decision pure means both stores
 * share one engine, and the rules below are testable without a database.
 *
 * A channel step returns a `send` effect carrying the exact words. **Whether anything leaves the
 * building is the runner's decision, not this file's**: it checks consent, the account, the daily
 * cap and the sending window, and falls back to logging what it would have sent when it cannot
 * send. A call step becomes a real to-do for a person (a call has always been one). A condition
 * cannot yet see a reply, so it takes its No branch after waiting out its window.
 *
 * Import-free and erasable, so `node --test` can load it directly (see CLAUDE.md).
 */

/** In a dry run a plan's days are compressed so a whole plan can be watched in minutes. */
export const DRY_RUN_DAY_MS = 60_000;

/** A real day, for a plan that is really sending. */
export const REAL_DAY_MS = 86_400_000;

export type EngineNode = { id: string; kind: string; data: Record<string, unknown> };
export type EngineEdge = { source: string; target: string; port: string };
export type EngineAudience = { id: string; name: string; company: string; score: number };

export type SendKind = "li_invite" | "li_msg" | "email" | "wa" | "sms";

export type StepEffect =
  /** A line for the activity log: what the step did, or would have done. */
  | { type: "log"; channel: "linkedin" | "email" | "call" | "whatsapp" | "sms" | null; step: string; text: string }
  /** A to-do for a person. Only a call step makes one. */
  | { type: "task"; summary: string }
  /**
   * Something to send to this person, merge fields already filled. The runner sends it where it
   * can and logs `dryRunText` where it cannot — so a workspace with no connected account still
   * sees its plan run, and one with an account really reaches people.
   */
  | {
      type: "send";
      channel: "linkedin" | "email" | "whatsapp" | "sms";
      kind: SendKind;
      step: string;
      /** The message, or the invitation note (which may be empty — a bare invite is allowed). */
      body: string;
      /** Email only. */
      subject: string;
      /**
       * What the log says when nothing can actually be sent. Both stores append the reason
       * (" — not sent: …"), so it never ends in punctuation of its own.
       */
      dryRunText: string;
    };

export type StepResult = {
  effects: StepEffect[];
  /** The next step and when it is due, or null when the run is over. */
  next: { stepId: string; runAt: number } | null;
  /** Set when the run ends here: `completed` reached a goal or the end of the plan, `stopped` left it. */
  finish: "completed" | "stopped" | null;
};

const CHANNEL: Record<string, "linkedin" | "email" | "call" | "whatsapp" | "sms"> = {
  li_invite: "linkedin",
  li_msg: "linkedin",
  email: "email",
  call: "call",
  wa: "whatsapp",
  sms: "sms",
};

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const num = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** `{first_name}`, `{last_name}` and `{company}` filled in, so the log shows what would go out. */
export function fillMergeFields(text: string, audience: EngineAudience): string {
  const [first = "", ...rest] = audience.name.trim().split(/\s+/);
  return text
    .replace(/\{first_name\}/g, first)
    .replace(/\{last_name\}/g, rest.join(" "))
    .replace(/\{company\}/g, audience.company);
}

const clip = (text: string, max = 140): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/** A stable 0–99 from an audience and a step, so a lead always takes the same side of a split. */
export function bucket(audienceId: string, stepId: string): number {
  let h = 2166136261;
  for (const ch of `${audienceId}:${stepId}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100;
}

const CHECK_LABEL: Record<string, string> = {
  replied: "reply",
  accepted: "accepted invite",
  opened: "email open",
  clicked: "link click",
  read: "read",
  score: "score",
};

export function runStep(input: {
  nodes: EngineNode[];
  edges: EngineEdge[];
  stepId: string;
  audience: EngineAudience;
  now: number;
  /** How long one "wait N days" day lasts. Real days when sending; a minute in a dry run. */
  dayMs?: number;
}): StepResult {
  const { nodes, edges, stepId, audience, now } = input;
  const dayMs = input.dayMs ?? DRY_RUN_DAY_MS;
  const node = nodes.find((n) => n.id === stepId);
  if (!node) return { effects: [], next: null, finish: "completed" };

  const follow = (port: string, delayMs = 0): StepResult["next"] => {
    const edge = edges.find((e) => e.source === node.id && e.port === port);
    return edge ? { stepId: edge.target, runAt: now + delayMs } : null;
  };
  // A step with nothing after it ends the run; so does an Exit or a Goal.
  const onward = (effects: StepEffect[], port = "out", delayMs = 0): StepResult => {
    const next = follow(port, delayMs);
    return { effects, next, finish: next ? null : "completed" };
  };
  const label = audience.name;

  switch (node.kind) {
    case "audience":
      return onward([]);

    case "li_invite": {
      const note = fillMergeFields(str(node.data.note), audience);
      return onward([
        {
          type: "send",
          channel: "linkedin",
          kind: "li_invite",
          step: node.id,
          body: note,
          subject: "",
          dryRunText: `Would send ${label} a LinkedIn invite${note ? `: “${clip(note)}”` : ""}`,
        },
      ]);
    }
    case "li_msg":
    case "wa":
    case "sms": {
      const what = node.kind === "li_msg" ? "a LinkedIn message" : node.kind === "wa" ? "a WhatsApp message" : "an SMS";
      const body = fillMergeFields(str(node.data.body), audience);
      return onward([
        {
          type: "send",
          channel: CHANNEL[node.kind] as "linkedin" | "whatsapp" | "sms",
          kind: node.kind,
          step: node.id,
          body,
          subject: "",
          dryRunText: `Would send ${label} ${what}: “${clip(body)}”`,
        },
      ]);
    }
    case "email": {
      const subject = fillMergeFields(str(node.data.subject), audience);
      return onward([
        {
          type: "send",
          channel: "email",
          kind: "email",
          step: node.id,
          body: fillMergeFields(str(node.data.body), audience),
          subject,
          dryRunText: `Would email ${label}${subject ? ` — “${clip(subject, 80)}”` : ""}`,
        },
      ]);
    }
    case "call": {
      const notes = clip(fillMergeFields(str(node.data.notes), audience), 160);
      const summary = `Call ${label}${audience.company ? ` at ${audience.company}` : ""}${notes ? ` — ${notes}` : ""}`;
      return onward([
        { type: "task", summary },
        { type: "log", channel: "call", step: node.id, text: `Added a call to-do for ${label}.` },
      ]);
    }

    case "wait": {
      const days = Math.max(0, num(node.data.days, 1));
      return onward(
        [
          {
            type: "log",
            channel: null,
            step: node.id,
            text: `${label} waits ${days} ${days === 1 ? "day" : "days"}${dayMs < REAL_DAY_MS ? " (compressed in a dry run)" : ""}.`,
          },
        ],
        "out",
        Math.round(days * dayMs),
      );
    }

    case "cond": {
      const check = str(node.data.check) || "replied";
      const within = Math.max(1, num(node.data.within, 3));
      let yes = false;
      let why: string;
      if (check === "score") {
        const need = num(node.data.score, 70);
        yes = audience.score >= need;
        why = `${label}'s score is ${audience.score}, ${yes ? "at or above" : "below"} ${need}`;
      } else {
        why = `no ${CHECK_LABEL[check] ?? check} is tracked yet, so ${label} takes No`;
      }
      return onward(
        [{ type: "log", channel: null, step: node.id, text: `Condition: ${why}.` }],
        yes ? "yes" : "no",
        // A score is known now; anything that depends on the lead acting waits out its window.
        check === "score" ? 0 : Math.round(within * dayMs),
      );
    }

    case "split": {
      const a = Math.min(95, Math.max(5, num(node.data.a, 50)));
      const side = bucket(audience.id, node.id) < a ? "a" : "b";
      return onward(
        [{ type: "log", channel: null, step: node.id, text: `A/B split: ${label} goes down path ${side.toUpperCase()}.` }],
        side,
      );
    }

    case "goal":
      return {
        effects: [{ type: "log", channel: null, step: node.id, text: `${label} reached the goal.` }],
        next: null,
        finish: "completed",
      };

    case "exit":
      return {
        effects: [{ type: "log", channel: null, step: node.id, text: `${label} left the strategy.` }],
        next: null,
        finish: "stopped",
      };

    default:
      return { effects: [], next: null, finish: "completed" };
  }
}

/**
 * `events.kind` for what a run did.
 *
 * `step` is the activity log — a wait, a branch, a to-do, or a touch that could not really be sent.
 * `sent` is a touch that genuinely left the building, and is the only one the reach figures count.
 * `send_failed` is one the provider refused, kept so a silent failure is impossible.
 */
export const RUN_EVENT_KIND = "dry_run_step";
export const SENT_EVENT_KIND = "sent";
export const SEND_FAILED_EVENT_KIND = "send_failed";
