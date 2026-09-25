# Summary (64 runs)

## Overall

| agent · tools | pass | partial | false success / claims | time s (median) | tool calls (median) | tokens/run (median) | output tokens/run (mean) | USD/run | USD total | Jev calls | focus steals |
|---|---|---|---|---|---|---|---|---|---|---|---|
| opus-5.5 · cua-driver | 6/8 (75%) | 75% | 2/8 | 89 | 30.5 | 1872.2k | 5433 | $1.390 | $11.12 | 0 | 0 |
| opus-5.5 · cua-jev | 6/8 (75%) | 75% | 0/6 | 113.5 | 25.5 | 475.2k | 5141 | $0.433 | $3.47 | 434 | 0 |
| gpt-6-astra · cua-jev | 5/8 (63%) | 63% | 0/5 | 115.9 | 19 | 437.6k | 1133 | $0.771 | $6.17 | 205 | 0 |
| gpt-6-astra · cua-driver | 8/8 (100%) | 100% | 0/8 | 123.4 | 24.5 | 592.5k | 1662 | $1.328 | $10.62 | 0 | 0 |
| gpt-6-sol · cua-driver | 7/8 (88%) | 88% | 1/8 | 145.6 | 32 | 1062.5k | 2933 | $0.403 | $3.23 | 0 | 0 |
| gpt-6-sol · cua-jev | 4/8 (50%) | 56% | 0/4 | 122.5 | 21.5 | 472.1k | 2247 | $0.237 | $1.89 | 323 | 0 |
| gpt-6-luna · cua-jev | 1/8 (13%) | 25% | 1/2 | 103 | 20 | 452.3k | 1777 | $0.010 | $0.08 | 377 | 0 |
| gpt-6-luna · cua-driver | 5/8 (63%) | 63% | 0/5 | 83.9 | 18.5 | 946.1k | 2174 | $0.021 | $0.17 | 0 | 4 |

## Per task

