/**
 * Runs the benchmark. One Chrome window (its own profile, app mode) shows the bench app for the
 * whole session; each run points the page at a task through the server, so Chrome is launched and
 * brought up only once. Every run gets the same prompt, the pid and window id of that window, and
 * one MCP server. Success is decided by judge.ts on the state the page reports, nothing else.
 *
 *   tsx harness/run.ts [--suite basic|hard] [--reps N] [--agents opus-5.5,gpt-6-sol] [--tools cua-jev,cua-driver]
 *                      [--only task,task] [--timeout-min 15] [--out results/runs.jsonl] [--dry]
 *
 * Records are appended to the output file, and a run already recorded there is skipped, so an
 * interrupted bench resumes where it stopped. While the screen is locked, the bench waits.
 *
 * Nothing else may drive a Chrome while the bench runs. A run during which another automated Chrome
 * started (headless, remote debugging, or one on the bench's profile), or after which the bench's
 * Chrome no longer shows exactly one window, is not recorded: it goes to interfered.jsonl, the bench
 * waits until that Chrome is gone, and the run is done again.
 *
 * While it runs, .work/bench.lock holds the bench's pid; `tsx harness/wait.ts` waits on that pid.
 * --dry loads every task once without an agent, to check each page loads alone in its window and
 * does not already pass.
 */
