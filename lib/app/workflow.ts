/**
 * The multichannel workflow model behind the campaign builder.
 *
 * A workflow is a tree of steps: one Audience at the root, channel sends and
 * logic in the middle, a Goal or an Exit at every leaf. Everything here is
 * pure and import-free so it runs in the browser, on the server and under
 * `node --test`.
 *
 * The figures the builder shows are illustrative demo data, derived from the
 * audience size by the rates below rather than stored per step, so the canvas
 * always agrees with itself.
 */

/* ---------- vocabulary ---------------------------------------------------- */

export type StepKind =
  | "audience"
  | "li_invite"
  | "li_msg"
  | "email"
  | "wa"
  | "call"
  | "sms"
  | "wait"
  | "cond"
  | "split"
  | "goal"
  | "exit";

/** Outgoing socket on a step. A condition has yes/no, an A/B split has a/b. */
export type Port = "out" | "yes" | "no" | "a" | "b";

/** Mirrors ChannelKey in ./channels — kept inline so this module imports nothing. */
export type StepChannel = "li" | "mail" | "wa" | "call" | "sms";

export type CheckKey = "replied" | "accepted" | "opened" | "clicked" | "read" | "score";
export type GoalKey = "meeting" | "positive" | "clicked";
export type WorkflowStatus = "live" | "paused" | "draft";

export type Step = {
  label: string;
  /** Key into the icon set the builder renders. */
  icon: string;
  group: "start" | "channel" | "logic" | "end";
  /** Set when the step sends on a channel, which is also what can be switched off. */
  ch?: StepChannel;
  ports: Port[];
};

export const STEPS: Record<StepKind, Step> = {
  audience: { label: "Audience", icon: "users", group: "start", ports: ["out"] },
  li_invite: { label: "LinkedIn invite", icon: "li", group: "channel", ch: "li", ports: ["out"] },
  li_msg: { label: "LinkedIn message", icon: "li", group: "channel", ch: "li", ports: ["out"] },
  email: { label: "Email", icon: "mail", group: "channel", ch: "mail", ports: ["out"] },
  wa: { label: "WhatsApp", icon: "wa", group: "channel", ch: "wa", ports: ["out"] },
  call: { label: "Call task", icon: "phone", group: "channel", ch: "call", ports: ["out"] },
  sms: { label: "SMS", icon: "sms", group: "channel", ch: "sms", ports: ["out"] },
  wait: { label: "Wait", icon: "wait", group: "logic", ports: ["out"] },
  cond: { label: "Condition", icon: "branch", group: "logic", ports: ["yes", "no"] },
  split: { label: "A/B split", icon: "split", group: "logic", ports: ["a", "b"] },
  goal: { label: "Goal", icon: "flag", group: "end", ports: [] },
  exit: { label: "Exit", icon: "exit", group: "end", ports: [] },
};

/** The palette, in the order the reference shows it. Audience is never added. */
export const PALETTE: [group: string, kinds: StepKind[]][] = [
  ["Channels", ["li_invite", "li_msg", "email", "wa", "call", "sms"]],
  ["Logic", ["wait", "cond", "split"]],
  ["End", ["goal", "exit"]],
];

export const PORT_LABEL: Record<Port, string> = {
  out: "",
  yes: "Yes",
  no: "No",
  a: "A",
  b: "B",
};

export const CHECKS: Record<CheckKey, string> = {
  replied: "Replied",
  accepted: "Accepted invite",
  opened: "Opened email",
  clicked: "Clicked a link",
  read: "Read WhatsApp",
  score: "Score reached",
};

export const GOALS: Record<GoalKey, string> = {
  meeting: "Meeting booked",
  positive: "Positive reply",
  clicked: "Clicked link",
};

/**
 * An audience a workflow can start from. The demo lists below are illustrative;
 * a segment uploaded from a file arrives in the same shape, with `reach`
 * carrying the leads it can actually reach per channel, so the canvas counts
 * reachable leads rather than raw rows.
 */
export type AudienceList = {
  k: string;
  name: string;
  n: number;
  src: string;
  reach?: Partial<Record<LeadAttribute, number>>;
  /** Which uploaded column feeds each attribute, for the line on a channel card. */
  columns?: Partial<Record<LeadAttribute, string>>;
};

