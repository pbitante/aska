# Cost

Every run of the `panel`, `author` and `propose` suites prints a `cost:` line and records
`cost` in its results JSON. To compare the cost of reviews run by hand (for example a general
review against an `aska:code` panel), point the script at their Claude Code transcripts:

    npx tsx evals/cost/run.ts general="$HOME/.claude/projects/<project>/<sessionId>.jsonl" panel="$HOME/.claude/projects/<project>/<sessionId>.jsonl"
    npx tsx evals/cost/run.ts general=… panel=… --json

Each `<label>=<path>` is one source. A session's sub-agents (panelists, investigators) are read
from `<sessionId>/subagents/*.jsonl` next to its transcript, so a panel run counts all of its
agents. The first source is the baseline for the ratio. Run each review in its own session, or
the session's other work is counted too.

## What it counts

- **Tokens per model:** input, cache writes, cache reads and output, from each assistant message,
  counting each message id once (a message streams as several lines that share its id). A few
  transcript messages record only the output counted when they started, so a transcript's cost
  is a slight lower bound.
- **Input-equivalent:** the tokens at the input price: cache writes 1.25× (5-minute) or 2×
  (1-hour), cache reads 0.1×, output 5×. This is what makes two sources comparable.
- **Dollars:** only for `stream-json` output, from its `result` event (`total_cost_usd`).
  There, the per-model totals also come from the `result` event, since streamed messages
  carry only the output counted when each started.

Input-equivalent doesn't weigh models against each other: a source that runs some panelists on
a cheaper model (a panel's `models`) is cheaper than its input-equivalent says. Compare such
sources by their per-model rows, or by dollars.
