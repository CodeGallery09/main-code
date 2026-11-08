import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Journey } from "@/components/Journey";
import { WhyFlightpath } from "@/components/WhyFlightpath";
import { WorkflowLibrary } from "@/components/WorkflowLibrary";
import { FounderBooker } from "@/components/FounderBooker";
import { Footer } from "@/components/Footer";
import { Ticker } from "@/components/Ticker";
import { SiteFrame } from "@/components/SiteFrame";
import { ScrollScene } from "@/components/motion";

export default function Home() {
  return (
    <SiteFrame>
      <Navbar />
      <main id="main">
        <Hero />
        <Ticker />
        {/* Each section is driven straight from scroll position rather than
            triggered once, so the page reads as one continuous move and
            scrolling back up plays it backwards. */}
        <ScrollScene>
          <Journey />
        </ScrollScene>
        <ScrollScene>
          <WhyFlightpath />
        </ScrollScene>
        <ScrollScene>
          <WorkflowLibrary />
        </ScrollScene>
        <ScrollScene lift={28} dim={0.3}>
          <FounderBooker />
        </ScrollScene>
      </main>
      <Footer />
    </SiteFrame>
  );
}
