import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Journey } from "@/components/Journey";
import { WhyFlightpath } from "@/components/WhyFlightpath";
import { WorkflowLibrary } from "@/components/WorkflowLibrary";
import { FounderBooker } from "@/components/FounderBooker";
import { Footer } from "@/components/Footer";
import { Ticker } from "@/components/Ticker";

export default function Home() {
  return (
    <>
      <Navbar />
      <main id="main">
        <Hero />
        <Ticker />
        <Journey />
        <WhyFlightpath />
        <WorkflowLibrary />
        <FounderBooker />
      </main>
      <Footer />
    </>
  );
}
