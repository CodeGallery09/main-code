import "./app.css";
import "./home.css";
import Glass from "@/components/app/Glass";
import { SiteNav } from "@/components/site/SiteNav";
import { SiteHero } from "@/components/site/SiteHero";
import { SiteFooter, SiteJourney, SiteWhy, SiteWorkflows } from "@/components/site/SiteSections";
import { FounderCall } from "@/components/site/FounderCall";

export default function Home() {
  return (
    <>
      <Glass />
      <SiteNav />
      <main id="main">
        <SiteHero />
        <SiteJourney />
        <SiteWhy />
        <SiteWorkflows />
        <FounderCall />
      </main>
      <SiteFooter />
    </>
  );
}
