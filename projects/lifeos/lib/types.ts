// LifeOS domain model — the person is the root object.
// Framework is universal; context is personal. (see ideas/lifeos-engine.md)

export type DomainKey =
  | "health"
  | "career"
  | "relationships"
  | "finance"
  | "education"
  | "spiritual"
  | "projects"
  | "recreation";

export interface Domain {
  key: DomainKey;
  name: string;
  /** 0–100 self-assessed health, drives the domain radar */
  health: number;
}

export interface Value {
  id: string;
  label: string;
  /** lower rank = higher priority; conflicts resolved by rank */
  rank: number;
}

export interface Goal {
  id: string;
  domain: DomainKey;
  title: string;
  metric: string;
  /** 0–100 progress toward the success metric */
  progress: number;
  deadline?: string;
  importance: 1 | 2 | 3; // 3 = highest
}

export interface SystemProcess {
  id: string;
  goalId: string;
  title: string;
  cadence: "daily" | "weekly" | "weekday";
}

export type TaskBlock = "deep" | "admin" | "body" | "connect" | "review";

export interface Task {
  id: string;
  title: string;
  domain: DomainKey;
  goalId?: string;
  /** decision-engine leverage score 0–100 — drives ordering */
  leverage: number;
  block: TaskBlock;
  /** estimated minutes */
  estimate: number;
  done: boolean;
  /** ISO date (yyyy-mm-dd) the task belongs to */
  date: string;
}

export interface Person {
  name: string;
  identity: string;
  values: Value[];
  domains: Domain[];
  goals: Goal[];
  systems: SystemProcess[];
  tasks: Task[];
  /** consecutive days the daily plan was completed */
  streak: number;
  /** whether onboarding has been completed */
  onboarded: boolean;
}

export const DOMAIN_META: Record<
  DomainKey,
  { name: string; tint: string; glyph: string }
> = {
  health: { name: "Health", tint: "var(--sage)", glyph: "◐" },
  career: { name: "Career", tint: "var(--amber)", glyph: "◆" },
  relationships: { name: "Relationships", tint: "var(--amber-rich)", glyph: "❋" },
  finance: { name: "Finance", tint: "var(--sage-deep)", glyph: "▲" },
  education: { name: "Education", tint: "var(--amber-deep)", glyph: "✦" },
  spiritual: { name: "Spiritual", tint: "var(--sage)", glyph: "☼" },
  projects: { name: "Projects", tint: "var(--amber)", glyph: "■" },
  recreation: { name: "Recreation", tint: "var(--sage-pale)", glyph: "◇" },
};

export const BLOCK_META: Record<TaskBlock, { label: string; hint: string }> = {
  deep: { label: "Deep Work", hint: "Highest cognitive load — protect it" },
  admin: { label: "Admin", hint: "Low-load, batchable" },
  body: { label: "Body", hint: "Movement, fuel, recovery" },
  connect: { label: "Connect", hint: "People who matter" },
  review: { label: "Review", hint: "Reflect, measure, adjust" },
};
