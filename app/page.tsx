import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { IntegrationStrip } from "@/components/IntegrationStrip";
import { ProblemSolution } from "@/components/ProblemSolution";
import { Orchestration } from "@/components/Orchestration";
import { OutcomeDashboard } from "@/components/OutcomeDashboard";
import { Compliance } from "@/components/Compliance";
import { ClosingCta } from "@/components/ClosingCta";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <main id="main">
        <Hero />
        <IntegrationStrip />
        <ProblemSolution />
        <Orchestration />
        <OutcomeDashboard />
        <Compliance />
        <ClosingCta />
      </main>
      <Footer />
    </>
  );
}
