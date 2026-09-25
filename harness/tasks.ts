/**
 * The task specs. The basic suite is tasks/tasks.json; the hard suite is every tasks/hard/*.json,
 * each written next to its page in app/tasks/hard and its solving test in test/hard.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type Suite = "basic" | "hard";

export interface Task {
  id: string;
  suite: Suite;
  /** The page's document title, which is also its window title. */
  title: string;
  category: string;
  skills: string[];
  prompt: string;
  expected: Record<string, unknown>;
}

const DIR = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "tasks");
const read = (file: string) => (JSON.parse(readFileSync(file, "utf8")) as { tasks: Omit<Task, "suite">[] }).tasks;

export function loadTasks(suites: Suite[] = ["basic", "hard"]): Task[] {
  const basic = read(join(DIR, "tasks.json")).map((t) => ({ ...t, suite: "basic" as const }));
  const hard = readdirSync(join(DIR, "hard"))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .flatMap((f) => read(join(DIR, "hard", f)).map((t) => ({ ...t, suite: "hard" as const })));
  return [...basic, ...hard].filter((t) => suites.includes(t.suite));
}
