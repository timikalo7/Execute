// A single task row in the Daily Engine. Tap to complete — spark + strike.
"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Task, BLOCK_META, DOMAIN_META } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TaskRow({
  task,
  index,
  onToggle,
}: {
  task: Task;
  index: number;
  onToggle: (id: string) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "group flex items-center gap-4 rounded-md border px-4 py-3.5 transition-all duration-200 ease-ks",
        task.done
          ? "border-transparent bg-transparent"
          : "border-hairline bg-ink-raised hover:border-hairline-strong hover:-translate-y-[1px]",
      )}
    >
      <button
        onClick={() => onToggle(task.id)}
        aria-label={task.done ? "Mark incomplete" : "Mark complete"}
        className={cn(
          "grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-all duration-200 ease-ks cursor-pointer",
          task.done
            ? "border-sage bg-sage text-white"
            : "border-hairline-strong text-transparent hover:border-amber",
        )}
      >
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </button>

      {/* leverage chip */}
      <span
        className={cn(
          "hidden h-8 w-8 shrink-0 place-items-center rounded-md font-mono text-[0.7rem] font-semibold sm:grid",
          task.done ? "text-faint" : "text-ink-deep",
        )}
        style={
          task.done
            ? { background: "var(--ink-deep)" }
            : {
                background: "var(--amber)",
                opacity: 0.4 + (task.leverage / 100) * 0.6,
              }
        }
        title={`Leverage ${task.leverage} of 100 — its impact on your goals. Higher runs first.`}
        aria-label={`Leverage ${task.leverage} of 100`}
      >
        {task.leverage}
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-[0.97rem] transition-colors",
            task.done ? "text-faint line-through" : "text-head",
          )}
        >
          {task.title}
        </p>
        <p className="font-mono text-[0.66rem] uppercase tracking-wider text-muted">
          {BLOCK_META[task.block].label} · {task.estimate}m · {DOMAIN_META[task.domain].name}
        </p>
      </div>
    </motion.div>
  );
}
