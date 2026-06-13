import Link from "next/link";
import { Wordmark } from "@/components/brand";

export function Footer() {
  return (
    <footer className="border-t border-hairline bg-ink-deep">
      <div className="mx-auto flex max-w-section flex-col items-start justify-between gap-6 px-5 py-12 sm:flex-row sm:items-center sm:px-8">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-xs text-sm text-muted">
            Person + Context + Goals + Systems + Knowledge + Feedback = a
            personal operating system.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2 font-mono text-xs text-muted">
          <Link href="/demo" className="transition-colors hover:text-head">
            Demo
          </Link>
          <Link href="/sign-up" className="transition-colors hover:text-head">
            Sign up
          </Link>
          <Link href="/sign-in" className="transition-colors hover:text-head">
            Sign in
          </Link>
          <Link href="/dashboard" className="transition-colors hover:text-head">
            Dashboard
          </Link>
        </div>
      </div>
      <div className="border-t border-hairline">
        <div className="mx-auto max-w-section px-5 py-5 sm:px-8">
          <p className="font-mono text-[0.66rem] uppercase tracking-wider text-faint">
            © {new Date().getFullYear()} LifeOS · Built with Execute
          </p>
        </div>
      </div>
    </footer>
  );
}
