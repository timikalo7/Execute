"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Flame, LogOut, Plus, Sparkles, Target } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useStore, useToday } from "@/lib/store";
import { BLOCK_META, DOMAIN_META, TaskBlock } from "@/lib/types";
import { Wordmark } from "@/components/brand";
import { Panel } from "@/components/dashboard/panel";
import { TaskRow } from "@/components/dashboard/task-row";
import { ProgressRing } from "@/components/dashboard/progress-ring";
import { DomainBalance } from "@/components/dashboard/domain-balance";
import { Button } from "@/components/base/button";
import { Badge } from "@/components/base/badge";

const GREETING = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
};

export default function DashboardPage() {
  const router = useRouter();
  const { user, ready: authReady, signOut } = useAuth();
  const { person, ready: storeReady, toggleTask, addTask } = useStore();
  const today = useToday(person);
  const [adding, setAdding] = useState(false);

  // Auth guard — bounce to sign-in if no session.
  useEffect(() => {
    if (authReady && !user) router.replace("/sign-in");
  }, [authReady, user, router]);

  if (!authReady || !storeReady || !person || !user) {
    return (
      <main className="grid min-h-screen place-items-center bg-ink">
        <div className="flex items-center gap-2 font-mono text-sm text-muted">
          <Sparkles className="h-4 w-4 animate-pulse text-amber" /> Loading your day…
        </div>
      </main>
    );
  }

  const pct = today.total ? today.done / today.total : 0;
  const remaining = today.total - today.done;

  return (
    <main className="min-h-screen bg-ink">
      {/* top bar */}
      <header className="sticky top-0 z-30 border-b border-hairline bg-ink/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-section items-center justify-between px-5 sm:px-8">
          <Wordmark />
          <div className="flex items-center gap-4">
            <Badge tone="amber" className="hidden sm:inline-flex">
              <Flame className="h-3 w-3" /> {person.streak} day streak
            </Badge>
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-amber/15 font-mono text-xs font-semibold text-amber">
                {user.name.slice(0, 1).toUpperCase()}
              </div>
              <button
                onClick={() => {
                  signOut();
                  router.replace("/");
                }}
                className="text-muted transition-colors hover:text-clay cursor-pointer"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-section px-5 py-8 sm:px-8 sm:py-10">
        {/* greeting + focus */}
        <div className="mb-8 grid gap-5 lg:grid-cols-[1fr_auto]">
          <div>
            <p className="eyebrow mb-2">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
            <h1 className="font-display text-[2.4rem] font-light leading-[1.05] text-head sm:text-[3rem]">
              {GREETING()}, {user.name.split(" ")[0]}.
            </h1>
            {today.focus ? (
              <p className="mt-3 max-w-lg text-[1.02rem] leading-relaxed text-body">
                Your highest-leverage move right now is{" "}
                <span className="font-medium text-head">
                  “{today.focus.title}”
                </span>{" "}
                — {BLOCK_META[today.focus.block].hint.toLowerCase()}.
              </p>
            ) : (
              <p className="mt-3 max-w-lg text-[1.02rem] text-body">
                Every task is done. That’s a closed loop — go recharge.
              </p>
            )}
          </div>
          <Panel className="flex items-center gap-5">
            <ProgressRing
              value={pct}
              label={`${Math.round(pct * 100)}%`}
              sublabel="today"
            />
            <div className="space-y-1.5 pr-2">
              <Stat n={today.done} label="done" />
              <Stat n={remaining} label="remaining" />
              <Stat n={`${Math.round((today.minutes / 60) * 10) / 10}h`} label="focus left" />
            </div>
          </Panel>
        </div>

        {/* main grid */}
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          {/* tasks */}
          <Panel
            title="Today's Engine · ordered by leverage"
            action={
              <button
                onClick={() => setAdding((s) => !s)}
                className="inline-flex items-center gap-1.5 font-mono text-xs text-muted transition-colors hover:text-amber cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            }
          >
            <AnimatePresence>
              {adding && (
                <QuickAdd
                  onAdd={(title, block) => {
                    addTask({
                      title,
                      domain: person.domains[0]?.key ?? "projects",
                      leverage: 50,
                      block,
                      estimate: 25,
                    });
                    setAdding(false);
                  }}
                  onCancel={() => setAdding(false)}
                />
              )}
            </AnimatePresence>

            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {today.tasks.map((t, i) => (
                  <TaskRow key={t.id} task={t} index={i} onToggle={toggleTask} />
                ))}
              </AnimatePresence>
            </div>

            {today.total > 0 && (
              <div className="mt-5 flex items-center justify-between border-t border-hairline pt-4">
                <span className="font-mono text-xs text-muted">
                  {today.done} of {today.total} complete
                </span>
                {pct === 1 && (
                  <Badge tone="sage" dot>
                    Loop closed
                  </Badge>
                )}
              </div>
            )}
          </Panel>

          {/* side column */}
          <div className="space-y-5">
            <Panel title="Domain balance">
              <DomainBalance domains={person.domains} />
            </Panel>

            <Panel title="Active goals">
              <div className="space-y-4">
                {person.goals.map((g) => (
                  <div key={g.id}>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <Target className="h-3.5 w-3.5 shrink-0 text-amber" />
                        <span className="truncate text-sm text-head">{g.title}</span>
                      </div>
                      <span className="font-mono text-xs text-muted">{g.progress}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-ink-deep">
                      <motion.div
                        className="h-full rounded-full bg-amber"
                        initial={{ width: 0 }}
                        animate={{ width: `${g.progress}%` }}
                        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </div>
                    <p className="mt-1 font-mono text-[0.66rem] uppercase tracking-wider text-faint">
                      {DOMAIN_META[g.domain].name} · {g.metric}
                    </p>
                  </div>
                ))}
                {person.goals.length === 0 && (
                  <p className="text-sm text-muted">
                    No goals yet — add one in your weekly review.
                  </p>
                )}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </main>
  );
}

function Stat({ n, label }: { n: React.ReactNode; label: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-display text-xl font-light text-head">{n}</span>
      <span className="font-mono text-[0.62rem] uppercase tracking-wider text-muted">
        {label}
      </span>
    </div>
  );
}

function QuickAdd({
  onAdd,
  onCancel,
}: {
  onAdd: (title: string, block: TaskBlock) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [block, setBlock] = useState<TaskBlock>("deep");
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="mb-3 overflow-hidden"
    >
      <div className="rounded-md border border-amber/40 bg-amber/[0.04] p-3">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && title.trim()) onAdd(title.trim(), block);
            if (e.key === "Escape") onCancel();
          }}
          placeholder="What needs doing? (Enter to add)"
          className="w-full bg-transparent text-sm text-head outline-none placeholder:text-faint"
        />
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {(Object.keys(BLOCK_META) as TaskBlock[]).map((b) => (
            <button
              key={b}
              onClick={() => setBlock(b)}
              className={`rounded-full border px-2.5 py-1 font-mono text-[0.62rem] uppercase tracking-wider transition-colors cursor-pointer ${
                block === b
                  ? "border-amber bg-amber/10 text-amber"
                  : "border-hairline text-muted hover:text-body"
              }`}
            >
              {BLOCK_META[b].label}
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => title.trim() && onAdd(title.trim(), block)}>
              Add task
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