/** The lead attributes a channel step sends to — mirrors AttributeKey in lib/leads. */
export type LeadAttribute = "email" | "mobile" | "whatsapp" | "linkedin";

/** Which attribute each channel step reads off the segment. */
export const STEP_ATTRIBUTE: Partial<Record<StepKind, LeadAttribute>> = {
  email: "email",
  wa: "whatsapp",
  sms: "mobile",
  call: "mobile",
  li_invite: "linkedin",
  li_msg: "linkedin",
};

export const ATTRIBUTE_LABEL: Record<LeadAttribute, string> = {
  email: "Email",
  mobile: "Mobile number",
  whatsapp: "WhatsApp number",
  linkedin: "LinkedIn profile URL",
};

/** Audience lists available to a workflow. */
export const LISTS: AudienceList[] = [
  { k: "q4", name: "Q4 SaaS founders", n: 612, src: "CSV" },
  { k: "inbound", name: "Demo requests", n: 214, src: "Form" },
  { k: "lost", name: "Closed-lost 2025", n: 458, src: "CRM export" },
  { k: "event", name: "SaaSBoomi attendees", n: 180, src: "CSV" },
  { k: "q1", name: "Q1 founders", n: 340, src: "LinkedIn search" },
];

export const WA_TEMPLATES: Record<string, string> = {
  intro: "Intro · approved",
  followup: "Follow-up · approved",
  event: "Event recap · approved",
};

export const SIZES = ["Any", "1–10", "11–200", "201–1000", "1000+"];
export const GEOS = ["Any", "India", "US", "UK", "UAE", "SEA"];
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const MERGE_VARS = ["{first_name}", "{company}", "{title}"];

/* ---------- shapes -------------------------------------------------------- */

export type StepData = {
  list?: string;
  titles?: string;
  geo?: string;
  size?: string;
  note?: string;
  subject?: string;
  body?: string;
  thread?: boolean;
  template?: string;
  assign?: "owner" | "rr";
  notes?: string;
  days?: number;
  biz?: boolean;
  check?: CheckKey;
  within?: number;
  score?: number;
  a?: number;
  goal?: GoalKey;
};

export type StepNode = {
  id: string;
  kind: StepKind;
  x: number;
  y: number;
  data: StepData;
};

export type FlowEdge = {
  id: string;
  source: string;
  target: string;
  port: Port;
};

export type Workflow = {
  id: number;
  name: string;
  status: WorkflowStatus;
  nodes: StepNode[];
  edges: FlowEdge[];
  /** Sending window. */
  days: string[];
  from: string;
  to: string;
  daily: number;
  skipOther: boolean;
  started: string | null;
};

/** Node card width on the canvas; the layout spaces columns off it. */
export const NODE_W = 236;
/** Fallback card height, used until a card has been measured in the browser. */
export const NODE_H = 88;

/* ---------- defaults and labels ------------------------------------------- */

export function defaults(kind: StepKind): StepData {
  switch (kind) {
    case "audience":
      return { list: "q4", titles: "Founder, Head of Sales", geo: "Any", size: "11–200" };
    case "li_invite":
      return {
        note: "Hi {first_name}, I work with sales teams at companies like {company}. Would love to connect.",
      };
    case "li_msg":
      return {
        body: "Thanks for connecting, {first_name}. Curious how {company} keeps LinkedIn and email in sync as the team grows?",
      };
    case "email":
      return {
        subject: "Quick question, {first_name}",
        body: "Hi {first_name},\n\nWhen teams grow, LinkedIn and email end up on different clocks and leads fall through.\n\nWorth a 20-minute look?\n\nAarav",
        thread: true,
      };
    case "wa":
      return {
        template: "intro",
        body: "Hi {first_name}, Aarav from Flightpath. Open to a quick look at how teams like {company} run outreach on one clock?",
      };
    case "call":
      return { assign: "owner", notes: "Reference what they engaged with. Aim for a 20-minute demo." };
    case "sms":
      return { body: "Hi {first_name}, Aarav here. Sent you an email about {company}’s outreach. Worth a quick chat?" };
    case "wait":
      return { days: 3, biz: true };
    case "cond":
      return { check: "replied", within: 3, score: 70 };
    case "split":
      return { a: 50 };
    case "goal":
      return { goal: "meeting" };
    default:
      return {};
  }
}

