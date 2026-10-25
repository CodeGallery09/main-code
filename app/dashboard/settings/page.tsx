import { permanentRedirect } from "next/navigation";
import { SETUP_HREF } from "@/lib/nav";

/**
 * Settings held no controls of its own: a channel list that ended "managed in Configuration", a
 * Sending card whose body was a sentence pointing at Configuration, a domain list the Email tab
 * already shows, plus the team and plan. The team and plan are now Setup's Workspace tab.
 */
export default function SettingsRedirect() {
  permanentRedirect(SETUP_HREF);
}
