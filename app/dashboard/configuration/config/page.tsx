import { permanentRedirect } from "next/navigation";
import { SETUP_HREF } from "@/lib/nav";

/** Config became Integrations: the sending rules it also held are gone, and what is left is connecting accounts. */
export default function ConfigRedirect() {
  permanentRedirect(`${SETUP_HREF}/integrations`);
}