/** The line under the step kind on a node card, and the inspector subtitle. */
export function stepLabel(kind: StepKind, d: StepData, lists: AudienceList[] = LISTS): string {
  switch (kind) {
    case "audience": {
      const list = lists.find((l) => l.k === d.list);
      return list ? `${list.name} · ${list.n}` : "Choose a list";
    }
    case "li_invite":
      return d.note ? "With note" : "No note";
    case "li_msg":
    case "sms":
      return d.body ? d.body.replace(/\s+/g, " ").slice(0, 40) : "Empty message";
    case "email":
      return d.subject || "No subject";
    case "wa":
      return WA_TEMPLATES[d.template || ""]
        ? WA_TEMPLATES[d.template || ""].split(" ·")[0] + " template"
        : "Choose template";
    case "call":
      return d.assign === "rr" ? "Round robin" : "Lead owner";
    case "wait":
      return `${d.days} ${d.biz ? "business " : ""}day${d.days === 1 ? "" : "s"}`;
    case "cond":
      return d.check === "score" ? `Score ≥ ${d.score}?` : `${CHECKS[d.check || "replied"]} in ${d.within}d?`;
    case "split":
      return `${d.a} / ${100 - (d.a || 0)}`;
    case "goal":
      return GOALS[d.goal || "meeting"];
    case "exit":
      return "Leave workflow";
    default:
      return "";
  }
}

/* ---------- building a graph from a spec ---------------------------------- */

/** `[kind, overrides?, { port: child }?]` — the shape the seed workflows use. */
export type Spec = [StepKind, StepData?, Partial<Record<Port, Spec>>?];

let seq = 1000;
export const nextId = () => "n" + seq++;

/**
 * Keeps ids created in the browser clear of a workflow that was built on the
 * server and handed over as props.
 */
export function reserveIds(nodes: StepNode[]) {
  for (const n of nodes) {
    const num = Number(n.id.slice(1));
    if (Number.isFinite(num) && num >= seq) seq = num + 1;
  }
}

export const edgeId = (source: string, port: Port, target: string) => `e${source}-${port}-${target}`;

export const makeEdge = (source: string, target: string, port: Port = "out"): FlowEdge => ({
  id: edgeId(source, port, target),
  source,
  target,
  port,
});

/** Walks a spec depth-first into nodes and edges, then lays them out. */
export function fromSpec(spec: Spec): { nodes: StepNode[]; edges: FlowEdge[] } {
  const nodes: StepNode[] = [];
  const edges: FlowEdge[] = [];

  const walk = (node: Spec, parent: string | null, port: Port) => {
    const [kind, overrides, children] = node;
    const id = nextId();
    nodes.push({ id, kind, x: 0, y: 0, data: { ...defaults(kind), ...overrides } });
    if (parent) edges.push(makeEdge(parent, id, port));
    if (children) {
      for (const [childPort, child] of Object.entries(children)) {
        if (child) walk(child, id, childPort as Port);
      }
    }
  };

  walk(spec, null, "out");
  return { nodes: layout(nodes, edges), edges };
}

/* ---------- layout -------------------------------------------------------- */

/** Yes/A hang to the left of their parent, No/B to the right. */
const PORT_ORDER: Record<string, number> = { out: 0, yes: 0, a: 0, no: 1, b: 1 };

const COL = NODE_W + 48;
const ROW = 128;

/**
 * Tidies the graph into a centred tree: every step sits one row below its
 * parent, and each branch gets a column slot as wide as its own subtree.
 * Steps nothing leads to are parked in a row of their own underneath.
 */
