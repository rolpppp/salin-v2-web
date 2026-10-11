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
