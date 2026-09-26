#!/bin/zsh
# Confirmation round: a second rep on Basic, and 4 Hard tasks × 2 reps, for the baseline and the chosen variant.
cd "$(dirname "$0")/../.."
D=$(cat results/speed/deny.txt)
H=ledger-refund,support-refund,profile-tabs-save,pr-reviewers
b(){ npx tsx harness/run.ts --agents gpt-6-sol --tools cua-driver "$@"; }
b --reps 2 --out results/speed/baseline.jsonl >> results/speed/baseline.log 2>&1
b --reps 2 --variant v3low --guide results/speed/guides/v3.md --effort low --deny $D --out results/speed/v3low.jsonl >> results/speed/v3low.log 2>&1
b --suite hard --only $H --reps 2 --out results/speed/hard-baseline.jsonl > results/speed/hard-baseline.log 2>&1
b --suite hard --only $H --reps 2 --variant v3low --guide results/speed/guides/v3.md --effort low --deny $D --out results/speed/hard-v3low.jsonl > results/speed/hard-v3low.log 2>&1
