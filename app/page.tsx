import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Journey } from "@/components/Journey";
import { WhyFlightpath } from "@/components/WhyFlightpath";
import { Pipeline } from "@/components/Pipeline";
import { WorkflowLibrary } from "@/components/WorkflowLibrary";
import { FounderBooker } from "@/components/FounderBooker";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <main id="main">
        <Hero />
        <Journey />
        <WhyFlightpath />
        <Pipeline />
        <WorkflowLibrary />
        <FounderBooker />
      </main>
      <Footer />
    </>
  );
}
