/**
 * Waits until the running bench exits, by its pid (from .work/bench.lock), and prints its progress
 * now and then. Waiting on the pid, not on a process name, cannot match the waiter itself.
 *
 *   tsx harness/wait.ts [--every-min 10]
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LOCK = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), ".work/bench.lock");
const args = process.argv.slice(2);
const everyMs = Number(args.includes("--every-min") ? args[args.indexOf("--every-min") + 1] : 10) * 60_000;

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const lines = (file: string) => (existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).length : 0);

if (!existsSync(LOCK)) {
  process.stdout.write("no bench is running\n");
} else {
  const { pid, out } = JSON.parse(readFileSync(LOCK, "utf8")) as { pid: number; out: string };
  let last = 0;
  while (alive(pid)) {
    if (Date.now() - last >= everyMs) {
      process.stdout.write(`${new Date().toISOString()} bench ${pid}: ${lines(out)} runs recorded\n`);
      last = Date.now();
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  process.stdout.write(`bench ${pid} exited: ${lines(out)} runs recorded\n`);
}
