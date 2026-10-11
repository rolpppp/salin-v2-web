# Usage ledger

"Reported" is the `subagent_tokens` figure from each agent's completion notice (roughly its final context size). "Cache reads" is summed from the agent's transcript: re-reading cached context on every tool call. Plan limits weight cache reads much lower than fresh tokens, but they show relative cost. PM (Opus) usage isn't reported per turn.

| When (Oct 11) | Agent | Model | Ticket(s) | Reported | Cache reads | Tool calls | Duration |
|---|---|---|---|---|---|---|---|
| 13:40 | money | sonnet | lib/money + enums | 156,782 | 3.0M | 31 | 9.0 min |
| 13:43 | scaffold | sonnet | 1 | 136,916 | 2.6M | 29 | 9.5 min |
| 13:52 | db | sonnet | 2, 6 | 129,427 | 1.9M | 37 | 13.1 min |
| 13:47 | money (fix round) | sonnet | lib/money fixes | +~5,000 | +0.3M | 2 | 0.6 min |

**Running total (agents, reported):** ~537K + 2 stopped Wave 2 agents (sql, auth-today; not reported) · cache reads ~7.8M+

| 14:35 | mobile-compat | sonnet | 5 | 108,818 | — | 32 | 5.4 min (incl. uuid fix) |

**Wave 1 closed** (Oct 11, ~14:00): 3 agents, ~33 min wall clock in parallel.

**Session 2 (Oct 11, resumed):** Docker wedged, so local DB moved to native PG17 (P-7).

| When (Oct 11) | Agent | Model | Ticket(s) | Reported | Cache reads | Tool calls | Duration |
|---|---|---|---|---|---|---|---|
| ~21:30 | sql-engine (finish) | sonnet | 7 | 260,191 | — | 56 | 15.3 min |
| ~22:10 | plans-split-income | sonnet | 8, 9 | 251,002 | — | 52 | 12.8 min |
| ~22:10 | money-in | sonnet | 10 | 276,786 | — | 56 | 13.3 min |
| ~22:10 | plans-accounts | sonnet | 13 | 268,441 | — | 66 | 13.8 min |
| ~22:40 | transfers | sonnet | 11 | 158,006 | — | 34 | 6.7 min |

**Wave 3 closed** (Oct 11): 4 agents, ~1.07M reported tokens. Session 2 total (5 agents incl. ticket 7): ~1.21M reported.


**Session 3 (Oct 11, resumed): Wave 4.** Docker still wedged (Desktop running, no engine socket); e2e still not run.

| When (Oct 11) | Agent | Model | Ticket(s) | Reported | Cache reads | Tool calls | Duration |
|---|---|---|---|---|---|---|---|
| ~23:25 | log-spending | sonnet | 19 | 208,192 | — | 77 | 9.6 min |
| ~23:30 | review | sonnet | 14 | 281,434 | — | 74 | 15.3 min |
| ~23:30 | today | sonnet | 12 | 323,002 | — | 74 | 15.8 min |

**Wave 4 closed** (Oct 11): 3 agents in parallel, ~813K reported tokens, ~16 min wall clock. PM resolved three merge conflicts (Today page, LogSpendingSlot, covers.ts) and removed a double `cover_used` event.


**Wave 5a (Oct 12).** PM wrote the P-8 contracts (`lib/onboarding/draft.ts`, `step.ts`) first so three agents could run in parallel.

| When (Oct 12) | Agent | Model | Ticket(s) | Reported | Cache reads | Tool calls | Duration |
|---|---|---|---|---|---|---|---|
| ~00:20 | onboarding-steps | sonnet | 17/20 (shared steps) | 181,619 | — | 51 | 9.0 min |
| ~00:30 | onboarding-sql | sonnet | 16, 18 (SQL) | 297,780 | — | 60 | 15.8 min |
| ~00:40 | onboarding-shell | sonnet | 17 | 337,646 | — | 85 | 21.0 min |

**Wave 5a done** (Oct 12): 3 agents, ~817K reported. PM merge fixes: CSS module clash, duplicate RPC types, shell test walking the real steps.

