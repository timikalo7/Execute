import { Person, Task } from "./types";

const today = () => new Date().toISOString().slice(0, 10);

// A believable, already-running LifeOS — used to seed a new account so the
// dashboard is never an empty shell. The Daily Engine derives "today" from this.
export function seedPerson(name = "there"): Person {
  const d = today();
  return {
    name,
    identity: "Founder · Athlete · Lifelong learner",
    onboarded: true,
    streak: 12,
    values: [
      { id: "v1", label: "Health", rank: 1 },
      { id: "v2", label: "Craft", rank: 2 },
      { id: "v3", label: "Family", rank: 3 },
      { id: "v4", label: "Freedom", rank: 4 },
    ],
    domains: [
      { key: "health", name: "Health", health: 72 },
      { key: "career", name: "Career", health: 64 },
      { key: "relationships", name: "Relationships", health: 58 },
      { key: "finance", name: "Finance", health: 81 },
      { key: "education", name: "Education", health: 69 },
      { key: "projects", name: "Projects", health: 55 },
    ],
    goals: [
      { id: "g1", domain: "health", title: "Sub-3:30 marathon", metric: "Long run pace ≤ 5:00/km", progress: 48, importance: 3, deadline: "2026-10-01" },
      { id: "g2", domain: "career", title: "Ship LifeOS to 1k users", metric: "Weekly active users", progress: 30, importance: 3, deadline: "2026-09-01" },
      { id: "g3", domain: "education", title: "Read 24 books", metric: "Books finished this year", progress: 58, importance: 2 },
      { id: "g4", domain: "relationships", title: "Weekly deep connection", metric: "Quality hours / week", progress: 40, importance: 2 },
    ],
    systems: [
      { id: "s1", goalId: "g1", title: "Run training block", cadence: "weekday" },
      { id: "s2", goalId: "g2", title: "Deep work on core loop", cadence: "weekday" },
      { id: "s3", goalId: "g3", title: "Read 20 pages", cadence: "daily" },
      { id: "s4", goalId: "g4", title: "Call someone who matters", cadence: "daily" },
    ],
    tasks: seedTasks(d),
  };
}

function seedTasks(d: string): Task[] {
  return [
    { id: "t1", title: "Tempo run — 8km @ 4:55/km", domain: "health", goalId: "g1", leverage: 88, block: "body", estimate: 50, done: false, date: d },
    { id: "t2", title: "Rebuild the onboarding aha-moment", domain: "career", goalId: "g2", leverage: 95, block: "deep", estimate: 90, done: false, date: d },
    { id: "t3", title: "Review weekly active-user funnel", domain: "career", goalId: "g2", leverage: 74, block: "review", estimate: 30, done: false, date: d },
    { id: "t4", title: "Read 20 pages — Thinking in Systems", domain: "education", goalId: "g3", leverage: 61, block: "deep", estimate: 25, done: true, date: d },
    { id: "t5", title: "Call Dad", domain: "relationships", goalId: "g4", leverage: 70, block: "connect", estimate: 20, done: false, date: d },
    { id: "t6", title: "Inbox zero + triage", domain: "projects", leverage: 38, block: "admin", estimate: 20, done: false, date: d },
    { id: "t7", title: "Evening review + tomorrow's top 3", domain: "projects", leverage: 66, block: "review", estimate: 10, done: false, date: d },
  ];
}

// A fresh, near-empty person for users who skip the seed (post-onboarding real start).
export function emptyPerson(name = "there"): Person {
  return {
    name,
    identity: "",
    onboarded: false,
    streak: 0,
    values: [],
    domains: [],
    goals: [],
    systems: [],
    tasks: [],
  };
}
