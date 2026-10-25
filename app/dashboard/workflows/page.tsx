import { permanentRedirect } from "next/navigation";
import { CAMPAIGNS_HREF } from "@/lib/nav";

/**
 * There is no separate workflow library any more.
 *
 * A multichannel strategy *is* its workflow — same id, one stored graph — so the library was a
 * second list of the same records, with its own status tabs, search box and create button.
 * Strategies is that list; the builder still lives at /dashboard/workflows/:id.
 */
export default function WorkflowsLibraryRedirect() {
  permanentRedirect(CAMPAIGNS_HREF);
}
