// Flat panel — rests on a hairline + background shift, no default shadow.
import { cn } from "@/lib/utils";

export function Panel({
  title,
  action,
  className,
  children,
}: {
  title?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-hairline bg-ink-raised p-5 sm:p-6",
        className,
      )}
    >
      {(title || action) && (
        <header className="mb-4 flex items-center justify-between">
          {title && <h2 className="eyebrow">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
