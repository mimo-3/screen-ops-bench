# screen-ops-bench

A small benchmark for agents that operate a screen. Twelve tasks run in a web app (React) shown in a Google Chrome window on macOS. The agent gets the window's pid and id, one MCP server to see and act with, and a task in plain English. Success is decided **only** by the state the app itself reports at the end, compared with the task's expected state by exact equality.

It was written to compare models and tool sets for background computer use: Claude Code (`claude -p`) and Codex (`codex exec`) as harnesses, and [cua-jev](https://github.com/mimo-3/cua-jev) or plain [cua-driver](https://github.com/trycua/cua) as the MCP server.

## Tasks

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
2. For each run it points the page at the task through `/api/control`. The page loads the task with fresh state, so no run sees another's leftovers.
3. The agent runs headless with the same prompt: the target pid and window id, "work in the background", the task, and a final `RESULT: success|failure` line.
4. The judge reads the page's last reported state. Each record goes to `results/runs.jsonl`, and each agent's event stream to `results/raw/`.

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
npm run bench -- --reps 3          # all agents × both tool sets × 12 tasks
npm run bench -- --agents gpt-6-sol --tools cua-jev --only date-picker
npm run summarize                  # results/summary.{json,md}
npm run serve -- date-picker       # look at one task in a browser
```

An interrupted bench resumes: a run already in the output file is skipped.

## Results

See [`results/summary.md`](results/summary.md) and the write-up linked there.

## License

MIT
