import { Nav } from "@/components/marketing/nav";
import { Hero } from "@/components/marketing/hero";
import { Proof } from "@/components/marketing/proof";
import { ModelFlow } from "@/components/marketing/model-flow";
import { Features } from "@/components/marketing/features";
import { How } from "@/components/marketing/how";
import { CTA } from "@/components/marketing/cta";
import { Footer } from "@/components/marketing/footer";

export default function LandingPage() {
  return (
    <div className="dark relative min-h-screen overflow-x-hidden bg-ink text-body">
      <div className="grain pointer-events-none fixed inset-0 z-0" />
      <div className="relative z-10">
        <Nav />
        <Hero />
        <Proof />
        <ModelFlow />
        <Features />
        <How />
        <CTA />
        <Footer />
      </div>
    </div>
  );
}
