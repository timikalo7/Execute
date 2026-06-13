"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Person, Task } from "./types";
import { seedPerson, emptyPerson } from "./seed";

const KEY = "lifeos:person:v1";

interface StoreApi {
  person: Person | null; // null until hydrated
  ready: boolean;
  toggleTask: (id: string) => void;
  addTask: (t: Omit<Task, "id" | "date" | "done">) => void;
  setPerson: (p: Person) => void;
  resetSeed: () => void;
  clear: () => void;
}

const StoreCtx = createContext<StoreApi | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [person, setPersonState] = useState<Person | null>(null);
  const [ready, setReady] = useState(false);

  // Hydrate from localStorage once on mount (SSR-safe).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      setPersonState(raw ? (JSON.parse(raw) as Person) : seedPerson());
    } catch {
      setPersonState(seedPerson());
    }
    setReady(true);
  }, []);

  const persist = useCallback((p: Person) => {
    setPersonState(p);
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch {
      /* storage may be unavailable — keep in-memory */
    }
  }, []);

  const toggleTask = useCallback(
    (id: string) => {
      setPersonState((prev) => {
        if (!prev) return prev;
        const tasks = prev.tasks.map((t) =>
          t.id === id ? { ...t, done: !t.done } : t,
        );
        const next = { ...prev, tasks };
        try {
          localStorage.setItem(KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [],
  );

  const addTask: StoreApi["addTask"] = useCallback((t) => {
    setPersonState((prev) => {
      if (!prev) return prev;
      const task: Task = {
        ...t,
        id: `t${Date.now()}`,
        done: false,
        date: new Date().toISOString().slice(0, 10),
      };
      const next = { ...prev, tasks: [task, ...prev.tasks] };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const api = useMemo<StoreApi>(
    () => ({
      person,
      ready,
      toggleTask,
      addTask,
      setPerson: persist,
      resetSeed: () => persist(seedPerson(person?.name ?? "there")),
      clear: () => persist(emptyPerson(person?.name ?? "there")),
    }),
    [person, ready, toggleTask, addTask, persist],
  );

  return <StoreCtx.Provider value={api}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

// --- Daily Engine selectors -------------------------------------------------

/** Today's tasks ordered by the decision engine (leverage desc, undone first). */
export function useToday(person: Person | null) {
  return useMemo(() => {
    if (!person) return { tasks: [], done: 0, total: 0, minutes: 0, focus: null as Task | null };
    const d = new Date().toISOString().slice(0, 10);
    const tasks = person.tasks
      .filter((t) => t.date === d || person.tasks.every((x) => x.date !== d))
      .slice()
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return b.leverage - a.leverage;
      });
    const total = tasks.length;
    const done = tasks.filter((t) => t.done).length;
    const minutes = tasks.filter((t) => !t.done).reduce((s, t) => s + t.estimate, 0);
    const focus = tasks.find((t) => !t.done) ?? null;
    return { tasks, done, total, minutes, focus };
  }, [person]);
}
