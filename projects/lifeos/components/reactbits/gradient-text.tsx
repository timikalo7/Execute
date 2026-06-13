// TIER: React Bits (adapted) — ~35%
// Warm amber→sage gradient text. Used sparingly, on key nouns only.
import { cn } from "@/lib/utils";

export function GradientText({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn("bg-clip-text text-transparent", className)}
      style={{
        backgroundImage:
          "linear-gradient(100deg, var(--amber-rich), var(--amber) 40%, var(--sage) 110%)",
      }}
    >
      {children}
    </span>
  );
}
