"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/base/button";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const { signIn } = useAuth();
  const { person, setPerson } = useStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const isSignUp = mode === "sign-up";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const display = name.trim() || email.split("@")[0] || "there";
    signIn({ name: display, email: email.trim() });
    // keep the seeded person but personalize the name
    if (person) setPerson({ ...person, name: display });
    router.push("/dashboard");
  };

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-ink px-5">
      <div className="grid-field pointer-events-none absolute inset-x-0 top-0 h-[50vh]" aria-hidden />

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md rounded-lg border border-hairline-strong bg-ink-raised p-8 sm:p-10"
      >
        <Wordmark className="mb-8" />
        <p className="eyebrow mb-3">{isSignUp ? "Create account" : "Welcome back"}</p>
        <h1 className="font-display text-[2.1rem] font-light leading-tight text-head">
          {isSignUp ? "Start your operating system." : "Resume your day."}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {isSignUp
            ? "No credit card. Your plan is waiting on the other side."
            : "Pick up exactly where you left off."}
        </p>

        <form onSubmit={submit} className="mt-7 space-y-3.5">
          {isSignUp && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-sm border border-hairline-strong bg-ink-deep px-4 py-3 text-[0.97rem] text-head outline-none transition-colors placeholder:text-faint focus:border-amber/60"
            />
          )}
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="w-full rounded-sm border border-hairline-strong bg-ink-deep px-4 py-3 text-[0.97rem] text-head outline-none transition-colors placeholder:text-faint focus:border-amber/60"
          />
          <Button type="submit" size="lg" className="w-full">
            {isSignUp ? "Create account" : "Sign in"}{" "}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          {isSignUp ? "Already have an account? " : "New to LifeOS? "}
          <Link
            href={isSignUp ? "/sign-in" : "/sign-up"}
            className="text-amber transition-colors hover:text-amber-pale"
          >
            {isSignUp ? "Sign in" : "Create one"}
          </Link>
        </p>

        <p className="mt-5 border-t border-hairline pt-5 text-center font-mono text-[0.66rem] leading-relaxed text-faint">
          Demo mode — session is local to this browser. Production swaps in
          Clerk (see SETUP-KEYS.md).
        </p>
      </motion.div>
    </main>
  );
}
