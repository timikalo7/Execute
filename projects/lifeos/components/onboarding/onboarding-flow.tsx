// The real LifeOS onboarding. Used by the marketing demo AND the post-signup
// first-run. Multiple-choice-first (no typing before value), one linear path,
// ending in the Daily Engine "aha": a concrete plan generated from your inputs.
"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ArrowLeft, Check, Sparkles } from "lucide-react";
import {
  DOMAIN_OPTIONS,
  IDENTITY_OPTIONS,
  VALUE_OPTIONS,
  OnboardingDraft,
  emptyDraft,
  generatePlan,
} from "@/lib/onboarding";
import { BLOCK_META, DOMAIN_META } from "@/lib/types";
import { Button } from "@/components/base/button";
import { SplitText } from "@/components/reactbits/split-text";
import { cn } from "@/lib/utils";

type StepId =
  | "identity"
  | "values"
  | "domains"
  | "goal"
  | "system"
  | "plan";

const STEPS: { id: StepId; eyebrow: string; title: string; sub: string }[] = [
  { id: "identity", eyebrow: "01 · Identity", title: "Who are you becoming?", sub: "Identity drives behavior. Pick the roles you're living into." },
  { id: "values", eyebrow: "02 · Values", title: "What matters most?", sub: "Rank by tapping in order. When goals conflict, higher values win." },
  { id: "domains", eyebrow: "03 · Domains", title: "Where does life happen?", sub: "Choose the areas LifeOS should keep in balance." },
  { id: "goal", eyebrow: "04 · Goal", title: "Name one destination", sub: "A goal is a measurable outcome — not a wish." },
  { id: "system", eyebrow: "05 · System", title: "The repeatable process", sub: "Goals need systems. What action, done consistently, gets you there?" },
  { id: "plan", eyebrow: "06 · Daily Engine", title: "Today, generated", sub: "Your inputs become an executable plan. This is what you'll see every morning." },
];

