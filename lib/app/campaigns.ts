/**
 * How a campaign's status is worded and coloured. Campaign *data* lives in the database
 * (`lib/data/`); this is only the presentation of its status.
 */

import type { CampaignStatus } from "@/lib/data/types";

/** Status pill wording and tone. */
export const STATUS_TAG: Record<CampaignStatus, { label: string; tone: string }> = {
  live: { label: "Live", tone: "pos" },
  scheduled: { label: "Scheduled", tone: "" },
  paused: { label: "Paused", tone: "hl" },
  draft: { label: "Draft", tone: "" },
  completed: { label: "Completed", tone: "" },
};
