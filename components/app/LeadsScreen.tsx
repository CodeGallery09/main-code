"use client";

import { useMemo, useState } from "react";
import { Screen } from "./AppShell";
import { CheckIcon, SearchIcon } from "./icons";
import { Avatar } from "./ui";
import { OWNERS } from "@/lib/app/channels";
import { CAMPAIGNS } from "@/lib/app/campaigns";
import {
  LEADS,
  maskPhone,
  scoreBand,
  STAGE_COLOR,
  tagColors,
  type Lead,
  type Stage,
} from "@/lib/app/leads";

const STAGES: [Stage | "any", string][] = [
  ["any", "Any status"],
  ["Hot", "Hot"],
  ["Meeting", "Meeting"],
  ["Engaged", "Engaged"],
  ["Reaching", "Reaching"],
  ["New", "New"],
  ["Nurture", "Nurture"],
  ["Paused", "Paused"],
  ["Stopped", "Not interested"],
];

/** Pill tint per stage; the text colour comes from STAGE_COLOR. */
const STAGE_TINT: Record<Stage, string> = {
  Hot: "rgba(178,78,38,.14)",
  Meeting: "rgba(79,107,69,.16)",
  Engaged: "rgba(201,146,46,.18)",
  Reaching: "rgba(24,26,30,.07)",
  New: "rgba(24,26,30,.07)",
  Nurture: "rgba(185,162,124,.22)",
  Paused: "rgba(24,26,30,.07)",
  Stopped: "rgba(24,26,30,.07)",
};

type SortKey = "name" | "score" | "avgCall" | "msgs";