export function OnboardingFlow({
  onComplete,
  startName = "",
  ctaLabel = "Continue",
}: {
  onComplete: (draft: OnboardingDraft) => void;
  startName?: string;
  ctaLabel?: string;
}) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<OnboardingDraft>({
    ...emptyDraft(),
    name: startName,
  });

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const canAdvance = useMemo(() => {
    switch (current.id) {
      case "identity":
        return draft.identities.length > 0;
      case "values":
        return draft.values.length >= 3;
      case "domains":
        return draft.domains.length >= 2;
      case "goal":
        return draft.goalTitle.trim().length > 2;
      case "system":
        return draft.systemTitle.trim().length > 2;
      default:
        return true;
    }
  }, [current.id, draft]);

  const next = () => {
    if (isLast) return onComplete(draft);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="dark relative w-full overflow-hidden rounded-lg border border-hairline bg-ink">
      {/* progress rail */}
      <div className="flex items-center gap-1.5 border-b border-hairline px-6 py-4">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex flex-1 items-center gap-1.5">
            <div
              className={cn(
                "h-1 flex-1 rounded-full transition-all duration-500 ease-ks",
                i < step
                  ? "bg-sage"
                  : i === step
                    ? "bg-amber"
                    : "bg-ink-graphite",
              )}
            />
          </div>
        ))}
      </div>

      <div className="px-6 py-7 sm:px-9 sm:py-9">
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="eyebrow mb-3">{current.eyebrow}</p>
            <h3 className="font-display text-[1.9rem] font-light leading-[1.1] text-head sm:text-[2.4rem]">
              {current.title}
            </h3>
            <p className="mt-2 max-w-xl text-[0.97rem] leading-relaxed text-muted">
              {current.sub}
            </p>

            <div className="mt-7 min-h-[180px]">
              {current.id === "identity" && (
                <ChipMulti
                  options={IDENTITY_OPTIONS}
                  selected={draft.identities}
                  onToggle={(v) =>
                    setDraft((d) => ({
                      ...d,
                      identities: toggle(d.identities, v),
                    }))
                  }
                />
              )}

              {current.id === "values" && (
                <ChipRanked
                  options={VALUE_OPTIONS}
                  selected={draft.values}
                  onToggle={(v) =>
                    setDraft((d) => ({ ...d, values: toggle(d.values, v, 5) }))
                  }
                />
              )}

              {current.id === "domains" && (
                <ChipMulti
                  options={DOMAIN_OPTIONS.map((d) => d.name)}
                  selected={draft.domains.map(
                    (k) => DOMAIN_OPTIONS.find((d) => d.key === k)?.name ?? k,
                  )}
                  onToggle={(name) => {
                    const key = DOMAIN_OPTIONS.find((d) => d.name === name)?.key;
                    if (!key) return;
                    setDraft((d) => ({ ...d, domains: toggle(d.domains, key) }));
                  }}
                />
              )}

              {current.id === "goal" && (
                <GoalStep draft={draft} setDraft={setDraft} />
              )}

              {current.id === "system" && (
                <SystemStep draft={draft} setDraft={setDraft} />
              )}

              {current.id === "plan" && <PlanReveal draft={draft} />}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* nav */}
        <div className="mt-8 flex items-center justify-between border-t border-hairline pt-6">
          <button
            onClick={back}
            disabled={step === 0}
            className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-head disabled:opacity-0 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-faint">
              {step + 1} / {STEPS.length}
            </span>
            <Button onClick={next} disabled={!canAdvance} size="md">
              {isLast ? (
                <>
                  {ctaLabel} <Sparkles className="h-4 w-4" />
                </>
              ) : (
                <>
                  Continue <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- step pieces ---- */

function ChipMulti({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button
            key={o}
            onClick={() => onToggle(o)}
            className={cn(
              "rounded-full border px-4 py-2 text-sm transition-all duration-200 ease-ks cursor-pointer",
              on
                ? "border-amber/70 bg-amber/[0.1] text-amber-pale -translate-y-[1px]"
                : "border-hairline-strong text-muted hover:border-amber/40 hover:text-head",
            )}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

function ChipRanked({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {options.map((o) => {
        const rank = selected.indexOf(o);
        const on = rank > -1;
        return (
          <button
            key={o}
            onClick={() => onToggle(o)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-all duration-200 ease-ks cursor-pointer",
              on
                ? "border-amber/70 bg-amber/[0.1] text-amber-pale -translate-y-[1px]"
                : "border-hairline-strong text-muted hover:border-amber/40 hover:text-head",
            )}
          >
            {on && (
              <span className="grid h-5 w-5 place-items-center rounded-full bg-amber font-mono text-[0.7rem] font-semibold text-ink-deep">
                {rank + 1}
              </span>
            )}
            {o}
          </button>
        );
      })}
    </div>
  );
}

function GoalStep({
  draft,
  setDraft,
}: {
  draft: OnboardingDraft;
  setDraft: React.Dispatch<React.SetStateAction<OnboardingDraft>>;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="eyebrow mb-2 block">Pick a domain</label>
        <div className="flex flex-wrap gap-2">
          {draft.domains.map((k) => {
            const meta = DOMAIN_META[k];
            const on = draft.goalDomain === k;
            return (
              <button
                key={k}
                onClick={() => setDraft((d) => ({ ...d, goalDomain: k }))}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm transition-all cursor-pointer",
                  on
                    ? "border-amber/70 bg-amber/[0.1] text-amber-pale"
                    : "border-hairline-strong text-muted hover:text-head",
                )}
              >
                {meta.name}
              </button>
            );
          })}
        </div>
      </div>
      <Field
        label="The goal"
        placeholder="e.g. Run a sub-3:30 marathon"
        value={draft.goalTitle}
        onChange={(v) => setDraft((d) => ({ ...d, goalTitle: v }))}
      />
      <Field
        label="Success metric — how you'll know"
        placeholder="e.g. Long-run pace under 5:00 / km"
        value={draft.goalMetric}
        onChange={(v) => setDraft((d) => ({ ...d, goalMetric: v }))}
      />
    </div>
  );
}

function SystemStep({
  draft,
  setDraft,
}: {
  draft: OnboardingDraft;
  setDraft: React.Dispatch<React.SetStateAction<OnboardingDraft>>;
}) {
  const suggestions = [
    "Train on a structured plan, 5 days a week",
    "Two hours of deep work before noon",
    "Read 20 pages every morning",
    "Ship one small thing daily",
  ];
  return (
    <div className="space-y-4">
      <Field
        label="Your keystone action"
        placeholder="e.g. Follow the marathon training block, weekdays"
        value={draft.systemTitle}
        onChange={(v) => setDraft((d) => ({ ...d, systemTitle: v }))}
      />
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => setDraft((d) => ({ ...d, systemTitle: s }))}
            className="rounded-full border border-hairline px-3 py-1.5 text-xs text-faint transition-colors hover:border-amber/40 hover:text-muted cursor-pointer"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="eyebrow mb-2 block">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-sm border border-hairline-strong bg-ink-deep px-4 py-3 text-[0.97rem] text-head outline-none transition-colors placeholder:text-faint focus:border-amber/60"
      />
    </div>
  );
}

function PlanReveal({ draft }: { draft: OnboardingDraft }) {
  const tasks = useMemo(() => generatePlan(draft), [draft]);
  const minutes = tasks.reduce((s, t) => s + t.estimate, 0);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-xs text-muted">
        <span>
          <span className="text-amber">{tasks.length}</span> tasks
        </span>
        <span>
          <span className="text-amber">{Math.round(minutes / 60 * 10) / 10}h</span>{" "}
          focused
        </span>
        <span>
          ordered by <span className="text-amber">leverage</span>
        </span>
      </div>
      <div className="space-y-2">
        {tasks.map((t, i) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              delay: 0.15 + i * 0.12,
              duration: 0.5,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="flex items-center gap-3 rounded-md border border-hairline bg-ink-raised px-4 py-3"
          >
            <span
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[0.7rem] font-semibold"
              style={{
                background: "var(--amber)",
                color: "var(--ink-deep)",
                opacity: 0.35 + (t.leverage / 100) * 0.65,
              }}
            >
              {t.leverage}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-head">{t.title}</p>
              <p className="font-mono text-[0.68rem] uppercase tracking-wider text-faint">
                {BLOCK_META[t.block].label} · {t.estimate}m ·{" "}
                {DOMAIN_META[t.domain].name}
              </p>
            </div>
            {i === 0 && (
              <span className="hidden shrink-0 rounded-full border border-amber/40 px-2 py-0.5 font-mono text-[0.62rem] uppercase tracking-wider text-amber sm:inline">
                Start here
              </span>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* utils */
function toggle<T>(arr: T[], v: T, max = Infinity): T[] {
  if (arr.includes(v)) return arr.filter((x) => x !== v);
  if (arr.length >= max) return arr;
  return [...arr, v];
}