import { execFile, spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { startServer, type BenchServer } from "../server/server.js";
import { DRIVER, runAgent, type AgentSpec, type ToolSet } from "./agents.js";
import { judge } from "./judge.js";
import { costUsd } from "./prices.js";
import { loadTasks, type Suite, type Task } from "./tasks.js";

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORK = join(ROOT, ".work");
const PROFILE = join(WORK, "chrome-profile");
export const LOCK = join(WORK, "bench.lock");

export const AGENTS: AgentSpec[] = [
  { label: "opus-5.5", harness: "claude", model: "claude-opus-5-5" },
  { label: "gpt-6-astra", harness: "codex", model: "gpt-6-astra" },
  { label: "gpt-6-sol", harness: "codex", model: "gpt-6-sol" },
  { label: "gpt-6-luna", harness: "codex", model: "gpt-6-luna" },
];

const args = process.argv.slice(2);
const opt = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const reps = Number(opt("--reps") ?? 1);
const agentLabels = opt("--agents")?.split(",");
const agents = AGENTS.filter((a) => !agentLabels || agentLabels.includes(a.label));
const toolSets = (opt("--tools")?.split(",") ?? ["cua-jev", "cua-driver"]) as ToolSet[];
const only = opt("--only")?.split(",");
const timeoutMs = Number(opt("--timeout-min") ?? 15) * 60_000;
const OUT = resolve(ROOT, opt("--out") ?? "results/runs.jsonl");
const INTERFERED = join(dirname(OUT), "interfered.jsonl");
const RAW = join(dirname(OUT), "raw");
const dry = args.includes("--dry");
const suites = (opt("--suite")?.split(",") ?? ["basic"]) as Suite[];
const tasks = loadTasks(suites).filter((t) => !only || only.includes(t.id));

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function driverCall<T>(tool: string, a: Record<string, unknown>): Promise<T> {
  const { stdout } = await run(DRIVER, ["call", tool, JSON.stringify(a)], { maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(stdout) as T;
}

async function frontPid(): Promise<number | undefined> {
  try {
    const asn = (await run("lsappinfo", ["front"])).stdout.trim();
    const { stdout } = await run("lsappinfo", ["info", "-only", "pid", asn]);
    return Number(/"pid"\s*=\s*(\d+)/.exec(stdout)?.[1]) || undefined;
  } catch {
    return undefined;
  }
}

/** The app to hand the front back to: the last one seen in front that is not the bench's Chrome (by pid, as the user's own Chrome shares its bundle id). */
let homePid: number | undefined;

async function noteFront(chrome?: number): Promise<void> {
  const pid = await frontPid();
  if (pid && pid !== chrome) homePid = pid;
}

/** Chrome must start every run in the background; if it is in front, the front goes back home. */
async function handBackFront(chrome: number): Promise<boolean> {
  for (let i = 0; i < 3 && (await frontPid()) === chrome; i++) {
    const home = homePid ?? Number((await run("pgrep", ["-x", "Finder"])).stdout.trim());
    await run("osascript", ["-e", `tell application "System Events" to set frontmost of (first process whose unix id is ${home}) to true`]).catch(() => undefined);
    await pause(800);
  }
  return (await frontPid()) !== chrome;
}

async function screenLocked(): Promise<boolean> {
  try {
    const { stdout } = await run("ioreg", ["-n", "Root", "-d1", "-a"], { maxBuffer: 8 * 1024 * 1024 });
    return /<key>CGSSessionScreenIsLocked<\/key>\s*<true\/>/.test(stdout);
  } catch {
    return false;
  }
}

/** The bench's own Chrome: a separate profile, so the user's Chrome and its tabs are never touched. */
async function chromePid(): Promise<number | undefined> {
  const { stdout } = await run("pgrep", ["-f", "--", `--user-data-dir=${PROFILE}`]).catch(() => ({ stdout: "" }));
  const pids = stdout.split(/\s+/).filter(Boolean).map(Number);
  for (const pid of pids) {
    const { stdout: cmd } = await run("ps", ["-o", "command=", "-p", String(pid)]).catch(() => ({ stdout: "" }));
    if (!cmd.includes("--type=")) return pid; // the browser process, not a renderer or helper
  }
  return undefined;
}

async function ensureChrome(url: string): Promise<number> {
  const existing = await chromePid();
  if (existing) return existing;
  await noteFront();
  mkdirSync(PROFILE, { recursive: true });
  await run("open", ["-g", "-n", "-a", "Google Chrome", "--args", `--user-data-dir=${PROFILE}`, "--no-first-run", "--no-default-browser-check", "--force-renderer-accessibility", "--disable-features=Translate", "--window-size=1100,860", `--app=${url}`]);
  for (let i = 0; i < 60; i++) {
    const pid = await chromePid();
    if (pid) {
      await pause(2000);
      // Launching raises Chrome once; the front goes back to whatever had it.
      await handBackFront(pid);
      return pid;
    }
    await pause(250);
  }
  throw new Error("Chrome did not start");
}

type Win = { window_id: number; title?: string; is_on_screen?: boolean };
const windowsOf = async (pid: number) => ((await driverCall<{ windows?: Win[] }>("list_windows", { pid })).windows ?? []).filter((w) => w.is_on_screen !== false && (w.title ?? "") !== "");

/** Points the page at the task and waits until its window, and only that one, shows the task's title. */
async function loadTask(srv: BenchServer, pid: number, task: Task, runId: string): Promise<{ windowId: number; initial: unknown }> {
  srv.setControl({ task: task.id, run: runId });
  for (let i = 0; i < 120; i++) {
    if (srv.state(runId)) {
      const wins = await windowsOf(pid);
      const win = wins.find((w) => w.title === task.title);
      if (win && wins.length === 1) {
        await pause(400);
        return { windowId: win.window_id, initial: srv.state(runId)!.state };
      }
    }
    await pause(250);
  }
  throw new Error(`task ${task.id} did not load in a single window titled "${task.title}"`);
}

/** The bench's Chrome must show exactly one window; anything else (a stray new tab or window, or none left) means a fresh start. */
async function ensureSingleWindow(srv: BenchServer): Promise<number> {
  let pid = await ensureChrome(srv.url);
  const shown = (await windowsOf(pid)).length;
  if (shown !== 1) {
    process.stderr.write(`the bench's Chrome shows ${shown} windows: restarting it\n`);
    await run("kill", [String(pid)]).catch(() => undefined);
    for (let i = 0; i < 40 && (await chromePid()); i++) await pause(250);
    pid = await ensureChrome(srv.url);
  }
  return pid;
}

const BROWSER = /\/MacOS\/(Google Chrome( for Testing)?|Chromium)( |$)|chrome-headless-shell/;

/**
 * Chrome browser processes (not renderers or helpers) that some program drives: headless, remote
 * debugging, or on a profile of its own. The user's everyday Chrome is none of these.
 */
async function automatedChromes(bench?: number): Promise<Map<number, string>> {
  const { stdout } = await run("ps", ["-axo", "pid=,command="], { maxBuffer: 16 * 1024 * 1024 }).catch(() => ({ stdout: "" }));
  const found = new Map<number, string>();
  for (const line of stdout.split("\n")) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (!m) continue;
    const [pid, cmd] = [Number(m[1]), m[2]!];
    // The browser executable only: renderers carry --type=, and crashpad handlers are other binaries.
    if (pid === bench || !BROWSER.test(cmd) || cmd.includes("--type=")) continue;
    if (/--headless|--remote-debugging|--user-data-dir|Chrome for Testing|chrome-headless-shell/.test(cmd)) found.set(pid, cmd);
  }
  return found;
}

/** Watches for automated Chromes that were not there when the run started. */
function watchInterference(bench: number, before: Map<number, string>): { stop: () => Promise<string[]> } {
  const seen = new Map<number, string>();
  let busy = false;
  const look = async () => {
    for (const [pid, cmd] of await automatedChromes(bench)) if (!before.has(pid)) seen.set(pid, cmd);
  };
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    await look();
    busy = false;
  }, 1000);
  return {
    stop: async () => {
      clearInterval(timer);
      while (busy) await pause(20);
      await look();
      return [...seen].map(([pid, cmd]) => `${pid} ${cmd.slice(0, 160)}`);
    },
  };
}