| agent · tools | pass | partial | false success / claims | time s (median) | tool calls (median) | tokens/run (median) | output tokens/run (mean) | USD/run | USD total | Jev calls | focus steals |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ledger-refund · opus-5.5 · cua-driver | 2/2 (100%) | 100% | 0/2 | 71.7 | 21.5 | 1865.5k | 3961 | $1.574 | $3.15 | 0 | 0 |
| ledger-refund · opus-5.5 · cua-jev | 2/2 (100%) | 100% | 0/2 | 90.4 | 21.5 | 446.8k | 3980 | $0.476 | $0.95 | 208 | 0 |
| ledger-refund · gpt-6-astra · cua-jev | 2/2 (100%) | 100% | 0/2 | 118.5 | 19 | 457.8k | 1054 | $0.935 | $1.87 | 128 | 0 |
| ledger-refund · gpt-6-astra · cua-driver | 2/2 (100%) | 100% | 0/2 | 119.1 | 20 | 845.4k | 1488 | $1.609 | $3.22 | 0 | 0 |
| ledger-refund · gpt-6-sol · cua-driver | 2/2 (100%) | 100% | 0/2 | 112.3 | 19 | 1057.1k | 2179 | $0.385 | $0.77 | 0 | 0 |
| ledger-refund · gpt-6-sol · cua-jev | 2/2 (100%) | 100% | 0/2 | 103.5 | 20.5 | 402.6k | 1623 | $0.193 | $0.39 | 168 | 0 |
| ledger-refund · gpt-6-luna · cua-jev | 0/2 (0%) | 50% | 0/0 | 59.3 | 11.5 | 308.2k | 1171 | $0.007 | $0.01 | 109 | 0 |
| ledger-refund · gpt-6-luna · cua-driver | 2/2 (100%) | 100% | 0/2 | 68.6 | 16.5 | 858.9k | 1583 | $0.015 | $0.03 | 0 | 0 |
| support-refund · opus-5.5 · cua-driver | 2/2 (100%) | 100% | 0/2 | 137.8 | 40 | 3134.0k | 5680 | $1.984 | $3.97 | 0 | 0 |
| support-refund · opus-5.5 · cua-jev | 0/2 (0%) | 0% | 0/0 | 159.1 | 35 | 909.2k | 7815 | $0.648 | $1.30 | 133 | 0 |
| support-refund · gpt-6-astra · cua-jev | 0/2 (0%) | 0% | 0/0 | 125.7 | 25.5 | 467.1k | 1467 | $0.819 | $1.64 | 49 | 0 |
| support-refund · gpt-6-astra · cua-driver | 2/2 (100%) | 100% | 0/2 | 159.5 | 35 | 974.6k | 2341 | $1.722 | $3.44 | 0 | 0 |
| support-refund · gpt-6-sol · cua-driver | 2/2 (100%) | 100% | 0/2 | 200.8 | 41.5 | 1971.6k | 3953 | $0.573 | $1.15 | 0 | 0 |
| support-refund · gpt-6-sol · cua-jev | 0/2 (0%) | 0% | 0/0 | 189.6 | 32 | 1067.1k | 3281 | $0.319 | $0.64 | 80 | 0 |
| support-refund · gpt-6-luna · cua-jev | 0/2 (0%) | 0% | 0/0 | 217 | 33.5 | 1057.7k | 2650 | $0.017 | $0.03 | 127 | 0 |
| support-refund · gpt-6-luna · cua-driver | 0/2 (0%) | 0% | 0/0 | 132.3 | 32.5 | 2149.5k | 2712 | $0.032 | $0.06 | 0 | 4 |
| profile-tabs-save · opus-5.5 · cua-driver | 0/2 (0%) | 0% | 2/2 | 149.1 | 72 | 1836.7k | 9566 | $1.151 | $2.30 | 0 | 0 |
| profile-tabs-save · opus-5.5 · cua-jev | 2/2 (100%) | 100% | 0/2 | 83.6 | 18 | 237.9k | 2641 | $0.211 | $0.42 | 34 | 0 |
| profile-tabs-save · gpt-6-astra · cua-jev | 2/2 (100%) | 100% | 0/2 | 94.6 | 16 | 305.3k | 856 | $0.650 | $1.30 | 0 | 0 |
| profile-tabs-save · gpt-6-astra · cua-driver | 2/2 (100%) | 100% | 0/2 | 129.3 | 30 | 503.0k | 1593 | $1.033 | $2.07 | 0 | 0 |
| profile-tabs-save · gpt-6-sol · cua-driver | 1/2 (50%) | 50% | 1/2 | 246.7 | 75.5 | 1103.3k | 3551 | $0.363 | $0.73 | 0 | 0 |
| profile-tabs-save · gpt-6-sol · cua-jev | 2/2 (100%) | 100% | 0/2 | 96.5 | 20 | 467.3k | 1321 | $0.194 | $0.39 | 0 | 0 |
| profile-tabs-save · gpt-6-luna · cua-jev | 1/2 (50%) | 50% | 1/2 | 93 | 17.5 | 329.0k | 1275 | $0.007 | $0.01 | 90 | 0 |
| profile-tabs-save · gpt-6-luna · cua-driver | 1/2 (50%) | 50% | 0/1 | 189.6 | 28.5 | 1176.5k | 2657 | $0.022 | $0.04 | 0 | 0 |
| pr-reviewers · opus-5.5 · cua-driver | 2/2 (100%) | 100% | 0/2 | 58.9 | 17.5 | 1255.5k | 2525 | $0.850 | $1.70 | 0 | 0 |
| pr-reviewers · opus-5.5 · cua-jev | 2/2 (100%) | 100% | 0/2 | 130.6 | 29 | 475.2k | 6128 | $0.399 | $0.80 | 59 | 0 |
| pr-reviewers · gpt-6-astra · cua-jev | 1/2 (50%) | 50% | 0/1 | 108.1 | 16.5 | 364.0k | 1157 | $0.681 | $1.36 | 28 | 0 |
| pr-reviewers · gpt-6-astra · cua-driver | 2/2 (100%) | 100% | 0/2 | 88.4 | 17.5 | 470.3k | 1226 | $0.948 | $1.90 | 0 | 0 |
| pr-reviewers · gpt-6-sol · cua-driver | 2/2 (100%) | 100% | 0/2 | 101.9 | 21.5 | 840.1k | 2048 | $0.293 | $0.59 | 0 | 0 |
| pr-reviewers · gpt-6-sol · cua-jev | 0/2 (0%) | 25% | 0/0 | 154.2 | 23 | 574.4k | 2765 | $0.241 | $0.48 | 75 | 0 |
| pr-reviewers · gpt-6-luna · cua-jev | 0/2 (0%) | 0% | 0/0 | 108.2 | 21.5 | 527.8k | 2011 | $0.010 | $0.02 | 51 | 0 |
| pr-reviewers · gpt-6-luna · cua-driver | 2/2 (100%) | 100% | 0/2 | 91.7 | 17.5 | 900.9k | 1744 | $0.016 | $0.03 | 0 | 0 |
