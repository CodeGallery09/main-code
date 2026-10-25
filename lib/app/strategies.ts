/**
 * How a strategy's status is worded and coloured. Strategy *data* lives in the database
 * (`lib/data/`); this is only the presentation of its status.
 */

import type { StrategyStatus } from "@/lib/data/types";

/** Status pill wording and tone. */
export const STATUS_TAG: Record<StrategyStatus, { label: string; tone: string }> = {
  live: { label: "Live", tone: "pos" },
  scheduled: { label: "Scheduled", tone: "" },
  paused: { label: "Paused", tone: "hl" },
  draft: { label: "Draft", tone: "" },
  completed: { label: "Completed", tone: "" },
};
