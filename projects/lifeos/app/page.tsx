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
    <div className="relative min-h-screen overflow-x-hidden bg-ink text-body">
      <Nav />
      <Hero />
      <Proof />
      <ModelFlow />
      <Features />
      <How />
      <CTA />
      <Footer />
    </div>
  );
}