export function layout(nodes: StepNode[], edges: FlowEdge[]): StepNode[] {
  const out: Record<string, FlowEdge[]> = {};
  for (const e of edges) (out[e.source] = out[e.source] || []).push(e);
  for (const list of Object.values(out)) {
    list.sort((a, b) => (PORT_ORDER[a.port] || 0) - (PORT_ORDER[b.port] || 0));
  }

  const root = nodes.find((n) => n.kind === "audience") || nodes[0];
  if (!root) return nodes;

  const kids: Record<string, string[]> = {};
  const depth: Record<string, number> = {};
  const seen = new Set<string>();
  const walk = (id: string, d: number) => {
    seen.add(id);
    depth[id] = d;
    kids[id] = [];
    for (const e of out[id] || []) {
      if (seen.has(e.target)) continue;
      kids[id].push(e.target);
      walk(e.target, d + 1);
    }
  };
  walk(root.id, 0);

  const width: Record<string, number> = {};
  const measure = (id: string): number =>
    (width[id] = kids[id].length ? kids[id].reduce((sum, k) => sum + measure(k), 0) : 1);
  measure(root.id);

  const at: Record<string, { x: number; y: number }> = {};
  const place = (id: string, left: number) => {
    at[id] = { x: left + (width[id] * COL) / 2 - NODE_W / 2, y: depth[id] * ROW };
    let cursor = left;
    for (const k of kids[id]) {
      place(k, cursor);
      cursor += width[k] * COL;
    }
  };
  place(root.id, -(width[root.id] * COL) / 2);

  const deepest = Math.max(0, ...Object.values(depth));
  let parked = 0;
  return nodes.map((n) => {
    if (at[n.id]) return { ...n, ...at[n.id] };
    const x = parked - NODE_W / 2;
    parked += COL;
    return { ...n, x, y: (deepest + 1.3) * ROW };
  });
}

/* ---------- funnel figures ------------------------------------------------ */

/** Share of leads taking the Yes branch of each condition. */
const PASS: Record<CheckKey, number> = {
  accepted: 0.48,
  replied: 0.13,
  opened: 0.58,
  clicked: 0.09,
  read: 0.82,
  score: 0.22,
};

/** Headline rate shown on each channel card. */
const RATE: Partial<Record<StepKind, [number, string]>> = {
  li_invite: [0.48, "accepted"],
  li_msg: [0.092, "replied"],
  email: [0.58, "opened"],
  wa: [0.17, "replied"],
  call: [0.44, "connected"],
  sms: [0.055, "replied"],
};

const asPct = (v: number) => (v * 100).toFixed(v < 0.1 ? 1 : 0) + "%";

export type StepStat = [value: string, label: string];

/**
 * Walks the audience count down the tree and turns it into the two figures on
 * each card. A draft has never run, so it gets none.
 */
export function stepStats(
  nodes: StepNode[],
  edges: FlowEdge[],
  lists: AudienceList[] = LISTS,
): Record<string, StepStat[]> {
  const byId: Record<string, StepNode> = {};
  for (const n of nodes) byId[n.id] = n;
  const out: Record<string, FlowEdge[]> = {};
  for (const e of edges) (out[e.source] = out[e.source] || []).push(e);

  const root = nodes.find((n) => n.kind === "audience");
  if (!root) return {};

  const list = lists.find((l) => l.k === root.data.list);
  const reached: Record<string, number> = {};
  const queue: [id: string, n: number][] = [[root.id, list ? list.n : 0]];
  const expanded = new Set<string>();

  while (queue.length) {
    const next = queue.shift();
    if (!next) break;
    const [id, raw] = next;
    // A channel step can only reach leads whose mapped column held a usable
    // entry, so a segment's per-channel reachable count caps the step.
    const attribute = STEP_ATTRIBUTE[byId[id] ? byId[id].kind : "audience"];
    const cap = attribute && list && list.reach ? list.reach[attribute] : undefined;
    const n = cap === undefined ? raw : Math.min(raw, cap);
    reached[id] = (reached[id] || 0) + n;
    if (expanded.has(id)) continue;
    expanded.add(id);
    const node = byId[id];
    if (!node) continue;
    for (const e of out[id] || []) {
      let share = n;
      if (node.kind === "cond") {
        const pass = PASS[node.data.check || "replied"] ?? 0.3;
        share = e.port === "yes" ? n * pass : n * (1 - pass);
      }
      if (node.kind === "split") {
        const a = node.data.a ?? 50;
        share = e.port === "a" ? (n * a) / 100 : (n * (100 - a)) / 100;
      }
      queue.push([e.target, share]);
    }
  }

  const stats: Record<string, StepStat[]> = {};
  for (const node of nodes) {
    const exact = reached[node.id] || 0;
    const n = Math.round(exact);
    if (!n) continue;
    const count = n.toLocaleString("en-US");
    const rate = RATE[node.kind];
    if (node.kind === "audience") stats[node.id] = [[count, "leads"]];
    else if (rate) stats[node.id] = [[count, node.kind === "call" ? "tasks" : "sent"], [asPct(rate[0]), rate[1]]];
    else if (node.kind === "wait") stats[node.id] = [[Math.round(exact * 0.08).toLocaleString("en-US"), "waiting"]];
    else if (node.kind === "goal") stats[node.id] = [[Math.round(exact * 0.4).toLocaleString("en-US"), "reached"]];
    else if (node.kind === "exit") stats[node.id] = [[count, "exited"]];
  }
  return stats;
}

