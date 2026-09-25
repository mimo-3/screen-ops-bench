# screen-ops-bench

A small benchmark for agents that operate a screen. Tasks run in a web app (React) shown in a Google Chrome window on macOS. The agent gets the window's pid and id, one MCP server to see and act with, and a task in plain English. Success is decided **only** by the state the app itself reports at the end, compared with the task's expected state by exact equality.

It was written to compare models and tool sets for background computer use: Claude Code (`claude -p`) and Codex (`codex exec`) as harnesses, and [cua-jev](https://github.com/mimo-3/cua-jev) or plain [cua-driver](https://github.com/trycua/cua) as the MCP server.

## Tasks

There are two suites, picked with `--suite basic|hard`.

### Basic (12 tasks)

[`tasks/tasks.json`](tasks/tasks.json) holds each task's prompt and expected state. The pages are in [`app/tasks`](app/tasks).

| id | category | what it tests |
|---|---|---|
| `signup-form` | form | text fields, a native `<select>`, radios, a checkbox, submitting exactly once |
| `notes-append` | text | appending a line to a text area so it reads exactly a given multi-line string, saving, not typing into the search box next to it |
| `cart-coupon` | commerce | a quantity stepper, removing one row, applying a coupon |
| `invoice-paid` | table | one row action among eight look-alike rows (INV-1043, not INV-1034) |
| `contact-star` | list | search, starring in a filtered list (Hanako Yamada, not Taro Yamada), clearing the search afterwards |
| `delete-draft` | dialog | a destructive action the user asked for, a confirm dialog, look-alike names ("Q3 plan" vs "Q3 plan (old)") |
| `todo-reorder` | list | moving an item to the top with repeated "Move up" presses, keeping the rest in order |
| `settings-tabs` | settings | tabs, switches (`role="switch"`), saving |
| `wizard-team` | wizard | a three-step flow, a stepper to 5, a segmented control, confirming exactly once |
| `date-picker` | widget | a calendar popover, month navigation, a day in a grid |
| `volume-slider` | widget | a range slider (step 5) without touching the one next to it |
| `nested-menu` | menu | a menu button, a submenu, avoiding the "Archive" item next to "Export" |

### Hard (16 tasks)

Written after the Basic run turned out too easy (283/288 passed). Four designer agents wrote four tasks each, one group apiece (data, flows, traps, widgets). None of them saw cua-jev's code or any earlier result: the suite is held out from the tool it measures. Three reviewers then tried to break each task (is it solvable, is each trap really a trap, is the judge right), and the tasks were fixed and critiqued as a whole. cua-jev was frozen at `ab41474` before the tasks existed.

Every task lists its `traps` in [`tasks/hard/*.json`](tasks/hard): look-alike rows and people, defaults that must be changed, a Save that only saves one tab, results that arrive late, a pre-highlighted wrong suggestion, and so on. The pages are in [`app/tasks/hard`](app/tasks/hard). [`test/hard`](test/hard) solves every task through its UI in jsdom and checks that stepping on each trap fails the judge (`renderTask(id)`, and `lastReported()` for the page's last report).

| id | group | category | traps |
|---|---|---|---|
| `ledger-refund` | data | data | 9 |
| `tickets-bulk-archive` | data | data | 6 |
| `stock-reorder` | data | data | 7 |
| `logs-incident-link` | data | data | 7 |
| `support-refund` | flows | support | 7 |
| `payout-setup` | flows | form | 5 |
| `drive-cleanup` | flows | files | 7 |
| `event-update` | flows | planning | 6 |
| `profile-tabs-save` | traps | settings | 6 |
| `project-delete-confirm` | traps | admin | 6 |
| `checkout-country-reset` | traps | commerce | 6 |
| `vacation-responder` | traps | text | 6 |
| `pr-reviewers` | widgets | combobox | 6 |
| `roadmap-board` | widgets | dragdrop | 5 |
| `contract-files` | widgets | tree | 6 |
| `studio-booking` | widgets | picker | 6 |

## Scoring

- **Pass**: every key of `expected` equals the page's final state ([`harness/judge.ts`](harness/judge.ts)). Nothing is trimmed, "contains" never counts, and extra actions show up in the state (a second submission, a starred Taro, an archived report).
- **Score**: passes / runs, with a 95% Wilson interval.
- **Partial**: the share of `expected` keys that match, averaged over runs.
- **False success**: the agent ended with `RESULT: success` but the judge failed the run. The agent's own claim is used for nothing else.
- **Time**: wall-clock from starting the agent to its exit.
- **Tokens**: everything the model read or wrote as its harness reports it: uncached input, cache reads, cache writes and output (reasoning included).
- **Cost**: tokens × list price ([`harness/prices.ts`](harness/prices.ts)), the same way for every model. Jev's own usage (cua-jev only) is counted apart and is not in it.
- **Focus steals**: 200 ms samples in which the bench's Chrome was the frontmost app. Every run starts with it in the background.

The page reports its whole model after every change ([`app/report.ts`](app/report.ts)): the values it holds, not the input events. A value set through accessibility counts the same as a typed one.

## How a run works

1. The harness starts the app server and, once per session, a Chrome window in app mode with its own profile (`--user-data-dir=.work/chrome-profile`, `--force-renderer-accessibility`). The user's own Chrome is never touched. Launching raises Chrome once; the front is handed back to the previous app before any run.
2. For each run it points the page at the task through `/api/control`. The page loads the task with fresh state, so no run sees another's leftovers. The run starts only when the bench's Chrome shows exactly one window and its title is the task's `title`; a stray tab or window restarts Chrome first. Each record keeps the window id given and the window titles left at the end.
3. The agent runs headless with the same prompt: the target pid and window id, "work in the background", the task, and a final `RESULT: success|failure` line.
4. The judge reads the page's last reported state. Each record goes to the output file (`results/runs.jsonl` by default), and each agent's event stream to `raw/` next to it.
5. Nothing else may drive a Chrome meanwhile. During every run the harness watches for automated Chromes that were not there when the bench started (headless, remote debugging, their own `--user-data-dir`), and afterwards checks that the bench's Chrome still shows exactly one window. A run that fails either check is not recorded: it goes to `interfered.jsonl`, the bench waits until the other Chrome is gone, and the run is done again. Chromes already running before the bench started are noted and not waited for. If the bench's own window is lost three times in a row with no other Chrome around, the agent did it, and the run is recorded as it stands.

Harness settings:

- **Claude Code**: `claude -p --model claude-opus-5-5 --tools "" --strict-mcp-config --setting-sources ""` with only the one MCP server allowed: no built-in tools, and no user or project settings (no CLAUDE.md, hooks or plugins). Default effort, and none of the calling session's `CLAUDE_*` environment.
- **Codex**: `codex exec --json --ephemeral -m <model>` in its own `CODEX_HOME` (the user's login, nothing else), `model_reasoning_effort = "medium"`, read-only sandbox, `approval_policy = "never"`, web search off, and the shell, plugins, apps, computer use, browser and sub-agents turned off. Codex reaches MCP tools through its code-mode host, which stays on; no shell command is available.
- **cua-driver** as the MCP server: `bring_to_front`, `move_cursor`, `kill_app`, `launch_app`, `get_desktop_state` and a few others are denied.
- Runs are one at a time (one desktop). A run is stopped after 15 minutes and fails. While the screen is locked, the bench waits; `caffeinate` keeps the display awake meanwhile.

## Usage

Requirements: macOS, Node 24, Google Chrome, `cua-driver` at `~/.local/bin/cua-driver` with Accessibility and Screen Recording, and the agents you want to run (`claude`, `codex`, logged in). For cua-jev, its build at `~/organizations/open-source/cua-jev/dist/cli.js` (edit `CUA_JEV` in [`harness/agents.ts`](harness/agents.ts)).

```sh
npm install
npm run build                      # the app → dist/app
npm test
npm run bench -- --reps 3          # all agents × both tool sets × 12 Basic tasks
npm run bench -- --agents gpt-6-sol --tools cua-jev --only date-picker
npm run bench -- --suite hard --dry  # load every Hard task once, no agent: each loads alone and does not already pass
npm run bench -- --suite hard --reps 2 --out results/hard/runs.jsonl
npx tsx harness/wait.ts            # wait for the running bench to exit (by the pid in .work/bench.lock)
npm run summarize -- --in results/hard/runs.jsonl   # summary.{json,md} and report-data.json next to it
npm run serve -- date-picker       # look at one task in a browser
```

An interrupted bench resumes: a run already in the output file is skipped. While a bench runs, `.work/bench.lock` holds its pid; wait on that pid with `harness/wait.ts`, never on a process name (`pgrep -f` matches the waiter itself).

## Results

### Basic

**Do not run another Chrome while the bench runs**, not even headless. On 2026-09-24 a headless Chrome started for screenshots coincided with a stray "New Tab" window appearing in the bench's Chrome, and the harness then (before the guard above) sometimes gave agents that window. Those 53 runs are kept apart in `results/invalid/` and were run again.

Run 2026-09-24/25: 4 models × 2 tool sets × 12 tasks × 3 reps = 288 runs, all one after another (3.6 hours of agent time). Full table: [`results/summary.md`](results/summary.md). Write-up: https://hooly.jp/arts-and-crafts/screen-ops-bench-2026-09/

| agent · tools | pass | false success | time s (median) | tokens/run (median) | USD/run |
|---|---|---|---|---|---|
| Opus 5.5 · cua-jev | 36/36 | 0 | 30.3 | 67k | 0.098 |
| Opus 5.5 · cua-driver | 36/36 | 0 | 26.3 | 428k | 0.567 |
| GPT-6 Astra · cua-jev | 36/36 | 0 | 38.4 | 129k | 0.331 |
| GPT-6 Astra · cua-driver | 36/36 | 0 | 50.2 | 281k | 0.727 |
| GPT-6 Sol · cua-jev | 36/36 | 0 | 38.0 | 153k | 0.067 |
| GPT-6 Sol · cua-driver | 36/36 | 0 | 52.4 | 388k | 0.179 |
| GPT-6 Luna · cua-jev | 36/36 | 0 | 34.5 | 154k | 0.003 |
| GPT-6 Luna · cua-driver | 31/36 | 0 | 34.9 | 434k | 0.011 |

- The tasks turned out easy for these models: 283 of 288 runs passed, and all five failures were GPT-6 Luna with cua-driver (the slider three times, the notes text once, the country select once).
- No run claimed success on a failure. Two Luna · cua-jev runs said `failure` on a task they had done.
- The tool set moved cost more than the score: cua-driver runs read 2.2–6.4× the tokens (median per run) (the whole AX tree at every look) and cost 2.2–5.8× as much per run (mean).
- One Sol · cua-driver run brought Chrome to the front for about 4 s (20 samples), after a `type_text` at window coordinates.
- Jev, inside cua-jev: 1,190 calls, 4.4M input tokens, about $0.19 in all.

Files: `runs.jsonl` (one record per run), `summary.{md,json}`, `report-data.json` (what the write-up plots), `meta.json` (versions), `raw-streams.tar.xz` (every agent's event stream), `pilot/` (the Opus · cua-jev pilot before three cua-jev fixes, not counted), `invalid/` (the 53 wrong-window runs, not counted).

### Hard

Run 2026-09-25: 4 models × 2 tool sets × 4 Hard tasks × 2 reps = 64 runs (2.2 hours of agent time, $36.75 of model cost at list price). To keep the cost down, the four tasks were fixed by rule before the run: the first task of each group in file order (`ledger-refund`, `support-refund`, `profile-tabs-save`, `pr-reviewers`). Four runs of `tickets-bulk-archive` made before that cut are kept in `results/hard/dropped-tasks.jsonl` and not counted. Before the run, a pilot with Opus 5.5 · cua-driver passed all 16 tasks once (`results/hard-pilot/`, not counted), so no task is unsolvable. No run was interfered with. Full table: [`results/hard/summary.md`](results/hard/summary.md). Write-up: https://hooly.jp/arts-and-crafts/cua-jev-vs-cua-driver-2026-09/

| agent · tools | pass | false success | time s (median) | tokens/run (median) | USD/run |
|---|---|---|---|---|---|
| Opus 5.5 · cua-jev | 6/8 | 0 | 113.5 | 475k | 0.433 |
| Opus 5.5 · cua-driver | 6/8 | 2 | 89.0 | 1872k | 1.390 |
| GPT-6 Astra · cua-jev | 5/8 | 0 | 115.9 | 438k | 0.771 |
| GPT-6 Astra · cua-driver | 8/8 | 0 | 123.4 | 593k | 1.328 |
| GPT-6 Sol · cua-jev | 4/8 | 0 | 122.5 | 472k | 0.237 |
| GPT-6 Sol · cua-driver | 7/8 | 1 | 145.6 | 1063k | 0.403 |
| GPT-6 Luna · cua-jev | 1/8 | 1 | 103.0 | 452k | 0.010 |
| GPT-6 Luna · cua-driver | 5/8 | 0 | 83.9 | 946k | 0.021 |

- cua-jev passed 16/32 and cua-driver 26/32. Paired by model, task and rep: 13 pairs only cua-driver passed, 3 only cua-jev.
- Most of cua-jev's losses come from two controls it has no action for: a plain `<input type="number">` in a table (`support-refund`, 0/8 with cua-jev, every model stopped there and said so) and clicking a suggestion in a combobox list (`pr-reviewers`, where Enter picks a pre-highlighted wrong person; only Opus found a way around it). On the other two tasks cua-jev passed 13/16 and cua-driver 12/16.
- False successes: 3 with cua-driver, 1 with cua-jev, all on `profile-tabs-save` (a tab's changes left unsaved).
- cua-driver cost 1.7–3.2× as much per run (Basic: 2.2–5.8×). Per pass, cua-jev was cheaper only for Opus.
- Jev, inside cua-jev: 1,339 calls, 5.6M input tokens, about $0.24 in all.

Files in `results/hard/`: `runs.jsonl`, `summary.{md,json}`, `report-data.json`, `meta.json` (versions, plan, task selection), `bench.log`, `raw-streams.tar.xz`, `dropped-tasks.jsonl`.

## License

MIT
