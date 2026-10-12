# Behavioural evals

These check that two contrasting personas notice *different* things given the same scenario, by more than one persona differs from itself across runs. See `evals/author/README.md` for the separate suite that checks the `author` skill itself, and `evals/panel/README.md` for the suite that checks the `panel` skill, and `evals/propose/README.md` for the suite that checks its lineup proposals. `evals/cost/README.md` explains the cost those suites report, and how to measure it for reviews run by hand.

    npx tsx evals/run.ts --dry-run          # resolve and print both panel prompts; no API calls
    npx tsx evals/run.ts --k 3              # 2 personas × 3 scenarios × 3 runs = 18 `claude -p` calls
    npx tsx evals/run.ts --k 5 --model opus

`--k` must be a plain integer ≥ 2 (a usage error otherwise, exit 1): with `--k 1` there is no way to measure a persona's within-run noise, which makes it look perfectly consistent (`within` = 0) and lets a persona-blind model pass. `--dry-run` never makes a `claude` call, whatever other flags are given; `--model`/`--k` reject a missing value instead of silently swallowing the next flag (so `--model --dry-run`, for instance, is a usage error rather than a real run that treats `--dry-run` as a model name).

The two personas come from `evals/pool/.claude/personas/`, not from the shipped `personas/`
folder. The pool is a copy of `guardian`, `accelerator` and their units from when the suite was
written, with bare unit names; it doesn't follow later edits to the shipped units, and its units
already differ from them. The panel eval (`evals/panel/`) copies the same pool into its project.

The suite calls `claude -p` once per (persona, scenario, run) with no tools and the persona's panel prompt as the system prompt — there is no retry. Each reply is run through the judgment validator and classified as:

- **valid** — parses and passes `validateJudgment`;
- **invalid** — parses (has a `verdict` string and a `findings` array) but fails `validateJudgment`; still used for the metrics (see "Why every parseable reply counts" below), but capped and reported separately;
- **unparseable** — not JSON, or JSON without a `verdict`/`findings` shape; excluded from the metrics and counted, never silently dropped;
- **call error** — the `claude -p` invocation itself failed (non-zero exit, spawn error, or an `is_error` envelope); also excluded and counted separately from `unparseable`.

## Isolation

Each `claude -p` call runs with its `cwd` set to a fresh, empty temp directory (removed after the call) and with:

- `--safe-mode` — disables CLAUDE.md auto-discovery, skills, installed plugins, hooks, MCP servers, custom commands/agents, output styles and other user/project customizations;
- `--setting-sources ''` — loads no user, project or local settings;
- `--strict-mcp-config` — no MCP servers beyond those from `--mcp-config` (none is passed, so zero);
- `--no-session-persistence` — the call is not saved as a resumable session.

Together these stop the machine running the eval — its `CLAUDE.md`, auto-memory, plugin `SessionStart` hooks, and MCP servers — from leaking into either persona's prompt or reply, which would add noise and make results depend on the machine. Verified live: the same prompt run without these flags, from this repo, surfaced a plugin's `SessionStart` hook ("You have superpowers...") in context; with the flags and an empty cwd, that reminder is absent. `--bare` would be a cleaner single flag but needs `ANTHROPIC_API_KEY` (it does not read OAuth credentials), so it is not used here.

## Reading the result

- `within`: how much a persona disagrees with itself across runs (noise), over every parseable reply.
- `between`: how much guardian and accelerator disagree, measured only on the units they share. A unit counts as flagged or not flagged, and the severity is compared when both flag it. Also over every parseable reply.
- `verdict`: one of `pass`, `fail`, `inconclusive` (see below), with `reasons` explaining it. The process exits 0 on `pass`, 2 on `inconclusive`, 1 on `fail` or a usage error.
- The printed table and the `cells` field of the summary report `parseable`/`invalid`/`unparseable`/`callErrors` per persona × scenario, so uneven validity between personas is visible instead of hidden inside one aggregate count.
- `outsideScope`: the share of findings raised outside the persona's units, over every parseable reply. A high value means the persona is leaking concerns.
- `atThreshold`: the share of findings exactly at the unit's threshold, counted only over the units the two personas share and neither deprioritizes — a deprioritized unit's effective threshold is always `critical`, which would otherwise inflate this rate by construction for whichever persona deprioritizes it. A high value may mean the model is inflating severities to clear the threshold.

### Verdict

`verdictFor` in `evals/metrics.ts` makes this decision, and is unit-tested directly (no `claude` calls needed):

1. **`inconclusive`** if any persona × scenario cell has fewer than 2 **parseable** replies (valid or invalid, just not unparseable/a call error). Below 2, the within-persona distance for that cell is 0 by construction (there's nothing to compare), which looks like perfect consistency rather than "we don't have enough signal."
2. **`inconclusive`** if any persona's invalid rate — `invalid / parseable`, as a share of that persona's own parseable replies — exceeds 20%. A persona-blind model that happens to produce a lot of replies invalid for one persona's thresholds still has to clear this cap to be measured at all.
3. Otherwise **`pass`** if `between ≥ 0.25` and `between ≥ 2 × within`, else **`fail`**.

**Why every parseable reply counts:** `within`/`between` are computed over *every parseable reply, valid or invalid* — not just the ones that pass `validateJudgment` for that persona. The original design excluded invalid replies from the metrics entirely; a later review found that this let a persona-blind model pass about 1 time in 2 (up to 14/30 runs in one configuration): each persona's two different threshold sets picked out different members of the *same* underlying reply distribution (e.g. a reply mentioning `rollback-safety` at `medium` is valid for guardian but invalid for accelerator, and vice versa for `user-value`), and retrying a rejected reply just resampled until something survived the filter, while the counted "malformed" rate stayed low. Selecting on validity was the bug — a model is free to produce findings a given persona's validator would reject without that meaning the model behaved differently per persona. Counting every parseable reply removes that lever: a blind model gives both personas the same distribution, so `between` should not clear the bar beyond sampling noise. A tuned adversarial probe against this fix still found 2 passes in 600 runs at `--k 3` (pure sampling noise, not selection — the two personas see identical distributions), and 0 in several hundred runs at `--k 5`; **use `--k 5` or more for a firmer result** if the stakes call for it. Validity is now a secondary, reported quality signal (step 2 above), not a filter on the primary metric. **There are no retries** — they only existed to reduce how often a reply got excluded, which no longer matters once nothing is excluded for failing validation.

Results are written to `evals/results/` (git-ignored). This suite is not part of CI: it costs money and is non-deterministic.
