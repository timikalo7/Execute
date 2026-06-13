import { DomainKey, Person, Task, TaskBlock } from "./types";

// The onboarding captures just enough to generate a real first daily plan.
export interface OnboardingDraft {
  name: string;
  identities: string[];
  values: string[]; // ordered, highest first
  domains: DomainKey[];
  goalDomain: DomainKey | null;
  goalTitle: string;
  goalMetric: string;
  systemTitle: string;
}

export const IDENTITY_OPTIONS = [
  "Founder",
  "Student",
  "Engineer",
  "Athlete",
  "Parent",
  "Artist",
  "Researcher",
  "Leader",
  "Writer",
  "Investor",
];

export const VALUE_OPTIONS = [
  "Health",
  "Craft",
  "Family",
  "Freedom",
  "Learning",
  "Wealth",
  "Service",
  "Creativity",
  "Faith",
  "Adventure",
];

export const DOMAIN_OPTIONS: { key: DomainKey; name: string }[] = [
  { key: "health", name: "Health" },
  { key: "career", name: "Career" },
  { key: "relationships", name: "Relationships" },
  { key: "finance", name: "Finance" },
  { key: "education", name: "Education" },
  { key: "projects", name: "Projects" },
  { key: "spiritual", name: "Spiritual" },
  { key: "recreation", name: "Recreation" },
];

export function emptyDraft(): OnboardingDraft {
  return {
    name: "",
    identities: [],
    values: [],
    domains: [],
    goalDomain: null,
    goalTitle: "",
    goalMetric: "",
    systemTitle: "",
  };
}

// The Daily Engine: turn the onboarding draft into a concrete first-day plan.
// This is the "aha" — input (goal + system + domains) → output (today's tasks).
export function generatePlan(draft: OnboardingDraft): Task[] {
  const d = new Date().toISOString().slice(0, 10);
  const dom = draft.goalDomain ?? draft.domains[0] ?? "projects";
  const tasks: Array<Omit<Task, "id" | "date">> = [];

  // 1. The system's keystone action — highest leverage, deep block.
  if (draft.systemTitle) {
    tasks.push({
      title: draft.systemTitle,
      domain: dom,
      leverage: 94,
      block: blockFor(dom),
      estimate: 60,
      done: false,
    });
  }

  // 2. A measurement task tied to the goal's success metric.
  if (draft.goalMetric) {
    tasks.push({
      title: `Log progress — ${draft.goalMetric}`,
      domain: dom,
      leverage: 71,
      block: "review",
      estimate: 10,
      done: false,
    });
  }

  // 3. One supporting action per other selected domain (max 3).
  const others = draft.domains.filter((x) => x !== dom).slice(0, 3);
  const supporting: Record<DomainKey, { title: string; block: TaskBlock; est: number }> = {
    health: { title: "Move your body — 30 min", block: "body", est: 30 },
    career: { title: "30 min on your most important project", block: "deep", est: 30 },
    relationships: { title: "Reach out to someone who matters", block: "connect", est: 15 },
    finance: { title: "Review one money decision", block: "admin", est: 15 },
    education: { title: "Read 20 pages", block: "deep", est: 25 },
    projects: { title: "Advance your top project by one step", block: "deep", est: 30 },
    spiritual: { title: "10 minutes of stillness", block: "review", est: 10 },
    recreation: { title: "Protect time to recharge", block: "body", est: 30 },
  };
  others.forEach((o, i) => {
    const s = supporting[o];
    tasks.push({
      title: s.title,
      domain: o,
      leverage: 60 - i * 6,
      block: s.block,
      estimate: s.est,
      done: false,
    });
  });

  // 4. Always close with the evening review — the improvement loop.
  tasks.push({
    title: "Evening review — what worked, tomorrow's top 3",
    domain: "projects",
    leverage: 64,
    block: "review",
    estimate: 10,
    done: false,
  });

  return tasks.map((t, i) => ({ ...t, id: `gen${i}`, date: d }));
}

function blockFor(d: DomainKey): TaskBlock {
  if (d === "health" || d === "recreation") return "body";
  if (d === "relationships") return "connect";
  if (d === "finance") return "admin";
  return "deep";
}

// Assemble a full Person from the onboarding draft + generated plan.
export function personFromDraft(draft: OnboardingDraft): Person {
  return {
    name: draft.name || "there",
    identity: draft.identities.join(" · "),
    onboarded: true,
    streak: 1,
    values: draft.values.map((label, i) => ({ id: `v${i}`, label, rank: i + 1 })),
    domains: draft.domains.map((key) => ({
      key,
      name: DOMAIN_OPTIONS.find((d) => d.key === key)?.name ?? key,
      health: 50 + Math.round(Math.random() * 20),
    })),
    goals: draft.goalTitle
      ? [
          {
            id: "g1",
            domain: draft.goalDomain ?? draft.domains[0] ?? "projects",
            title: draft.goalTitle,
            metric: draft.goalMetric || "Defined during weekly review",
            progress: 5,
            importance: 3,
          },
        ]
      : [],
    systems: draft.systemTitle
      ? [{ id: "s1", goalId: "g1", title: draft.systemTitle, cadence: "weekday" }]
      : [],
    tasks: generatePlan(draft),
  };
}
