// LifeOS wordmark. Display serif "Life" + mono "OS" tile — the OS voice.
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Wordmark({
  className,
  href = "/",
}: {
  className?: string;
  href?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-2 select-none", className)}
    >
      <span className="font-display text-[1.35rem] font-medium tracking-tight text-head">
        Life
      </span>
      <span className="grid h-6 place-items-center rounded-sm bg-amber px-1.5 font-mono text-[0.72rem] font-semibold tracking-wider text-ink-deep">
        OS
      </span>
    </Link>
  );
}
