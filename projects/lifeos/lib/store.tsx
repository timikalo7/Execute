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

/** Fields a user may edit on an existing task. */
export type TaskPatch = Partial<
  Pick<Task, "title" | "leverage" | "block" | "estimate" | "domain">
>;

interface StoreApi {
  person: Person | null; // null until hydrated
  ready: boolean;
  /** true when the last write to localStorage failed (private mode, quota). */
  storageError: boolean;
  toggleTask: (id: string) => void;
  addTask: (t: Omit<Task, "id" | "date" | "done">) => void;
  editTask: (id: string, patch: TaskPatch) => void;
  removeTask: (id: string) => void;
  setPerson: (p: Person) => void;
  resetSeed: () => void;
  clear: () => void;
}

const clampLeverage = (n: number) =>
  Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0)));

const StoreCtx = createContext<StoreApi | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [person, setPersonState] = useState<Person | null>(null);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);

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

  // One write path: update memory, then try to persist. A failed write keeps
  // the change in memory and raises storageError so the UI can be honest.
  const commit = useCallback((next: Person) => {
    setPersonState(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, []);

  const persist = commit;

  const toggleTask = useCallback(
    (id: string) => {
      if (!person) return;
      commit({
        ...person,
        tasks: person.tasks.map((t) =>
          t.id === id ? { ...t, done: !t.done } : t,
        ),
      });
    },
    [person, commit],
  );

  const addTask: StoreApi["addTask"] = useCallback(
    (t) => {
      if (!person) return;
      const task: Task = {
        ...t,
        leverage: clampLeverage(t.leverage),
        id: `t${Date.now()}`,
        done: false,
        date: new Date().toISOString().slice(0, 10),
      };
      commit({ ...person, tasks: [task, ...person.tasks] });
    },
    [person, commit],
  );

  const editTask = useCallback(
    (id: string, patch: TaskPatch) => {
      if (!person) return;
      commit({
        ...person,
        tasks: person.tasks.map((t) =>
          t.id === id
            ? {
                ...t,
                ...patch,
                leverage:
                  patch.leverage === undefined
                    ? t.leverage
                    : clampLeverage(patch.leverage),
              }
            : t,
        ),
      });
    },
    [person, commit],
  );

  const removeTask = useCallback(
    (id: string) => {
      if (!person) return;
      commit({ ...person, tasks: person.tasks.filter((t) => t.id !== id) });
    },
    [person, commit],
  );

  const api = useMemo<StoreApi>(
    () => ({
      person,
      ready,
      storageError,
      toggleTask,
      addTask,
      editTask,
      removeTask,
      setPerson: persist,
      resetSeed: () => persist(seedPerson(person?.name ?? "there")),
      clear: () => persist(emptyPerson(person?.name ?? "there")),
    }),
    [person, ready, storageError, toggleTask, addTask, editTask, removeTask, persist],
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