/** Automated Chromes already running when the bench started (another session's, say): they were there for every run alike. */
let preexisting = new Set<number>();

/** Holds the bench until no automated Chrome has started since the bench did, other than its own. */
async function waitForQuiet(bench?: number): Promise<void> {
  let told = "";
  for (;;) {
    const others = [...(await automatedChromes(bench)).keys()].filter((pid) => !preexisting.has(pid));
    if (!others.length) return;
    const now = others.join(", ");
    if (now !== told) process.stderr.write(`another automated Chrome started (${now}): waiting until it exits\n`);
    told = now;
    await pause(15_000);
  }
}

function promptFor(task: Task, pid: number, windowId: number): string {
  return [
    `You are operating a web app shown in a Google Chrome window on macOS, using the tools you have. The target is the "Google Chrome" app running as pid ${pid}, window id ${windowId}. Use only that window, and do not navigate away from the page.`,
    "Work in the background: never bring the app to the front and never activate it.",
    "",
    `Task: ${task.prompt}`,
    "",
    "When you have finished, end your final message with exactly one line: `RESULT: success` if the task is done, or `RESULT: failure` if it is not.",
  ].join("\n");
}

/** Samples the frontmost app every 200 ms; the bench's Chrome in front counts as a focus steal. */
function watchFront(pid: number): { stop: () => Promise<number> } {
  let steals = 0;
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    if ((await frontPid()) === pid) steals++;
    busy = false;
  }, 200);
  return {
    stop: async () => {
      clearInterval(timer);
      while (busy) await pause(20);
      return steals;
    },
  };
}

function done(): Set<string> {
  if (!existsSync(OUT)) return new Set();
  return new Set(
    readFileSync(OUT, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { agent: string; tools: string; task: string; rep: number })
      .map((r) => `${r.agent}|${r.tools}|${r.task}|${r.rep}`),
  );
}

/** Loads every task once without an agent: each must load alone in its window and not already pass. */
async function dryRun(srv: BenchServer): Promise<void> {
  for (const task of tasks) {
    const pid = await ensureSingleWindow(srv);
    const runId = `dry-${task.id}`;
    const { initial } = await loadTask(srv, pid, task, runId);
    const v = judge(task.expected, initial);
    process.stderr.write(`${task.id}: loaded as "${task.title}", initial ${v.checks.passed}/${v.checks.total}${v.pass ? " PASSES ALREADY" : ""}\n`);
    if (v.pass) throw new Error(`${task.id}: the initial state already passes`);
    srv.setControl({});
    await pause(800);
  }
}

/** The lock names the bench's pid, so anything waiting for it waits on the process, not on a name. */
function takeLock(): void {
  if (existsSync(LOCK)) {
    const pid = Number(JSON.parse(readFileSync(LOCK, "utf8")).pid);
    let alive = false;
    try {
      process.kill(pid, 0);
      alive = true;
    } catch {
      // a stale lock from a bench that died
    }
    if (alive && pid !== process.pid) throw new Error(`another bench is running (pid ${pid})`);
  }
  writeFileSync(LOCK, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), out: OUT, suites }));
}

