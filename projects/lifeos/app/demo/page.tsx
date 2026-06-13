"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Lock, ArrowRight, Check } from "lucide-react";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { OnboardingDraft, personFromDraft } from "@/lib/onboarding";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/base/button";
import { Badge } from "@/components/base/badge";
import { AuroraBackground } from "@/components/aceternity/aurora-background";

export default function DemoPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const { setPerson } = useStore();
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [email, setEmail] = useState("");

  const convert = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const name = draft.name.trim() || email.split("@")[0] || "there";
    const person = personFromDraft({ ...draft, name });
    setPerson(person); // carry the generated plan into the real product
    signIn({ name, email: email.trim() });
    router.push("/dashboard");
  };

  return (
    <main className="dark relative min-h-screen overflow-hidden bg-ink">
      <div className="grain absolute inset-0" />
      <AuroraBackground className="absolute inset-0" />

      <header className="relative mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
        <Wordmark />
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 font-mono text-xs text-muted transition-colors hover:text-head"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to site
        </Link>
      </header>

      <div className="relative mx-auto max-w-3xl px-5 pb-24 pt-6">
        <div className="mb-7 text-center">
          <Badge tone="live" dot className="mb-4">
            Live onboarding · no signup yet
          </Badge>
          <h1 className="font-display text-[2.2rem] font-light leading-tight text-head sm:text-[2.8rem]">
            Build your LifeOS in 60 seconds.
          </h1>
          <p className="mx-auto mt-2 max-w-md text-[0.97rem] text-muted">
            This is the real onboarding — the same six steps every member walks.
            Watch your inputs become an executable day.
          </p>
        </div>

        <OnboardingFlow
          onComplete={(d) => setDraft(d)}
          ctaLabel="Save my plan"
        />
      </div>

      {/* signup gate */}
      <AnimatePresence>
        {draft && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center bg-ink-deep/80 px-5 backdrop-blur-md"
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="relative w-full max-w-md rounded-lg border border-hairline bg-ink-raised p-8 sm:p-9"
            >
              <div className="mb-5 grid h-11 w-11 place-items-center rounded-md bg-amber/15">
                <Lock className="h-5 w-5 text-amber" />
              </div>
              <p className="eyebrow mb-2">Your plan is ready</p>
              <h2 className="font-display text-[1.8rem] font-light leading-tight text-head">
                Save it and keep going.
              </h2>
              <p className="mt-2 text-sm text-muted">
                Create a free account to lock in your plan, keep your streak, and
                wake up to a generated day tomorrow.
              </p>

              <ul className="mt-5 space-y-2">
                {[
                  "Your generated plan, saved",
                  "Daily Engine every morning",
                  "Streaks, reviews, and domain balance",
                ].map((b) => (
                  <li key={b} className="flex items-center gap-2.5 text-sm text-body">
                    <Check className="h-4 w-4 shrink-0 text-sage" /> {b}
                  </li>
                ))}
              </ul>

              <form onSubmit={convert} className="mt-6 space-y-3">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  className="w-full rounded-sm border border-hairline-strong bg-ink-deep px-4 py-3 text-[0.97rem] text-head outline-none transition-colors placeholder:text-faint focus:border-amber/60"
                />
                <Button type="submit" size="lg" className="w-full">
                  Create account & open my day <ArrowRight className="h-4 w-4" />
                </Button>
              </form>

              <button
                onClick={() => setDraft(null)}
                className="mt-4 w-full text-center font-mono text-xs text-faint transition-colors hover:text-muted cursor-pointer"
              >
                ← Keep editing my plan
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