/* ---------- validation ---------------------------------------------------- */

/** One problem per step, in the order the builder reports them. */
export function issues(
  nodes: StepNode[],
  edges: FlowEdge[],
  channelOff: (ch: StepChannel) => boolean = () => false,
): Record<string, string> {
  const found: Record<string, string> = {};
  const CH_NAME: Record<StepChannel, string> = {
    li: "LinkedIn",
    mail: "Email",
    wa: "WhatsApp",
    call: "Calls",
    sms: "SMS",
  };
  for (const node of nodes) {
    const step = STEPS[node.kind];
    const d = node.data;
    if (step.ch && channelOff(step.ch)) found[node.id] = `${CH_NAME[step.ch]} is turned off`;
    else if ((node.kind === "li_msg" || node.kind === "sms") && !(d.body || "").trim())
      found[node.id] = "Message is empty";
    else if (node.kind === "email" && (!(d.subject || "").trim() || !(d.body || "").trim()))
      found[node.id] = "Email is incomplete";
    else if (node.kind !== "audience" && !edges.some((e) => e.target === node.id))
      found[node.id] = "Not connected";
    else if (step.ports.some((p) => !edges.some((e) => e.source === node.id && e.port === p)))
      found[node.id] = "Next step missing";
  }
  return found;
}

/* ---------- edge geometry ------------------------------------------------- */

/** Where a port leaves its card: one socket centred, two at the quarters. */
export function portX(node: StepNode, port: Port): number {
  const ports = STEPS[node.kind].ports;
  if (ports.length < 2) return node.x + NODE_W / 2;
  return node.x + NODE_W * (ports.indexOf(port) === 0 ? 0.25 : 0.75);
}

/**
 * A smooth step from a card's bottom socket to the next card's top: straight
 * when the two line up, otherwise down, across and down with rounded corners.
 */
export function edgePath(sx: number, sy: number, tx: number, ty: number): string {
  const dx = tx - sx;
  if (Math.abs(dx) < 1) return `M${sx} ${sy}L${tx} ${ty}`;
  const my = (sy + ty) / 2;
  const dir = dx > 0 ? 1 : -1;
  const r = Math.min(14, Math.abs(dx) / 2, Math.abs(ty - sy) / 4);
  return (
    `M${sx} ${sy}L${sx} ${my - r}` +
    `Q${sx} ${my} ${sx + dir * r} ${my}` +
    `L${tx - dir * r} ${my}` +
    `Q${tx} ${my} ${tx} ${my + r}` +
    `L${tx} ${ty}`
  );
}

/* ---------- the seeded workflows ------------------------------------------ */

const OUTBOUND: Spec = [
  "audience",
  { list: "q4" },
  {
    out: [
      "li_invite",
      {},
      {
        out: [
          "cond",
          { check: "accepted", within: 5 },
          {
            yes: [
              "li_msg",
              {},
              {
                out: [
                  "wait",
                  { days: 3 },
                  {
                    out: [
                      "cond",
                      { check: "replied", within: 3 },
                      { yes: ["goal"], no: ["call", {}, { out: ["goal"] }] },
                    ],
                  },
                ],
              },
            ],
            no: ["email", {}, { out: ["wait", { days: 3 }, { out: ["exit"] }] }],
          },
        ],
      },
    ],
  },
];

