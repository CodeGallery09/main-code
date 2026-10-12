/**
 * The to-do queue and the demo inbox. Both reference leads by id, so a person's
 * score, company and avatar stay consistent wherever they appear.
 */

import type { ChannelKey } from "./channels";

export type TaskKind = "reply" | "call" | "approve";

export type Task = {
  id: string;
  type: TaskKind;
  /** Lead id this task is about. */
  lead: number;
  why: string;
  ch: ChannelKey;
  due: string;
};

export const TASKS: Task[] = [
  { id: "t1", type: "reply", lead: 2, why: "Asked about pricing for 8 seats", ch: "mail", due: "35m" },
  { id: "t7", type: "reply", lead: 15, why: "Asked for a deck", ch: "wa", due: "20m" },
  { id: "t2", type: "call", lead: 1, why: "Open to a chat · clicked pricing", ch: "call", due: "Today" },
  { id: "t3", type: "call", lead: 3, why: "Visited pricing twice", ch: "call", due: "Today" },
  { id: "t4", type: "reply", lead: 8, why: "Asked who else uses it", ch: "li", due: "3h" },
  { id: "t5", type: "approve", lead: 4, why: "First LinkedIn message ready", ch: "li", due: "Waiting" },
];

/** Button label for each kind of task. */
export const TASK_ACTION: Record<TaskKind, { label: string; tone: "pri" | "acc" }> = {
  reply: { label: "Reply", tone: "pri" },
  call: { label: "Call", tone: "acc" },
  approve: { label: "Review", tone: "pri" },
};

export type Message =
  | { sys: string; t: string }
  | { s: "me" | "them"; ch: ChannelKey; w: string; subj?: string; t: string };

export type Thread = {
  /** Lead id; the thread and the lead are the same person. */
  id: number;
  intent: "Interested" | "Question" | "Meeting" | "Out of office" | "Opt-out";
  /** Whether the thread is still waiting on a reply from us. */
  needs: boolean;
  unread?: boolean;
  time: string;
  ch: ChannelKey;
  msgs: Message[];
  /** Pre-drafted reply offered under the composer. */
  sugg?: string;
  /** What the system did on its own when no reply is needed. */
  auto?: string;
};

export const THREADS: Thread[] = [
  {
    id: 15,
    intent: "Interested",
    needs: true,
    unread: true,
    time: "20m",
    ch: "wa",
    msgs: [
      { sys: "wa", t: "WhatsApp template sent · read" },
      {
        s: "me",
        ch: "wa",
        w: "Yesterday",
        t: "Hi Rohan, Aarav from Flightpath. We help teams like Tiffin Labs run LinkedIn, email and WhatsApp outreach on one clock. Open to a quick look?",
      },
      { s: "them", ch: "wa", w: "20 min ago", t: "Hey! Yes, interested. Can you share a deck first?" },
    ],
    sugg: "Sure, Rohan. Sharing a 2-minute walkthrough here: flightpath.app/tour\n\nIf it looks useful, grab a slot: flightpath.app/aarav",
  },
  {
    id: 2,
    intent: "Question",
    needs: true,
    unread: true,
    time: "35m",
    ch: "mail",
    msgs: [
      {
        s: "me",
        ch: "mail",
        w: "8 days ago",
        subj: "Quick question about Brightline’s outbound",
        t: "Hi Omar, noticed Brightline is hiring two SDRs. When teams add reps, LinkedIn and email end up on different clocks. Worth a look at how we keep them on one?",
      },
      { sys: "eye", t: "Opened 3× · clicked pricing" },
      {
        s: "them",
        ch: "mail",
        w: "35 min ago",
        t: "This looks relevant. What does pricing look like for a team of 8? We’re on HubSpot, does it sync?",
      },
    ],
    sugg:
      "Hi Omar, a team of 8 fits our Growth plan. I’ll send exact numbers for your setup. HubSpot sync is on the roadmap; today we run alongside it with an export.\n\nWould 20 minutes on Thursday work?",
  },
  {
    id: 1,
    intent: "Interested",
    needs: true,
    unread: false,
    time: "2h",
    ch: "li",
    msgs: [
      { sys: "li", t: "Accepted your invite · 9 days ago" },
      {
        s: "me",
        ch: "li",
        w: "9 days ago",
        t: "Thanks for connecting, Maya. How does Example Co keep LinkedIn and email from stepping on each other?",
      },
      { s: "them", ch: "li", w: "2h ago", t: "Ha, we don’t, honestly. Happy to chat. Thursday afternoon works." },
    ],
    sugg: "Great, Maya. Here’s my calendar for Thursday: flightpath.app/aarav",
  },
  {
    id: 8,
    intent: "Question",
    needs: true,
    unread: false,
    time: "3h",
    ch: "li",
    msgs: [
      {
        s: "me",
        ch: "li",
        w: "6 days ago",
        t: "Hi Kenji, saw Quanta is expanding into two regions. How are you keeping outreach coordinated?",
      },
      { s: "them", ch: "li", w: "3h ago", t: "Interesting. Who else is using this at our size?" },
    ],
    sugg: "Mostly B2B sales teams of 3 to 15. Happy to share two examples on a short call.",
  },
  {
    id: 13,
    intent: "Meeting",
    needs: false,
    time: "Today",
    ch: "mail",
    msgs: [
      {
        s: "me",
        ch: "mail",
        w: "4 days ago",
        subj: "Your demo request",
        t: "Hi Chloe, thanks for requesting a demo. Do any of these times work?",
      },
      { s: "them", ch: "mail", w: "Today", t: "Tuesday 11:00 works." },
    ],
    auto: "Meeting booked · removed from campaign",
  },
  {
    id: 5,
    intent: "Out of office",
    needs: false,
    time: "1d",
    ch: "mail",
    msgs: [{ s: "them", ch: "mail", w: "Yesterday", t: "I’m out of the office until 14 October." }],
    auto: "Paused until 14 Oct",
  },
  {
    id: 7,
    intent: "Opt-out",
    needs: false,
    time: "2d",
    ch: "mail",
    msgs: [{ s: "them", ch: "mail", w: "2 days ago", t: "Please remove me from your list." }],
    auto: "Stopped on all channels",
  },
];

/** Tone for the intent pill on a thread. */
export const INTENT_TONE: Record<Thread["intent"], string> = {
  Interested: "pos",
  Question: "acc",
  Meeting: "pos",
  "Out of office": "",
  "Opt-out": "alert",
};
