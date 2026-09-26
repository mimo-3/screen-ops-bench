# Speeding up GPT-6 Sol · cua-driver

Run 2026-09-26/27. Question: where does a Codex run on plain cua-driver spend its time, and how much of it can standing instructions and settings remove without losing passes?

Every event in a run's stream now carries `_ms`, its arrival time from the start, and [`harness/timing.ts`](../../harness/timing.ts) splits the wall time into model time and tool time (from a tool call's start to its end). Calls that start within 500 ms of the previous call's end came out of the same model reply, so "turns" counts the replies that led to tool calls.

## Where the time goes (baseline)

Basic, 24 runs, medians: 49.1 s wall, of which 41.6 s is the model and 7.4 s the tools. The first tool call starts after 15.8 s. A reply takes about 4 to 6 s, while a tool call takes 0.15 s (`get_window_state` without a screenshot) to about 2.5 s (`click` through AXPress in Chrome). So the lever is the number of replies, not the tools.

What the baseline did with those replies: an opening message and plan before the first call, `start_session`/`end_session`, one action per reply with a fresh `get_window_state` (often with a screenshot) after each, `set_value` on a native select (which fails) and then the popup by hand, and in one run a second Save.

## Variants (Basic, 12 tasks × 1 rep unless noted)

| variant | pass | wall s | first call s | model s | tool s | calls | turns | tokens k |
|---|---|---|---|---|---|---|---|---|
| baseline (2 reps) | 24/24 | 49.1 | 15.8 | 41.6 | 7.4 | 11 | 6 | 342 |
| guide v1 | 11/12 | 39.9 | 12.9 | 33.2 | 8.8 | 7.5 | 6 | 299 |
| Codex `code_mode` | 12/12 | 61.7 | 17.1 | 53.3 | 7.1 | 11 | 7 | 408 |
| effort low | 12/12 | 45.5 | 11.6 | 38.4 | 6.3 | 11.5 | 6 | 338 |
| guide v2 | 12/12 | 38.1 | 13.0 | 28.5 | 7.5 | 7.5 | 4 | 219 |
| guide v2 + effort low + fewer tools | 12/12 | 31.1 | 8.6 | 21.8 | 7.5 | 7.5 | 3.5 | 164 |
| **guide v3 + effort low + fewer tools (2 reps)** | **24/24** | **30.0** | 7.3 | 21.5 | 7.8 | 7.5 | 4 | 181 |
| guide v3 + effort none + fewer tools | 12/12 | 30.3 | 9.6 | 22.6 | 8.5 | 7.5 | 3.5 | 168 |
| guide v4 + effort low + fewer tools | 12/12 | 39.5 | 9.8 | 27.5 | 8.8 | 10.5 | 5 | 243 |

- Guides: [`guides/`](guides). v1 says look once and act several times. v2 adds: no opening message, several tool calls in one reply, no second Save (v1's one failure was a double save). v3 adds how to pick a native select. v4 asks for a `query` on every later look; it trimmed what the model saw too far, and it looked again more often.
- Fewer tools: the cua-driver tools in [`deny.txt`](deny.txt) (sessions, cursor styling, config and diagnostics) are hidden on top of the bench's usual deny list.
- `code_mode` (under development in Codex 0.156) did not change how Sol called tools and was slower.
- Effort `none` was as fast as `low` but had one runaway run (volume-slider, 47 calls), so `low` was kept.

## Confirmation: v3 + effort low + fewer tools

| suite | runs | pass | false success | wall s median | wall s mean | total s | USD/run |
|---|---|---|---|---|---|---|---|
| Basic, baseline | 24 | 24 | 0 | 49.1 | 69.2 | 1661 | 0.172 |
| Basic, v3 | 24 | 24 | 0 | 30.0 | 31.8 | 764 | 0.092 |
| Hard (4 tasks × 2), baseline | 8 | 7 | 1 | 161.4 | 160.5 | 1284 | 0.344 |
| Hard (4 tasks × 2), v3 | 8 | 8 | 0 | 60.6 | 89.6 | 717 | 0.243 |

The Hard tasks are the four used in `results/hard/` (`ledger-refund`, `support-refund`, `profile-tabs-save`, `pr-reviewers`). Median speed-up: 1.64× on Basic and 2.66× on Hard; total time 2.2× and 1.8×. No focus steals in any run. The guide was tuned on the Basic tasks, so the Hard runs are the fairer test; `support-refund` stayed slow (157 s and 223 s), because a plain number input in a table takes many steps either way.

To reproduce the chosen variant:

```sh
npx tsx harness/run.ts --agents gpt-6-sol --tools cua-driver --reps 2 \
  --variant v3low --guide results/speed/guides/v3.md --effort low --deny "$(cat results/speed/deny.txt)" \
  --out results/speed/v3low.jsonl
npx tsx harness/timing.ts results/speed/v3low.jsonl
```

[`confirm.sh`](confirm.sh) runs the whole confirmation round. Every stream is in `raw-streams.tar.xz`.