/** One agent run on one task and what it left behind; `interfered` says why it does not count, if someone else was at the screen. */
async function runOnce(srv: BenchServer, task: Task, agent: AgentSpec, tools: ToolSet, rep: number) {
  while (await screenLocked()) {
    process.stderr.write("the screen is locked: waiting\n");
    await pause(30_000);
  }
  await waitForQuiet(await chromePid());
  const pid = await ensureSingleWindow(srv);
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${agent.label}-${tools}-${task.id}`;
  const { windowId, initial } = await loadTask(srv, pid, task, runId);
  if (judge(task.expected, initial).pass) throw new Error(`${task.id}: the initial state already passes`);
  await noteFront(pid);
  const background = await handBackFront(pid);
  const watch = watchFront(pid);
  const interference = watchInterference(pid, await automatedChromes(pid));
  const t0 = Date.now();
  const a = await runAgent(agent, tools, promptFor(task, pid, windowId), WORK, join(RAW, `${runId}.stream.jsonl`), timeoutMs);
  const wallMs = Date.now() - t0;
  const steals = await watch.stop();
  const intruders = await interference.stop();
  const windowsAfter = (await windowsOf(pid)).map((w) => w.title ?? "");
  await pause(500); // the page's last report is in flight
  const final = srv.state(runId)?.state;
  srv.setControl({});
  const v = judge(task.expected, final);
  const claimed = /RESULT:\s*success/i.test(a.finalText) ? "success" : /RESULT:\s*failure/i.test(a.finalText) ? "failure" : "none";
  // prettier-ignore
  const record = {
    runId, rep, suite: task.suite, task: task.id, category: task.category, agent: agent.label, harness: agent.harness, model: agent.model, tools,
    pass: v.pass, checks: v.checks, mismatches: v.mismatches, final,
    claimed, falseSuccess: claimed === "success" && !v.pass,
    toolCalls: a.toolCalls, toolNames: a.toolNames, otherTools: a.otherTools,
    wallMs, usage: a.usage, costUsd: costUsd(agent.model, a.usage), reportedCostUsd: a.reportedCostUsd,
    jev: a.jev, focusSteals: steals, startedInBackground: background, windowId, windowsAfter, intruders, timedOut: a.timedOut, exitCode: a.exitCode, error: a.error,
  };
  const interfered = intruders.length ? `${intruders.length} automated Chrome started` : windowsAfter.length !== 1 ? `${windowsAfter.length} windows after the run` : "";
  return { record, interfered };
}

async function bench(srv: BenchServer): Promise<void> {
  const recorded = done();
  const total = reps * tasks.length * agents.length * toolSets.length;
  let n = 0;
  for (let rep = 1; rep <= reps; rep++) {
    for (const task of tasks) {
      for (const [ai, agent] of agents.entries()) {
        // Alternate which tool set goes first, so neither always meets a freshly loaded page first.
        const order = (rep + ai) % 2 === 0 ? toolSets : [...toolSets].reverse();
        for (const tools of order) {
          n++;
          if (recorded.has(`${agent.label}|${tools}|${task.id}|${rep}`)) continue;
          const tag = `[${n}/${total}] ${task.id} ${agent.label} ${tools} rep ${rep}`;
          for (let attempt = 1; ; attempt++) {
            const { record, interfered } = await runOnce(srv, task, agent, tools, rep);
            await pause(800);
            // A window lost three times over is the agent's doing, not a visitor's: it is recorded as it stands.
            const lostWindow = interfered && !record.intruders.length && attempt >= 3;
            if (!interfered || lostWindow) {
              appendFileSync(OUT, `${JSON.stringify(lostWindow ? { ...record, interfered } : record)}\n`);
              const r = record;
              process.stderr.write(`${tag}: ${r.pass ? "PASS" : "FAIL"} claimed=${r.claimed} tools=${r.toolCalls} ${Math.round(r.wallMs / 1000)}s $${r.costUsd.toFixed(3)}${r.error ? ` error=${r.error.slice(0, 120)}` : ""}\n`);
              break;
            }
            // Someone else was at the screen: the run says nothing about the agent, so it is done again.
            appendFileSync(INTERFERED, `${JSON.stringify({ ...record, interfered, attempt })}\n`);
            process.stderr.write(`${tag}: INTERFERED (${interfered}), attempt ${attempt}: redoing\n`);
            if (attempt >= 3) throw new Error("interfered three times in a row: stopping");
          }
        }
      }
    }
  }
}

async function main(): Promise<void> {
  mkdirSync(WORK, { recursive: true });
  mkdirSync(RAW, { recursive: true });
  takeLock();
  // Keep the display awake, so a long bench does not lock the screen under itself.
  const awake = spawn("caffeinate", ["-d", "-i", "-w", String(process.pid)], { stdio: "ignore" });
  awake.unref();
  const srv = await startServer();
  preexisting = new Set((await automatedChromes(await chromePid())).keys());
  if (preexisting.size) process.stderr.write(`automated Chromes already running, not waited for: ${[...preexisting].join(", ")}\n`);
  try {
    await (dry ? dryRun(srv) : bench(srv));
  } finally {
    srv.setControl({});
    await pause(500);
    await srv.close();
    rmSync(LOCK, { force: true });
    awake.kill();
  }
}

await main();