export function LeadsScreen() {
  const [query, setQuery] = useState("");
  const [campaign, setCampaign] = useState("any");
  const [owner, setOwner] = useState("any");
  const [stage, setStage] = useState<Stage | "any">("any");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "score", dir: -1 });
  const [starred, setStarred] = useState<number[]>(LEADS.filter((l) => l.fav).map((l) => l.id));
  const [picked, setPicked] = useState<number[]>([]);

  const rows = useMemo(() => {
    const text = query.trim().toLowerCase();
    const filtered = LEADS.filter((l) => {
      if (owner !== "any" && l.own !== owner) return false;
      if (stage !== "any" && l.stage !== stage) return false;
      if (!text) return true;
      return [l.n, l.c, l.t, ...l.tags].some((v) => v.toLowerCase().includes(text));
    });

    const value = (l: Lead) => {
      switch (sort.key) {
        case "name":
          return l.n.toLowerCase();
        case "avgCall":
          return l.avgCall ?? -1;
        case "msgs":
          return l.msgs;
        default:
          return l.score;
      }
    };
    return [...filtered].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [query, owner, stage, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "name" ? 1 : -1 }));

  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? "↑" : "↓") : "↕");

  const allPicked = picked.length === rows.length && rows.length > 0;

  return (
    <Screen title="Leads">
      <div className="lfilters">
        <label className="q wide">
          <SearchIcon />
          <input
            type="search"
            placeholder="Search leads, companies, tags"
            aria-label="Search leads"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        <select className="sel pill" aria-label="Campaign" value={campaign} onChange={(e) => setCampaign(e.target.value)}>
          <option value="any">All campaigns</option>
          {CAMPAIGNS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select className="sel pill" aria-label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="any">Any owner</option>
          {Object.entries(OWNERS).map(([k, name]) => (
            <option key={k} value={k}>
              {name}
            </option>
          ))}
        </select>

        <select
          className="sel pill hide-m"
          aria-label="Status"
          value={stage}
          onChange={(e) => setStage(e.target.value as Stage | "any")}
        >
          {STAGES.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>

        <select className="sel pill hide-m" aria-label="Date range" defaultValue="90">
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="ytd">This year</option>
        </select>

        <button className="ib more" aria-label="More actions">
          ⋯
        </button>
        <button className="btn pri">Start calling</button>
      </div>

      <div className="card ltable">
        <div className="tblw">
          <table className="tbl leads">
            <thead>
              <tr>
                <th className="c-n">
                  <span className="hn">
                    <button
                      className={"cb" + (allPicked ? " on" : "")}
                      aria-label="Select all"
                      onClick={() => setPicked(allPicked ? [] : rows.map((r) => r.id))}
                    >
                      <CheckIcon />
                    </button>
                    <button className={"sortb" + (sort.key === "name" ? " on" : "")} onClick={() => toggleSort("name")}>
                      Lead name<span className="arr">{arrow("name")}</span>
                    </button>
                  </span>
                </th>
                <th>Status</th>
                <th>
                  <button className={"sortb" + (sort.key === "score" ? " on" : "")} onClick={() => toggleSort("score")}>
                    Score<span className="arr">{arrow("score")}</span>
                  </button>
                </th>
                <th className="c-src">Source</th>
                <th className="c-tags">Tags</th>
                <th className="c-mid c-cons">Consent</th>
                <th className="c-mid">
                  <button
                    className={"sortb" + (sort.key === "avgCall" ? " on" : "")}
                    onClick={() => toggleSort("avgCall")}
                  >
                    Avg call<span className="arr">{arrow("avgCall")}</span>
                  </button>
                </th>
                <th className="c-mid c-fu">
                  <button className={"sortb" + (sort.key === "msgs" ? " on" : "")} onClick={() => toggleSort("msgs")}>
                    Follow-ups<span className="arr">{arrow("msgs")}</span>
                  </button>
                </th>
                <th className="c-next">Next step</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((lead) => {
                const isStarred = starred.includes(lead.id);
                const visible = lead.tags.slice(0, 2);
                const extra = lead.tags.length - visible.length;
                return (
                  <tr className="click" key={lead.id}>
                    <td className="c-n">
                      <div className="lname">
                        <button
                          className={"cb" + (picked.includes(lead.id) ? " on" : "")}
                          aria-label={`Select ${lead.n}`}
                          onClick={() =>
                            setPicked((p) =>
                              p.includes(lead.id) ? p.filter((id) => id !== lead.id) : [...p, lead.id],
                            )
                          }
                        >
                          <CheckIcon />
                        </button>
                        <Avatar name={lead.n} />
                        <div className="nm">
                          <span className="row1">
                            <b title={lead.n}>{lead.n}</b>
                            <button
                              className="star"
                              aria-label="Star"
                              aria-pressed={isStarred}
                              onClick={() =>
                                setStarred((s) =>
                                  s.includes(lead.id) ? s.filter((id) => id !== lead.id) : [...s, lead.id],
                                )
                              }
                            >
                              {isStarred ? "★" : "☆"}
                            </button>
                          </span>
                          <small className="num">{lead.ph ? maskPhone(lead.ph) : lead.c}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <button className="pillbtn" aria-label={`Status: ${lead.stage}`}>
                        <span
                          className="spill"
                          style={{ background: STAGE_TINT[lead.stage], color: STAGE_COLOR[lead.stage] }}
                        >
                          {lead.stage}
                        </span>
                        <span className="chev">⌄</span>
                      </button>
                    </td>
                    <td>
                      <span className={"scoren " + scoreBand(lead.score)}>{lead.score}</span>
                    </td>
                    <td className="c-src">
                      <span className="src">{lead.src}</span>
                    </td>
                    <td className="c-tags">
                      <div className="tagcell">
                        <div className="tagstack">
                          {visible.map((tag) => {
                            const [bg, fg] = tagColors(tag);
                            return (
                              <span className="ltag" title={tag} key={tag} style={{ background: bg, color: fg }}>
                                {tag}
                              </span>
                            );
                          })}
                        </div>
                        {extra > 0 && <button className="more-n">+{extra}</button>}
                      </div>
                    </td>
                    <td className="c-mid c-cons">{lead.consent ? "Yes" : "No"}</td>
                    <td className="c-mid num">{lead.avgCall ? `${lead.avgCall}s` : "—"}</td>
                    <td className="c-mid c-fu">
                      <span className="fu">
                        <span className="fuc" title="Messages">
                          {lead.msgs} msg
                        </span>
                        <span className="fuc" title="Calls">
                          {lead.calls} call
                        </span>
                      </span>
                    </td>
                    <td className="c-next">{lead.next}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <p className="empty">No leads match those filters.</p>}
      </div>
    </Screen>
  );
}
