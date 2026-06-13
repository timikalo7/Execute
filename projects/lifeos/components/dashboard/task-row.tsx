// A single task row in the Daily Engine. Tap the circle to complete; hover or
// focus to edit (title, leverage, block) or delete. The leverage value is the
// engine's output — editing it is how the user overrules the ranking.
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Pencil, Trash2 } from "lucide-react";
import { Task, BLOCK_META, DOMAIN_META, TaskBlock } from "@/lib/types";
import type { TaskPatch } from "@/lib/store";
import { Button } from "@/components/base/button";
import { cn } from "@/lib/utils";

const MAX_TITLE = 120;

export function TaskRow({
  task,
  index,
  onToggle,
  onEdit,
  onRemove,
}: {
  task: Task;
  index: number;
  onToggle: (id: string) => void;
  onEdit: (id: string, patch: TaskPatch) => void;
  onRemove: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (editing) {
    return (
      <TaskEditor
        task={task}
        onSave={(patch) => {
          onEdit(task.id, patch);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

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
          : "border-hairline bg-ink-raised hover:border-hairline-strong",
      )}
    >
      <button
        onClick={() => onToggle(task.id)}
        aria-label={task.done ? "Mark incomplete" : "Mark complete"}
        className={cn(
          "grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-all duration-200 ease-ks cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ink",
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
          "hidden h-8 w-8 shrink-0 place-items-center rounded-md font-mono text-[0.7rem] font-semibold tabular-nums sm:grid",
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

      {/* row actions — revealed on hover/focus, always visible on touch */}
      {confirmDelete ? (
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span className="font-mono text-[0.62rem] uppercase tracking-wider text-muted">
            Delete?
          </span>
          <button
            onClick={() => onRemove(task.id)}
            className="rounded-sm px-2 py-1 font-mono text-[0.62rem] uppercase tracking-wider text-clay transition-colors hover:bg-clay/10 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay/50"
            aria-label={`Delete task: ${task.title}`}
          >
            Delete
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            className="rounded-sm px-2 py-1 font-mono text-[0.62rem] uppercase tracking-wider text-muted transition-colors hover:text-body cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/50"
          >
            Keep
          </button>
        </div>
      ) : (
        <div className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
          <button
            onClick={() => setEditing(true)}
            aria-label={`Edit task: ${task.title}`}
            title="Edit"
            className="grid h-7 w-7 place-items-center rounded-sm text-muted transition-colors hover:bg-ink hover:text-head cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/50"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            aria-label={`Delete task: ${task.title}`}
            title="Delete"
            className="grid h-7 w-7 place-items-center rounded-sm text-muted transition-colors hover:bg-clay/10 hover:text-clay cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay/50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </motion.div>
  );
}

// Inline editor — title, leverage (re-rank), and block. Mirrors the QuickAdd
// vocabulary so add and edit feel like one tool.
function TaskEditor({
  task,
  onSave,
  onCancel,
}: {
  task: Task;
  onSave: (patch: TaskPatch) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [leverage, setLeverage] = useState(String(task.leverage));
  const [block, setBlock] = useState<TaskBlock>(task.block);

  const save = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onSave({ title: trimmed, leverage: Number(leverage), block });
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-md border border-amber/40 bg-amber/[0.04] p-3"
    >
      <input
        autoFocus
        value={title}
        maxLength={MAX_TITLE}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") onCancel();
        }}
        aria-label="Task title"
        className="w-full bg-transparent text-sm text-head outline-none placeholder:text-faint"
      />
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <label className="flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 font-mono text-[0.62rem] uppercase tracking-wider text-muted focus-within:border-amber/60">
          Lev
          <input
            type="number"
            min={0}
            max={100}
            value={leverage}
            onChange={(e) => setLeverage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") onCancel();
            }}
            aria-label="Leverage, 0 to 100"
            className="w-10 bg-transparent text-right text-body tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
        </label>
        {(Object.keys(BLOCK_META) as TaskBlock[]).map((b) => (
          <button
            key={b}
            onClick={() => setBlock(b)}
            aria-pressed={block === b}
            className={cn(
              "rounded-full border px-2.5 py-1 font-mono text-[0.62rem] uppercase tracking-wider transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/50",
              block === b
                ? "border-amber bg-amber/10 text-amber"
                : "border-hairline text-muted hover:text-body",
            )}
          >
            {BLOCK_META[b].label}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={save}>
            Save
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