const INBOUND: Spec = [
  "audience",
  { list: "inbound", titles: "Any", size: "Any" },
  {
    out: [
      "email",
      {
        subject: "Your demo request",
        body: "Hi {first_name},\n\nThanks for reaching out. Here are a few times that work this week: flightpath.app/aarav\n\nAarav",
      },
      {
        out: [
          "wait",
          { days: 1 },
          {
            out: [
              "cond",
              { check: "replied", within: 1 },
              {
                yes: ["goal"],
                no: [
                  "wa",
                  { template: "followup" },
                  {
                    out: [
                      "cond",
                      { check: "replied", within: 2 },
                      { yes: ["goal"], no: ["call", {}, { out: ["exit"] }] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

const REENGAGE: Spec = [
  "audience",
  { list: "lost", titles: "Any" },
  {
    out: [
      "email",
      {
        subject: "Still on your radar?",
        body: "Hi {first_name},\n\nWe spoke earlier this year. A lot has changed on our side since. Worth a fresh look?\n\nAarav",
      },
      {
        out: [
          "wait",
          { days: 4 },
          {
            out: [
              "cond",
              { check: "opened", within: 4 },
              {
                yes: ["li_invite", {}, { out: ["wait", { days: 3 }, { out: ["exit"] }] }],
                no: ["sms", {}, { out: ["exit"] }],
              },
            ],
          },
        ],
      },
    ],
  },
];

const WA_FIRST: Spec = [
  "audience",
  { list: "event" },
  {
    out: [
      "wa",
      { template: "event" },
      {
        out: [
          "wait",
          { days: 1 },
          {
            out: [
              "cond",
              { check: "replied", within: 1 },
              { yes: ["call", {}, { out: ["goal"] }], no: ["email", {}, { out: ["exit"] }] },
            ],
          },
        ],
      },
    ],
  },
];

/** Templates offered when starting a workflow from scratch. */
export const TEMPLATES: { k: string; name: string; ch: StepChannel[]; steps: number; spec: Spec }[] = [
  { k: "blank", name: "Blank", ch: [], steps: 1, spec: ["audience"] },
  { k: "outbound", name: "Cold outbound", ch: ["li", "mail", "call"], steps: 9, spec: OUTBOUND },
  { k: "inbound", name: "Inbound follow-up", ch: ["mail", "wa", "call"], steps: 8, spec: INBOUND },
  { k: "reengage", name: "Re-engage lost deals", ch: ["mail", "li", "sms"], steps: 8, spec: REENGAGE },
  { k: "wafirst", name: "WhatsApp first", ch: ["wa", "call", "mail"], steps: 7, spec: WA_FIRST },
];

const WINDOW = { days: ["Mon", "Tue", "Wed", "Thu", "Fri"], from: "09:00", to: "18:00", skipOther: true };

function build(
  id: number,
  name: string,
  template: string,
  status: WorkflowStatus,
  extra: Partial<Workflow> = {},
): Workflow {
  const spec = TEMPLATES.find((t) => t.k === template);
  const graph = fromSpec(spec ? spec.spec : ["audience"]);
  return { id, name, status, ...graph, ...WINDOW, daily: 40, started: null, ...extra };
}

/** A blank workflow, used by "New campaign". */
export function blankWorkflow(template = "blank"): Workflow {
  const spec = TEMPLATES.find((t) => t.k === template) || TEMPLATES[0];
  return build(0, spec.k === "blank" ? "Untitled workflow" : spec.name, spec.k, "draft");
}

/**
 * The workflow behind each multichannel campaign in lib/app/campaigns.ts. The
 * Q1 founders draft carries a stray SMS step with no message, so the builder
 * has something real to flag.
 */
export const WORKFLOWS: Workflow[] = (() => {
  const draft = build(5, "Q1 founders", "outbound", "draft");
  draft.nodes = draft.nodes.map((n) =>
    n.kind === "audience" ? { ...n, data: { ...n.data, list: "q1" } } : n,
  );
  draft.nodes = [...draft.nodes, { id: nextId(), kind: "sms", x: 420, y: 150, data: { ...defaults("sms"), body: "" } }];
  return [
    build(1, "Net-new outbound", "outbound", "live", { started: "12 Sep" }),
    build(2, "Inbound follow-up", "inbound", "live", { started: "3 Aug", daily: 60 }),
    build(3, "Closed-lost re-engage", "reengage", "live", { started: "20 Sep", daily: 30 }),
    build(4, "Event follow-up", "wafirst", "paused", { started: "2 Jul", daily: 25 }),
    draft,
  ];
})();

export const getWorkflow = (id: number) => WORKFLOWS.find((w) => w.id === id);

/** Channel order, matching ALL_CHANNELS in ./channels. */
const CHANNEL_ORDER: StepChannel[] = ["li", "mail", "wa", "call", "sms"];

/** Channels a workflow actually sends on, for the campaign list. */
export const workflowChannels = (w: Workflow): StepChannel[] =>
  CHANNEL_ORDER.filter((ch) => w.nodes.some((n) => STEPS[n.kind].ch === ch));
