// TIER: Base (shadcn/ui pattern) — ~5%
"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const button = cva(
  "inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap rounded-sm transition-all duration-200 ease-ks focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none",
  {
    variants: {
      variant: {
        // Primary: amber fill, ink text — the single confident CTA
        primary:
          "bg-amber text-ink-deep hover:bg-amber-pale hover:-translate-y-[1px] shadow-[0_14px_38px_-12px_var(--amber-deep)]",
        // Secondary: transparent, amber hairline
        secondary:
          "bg-transparent text-[var(--text-head)] border border-hairline-strong hover:border-amber/70 hover:-translate-y-[1px]",
        ghost:
          "bg-transparent text-[var(--text-body)] hover:bg-[var(--paper-sunk)]",
        sage: "bg-sage text-white hover:bg-sage-deep hover:-translate-y-[1px]",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-6 text-[0.95rem]",
        lg: "h-[58px] px-9 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(button({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";
