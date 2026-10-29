/**
 * What happens when a lead reaches one step of a plan — as data, with no side effects.
 *
 * The runner (in the repository) loads a due job, calls `runStep`, and applies what comes back:
 * log lines, a to-do for a person, and the next job. Keeping the decision pure means both stores
 * share one engine, and the rules below are testable without a database.
 *
 * **This is the dry run.** Nothing here contacts anyone. A LinkedIn or email step is logged as
 * what it *would* send; a call step becomes a real to-do for a person (a call has always been
 * one); a condition cannot see a reply, so it takes its No branch after waiting out its window.
 * Real sending replaces the first of those, not the shape of the result.
 *
 * Import-free and erasable, so `node --test` can load it directly (see CLAUDE.md).
 */

/** In a dry run a plan's days are compressed so a whole plan can be watched in minutes. */
export const DRY_RUN_DAY_MS = 60_000;

export type EngineNode = { id: string; kind: string; data: Record<string, unknown> };
export type EngineEdge = { source: string; target: string; port: string };
export type EngineAudience = { id: string; name: string; company: string; score: number };

export type StepEffect =
  /** A line for the activity log: what the step did, or would have done. */
  | { type: "log"; channel: "linkedin" | "email" | "call" | "whatsapp" | "sms" | null; step: string; text: string }
  /** A to-do for a person. Only a call step makes one. */
  | { type: "task"; summary: string };

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
}): StepResult {
  const { nodes, edges, stepId, audience, now } = input;
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
      const note = clip(fillMergeFields(str(node.data.note), audience));
      return onward([
        {
          type: "log",
          channel: "linkedin",
          step: node.id,
          text: `Dry run: would send ${label} a LinkedIn invite${note ? `: “${note}”` : "."}`,
        },
      ]);
    }
    case "li_msg":
    case "wa":
    case "sms": {
      const kind = node.kind === "li_msg" ? "a LinkedIn message" : node.kind === "wa" ? "a WhatsApp message" : "an SMS";
      return onward([
        {
          type: "log",
          channel: CHANNEL[node.kind],
          step: node.id,
          text: `Dry run: would send ${label} ${kind}: “${clip(fillMergeFields(str(node.data.body), audience))}”`,
        },
      ]);
    }
    case "email": {
      const subject = clip(fillMergeFields(str(node.data.subject), audience), 80);
      return onward([
        {
          type: "log",
          channel: "email",
          step: node.id,
          text: `Dry run: would email ${label}${subject ? ` — “${subject}”` : "."}`,
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
        [{ type: "log", channel: null, step: node.id, text: `${label} waits ${days} ${days === 1 ? "day" : "days"} (compressed in a dry run).` }],
        "out",
        Math.round(days * DRY_RUN_DAY_MS),
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
        why = `no ${CHECK_LABEL[check] ?? check} can happen in a dry run, so ${label} takes No`;
      }
      return onward(
        [{ type: "log", channel: null, step: node.id, text: `Condition: ${why}.` }],
        yes ? "yes" : "no",
        // A score is known now; anything that depends on the lead acting waits out its window.
        check === "score" ? 0 : Math.round(within * DRY_RUN_DAY_MS),
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

/** The `events.kind` a logged dry-run step is stored under. Not a send, so no rollup counts it. */
export const RUN_EVENT_KIND = "dry_run_step";
