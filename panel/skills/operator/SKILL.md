---
name: operator
description: Validate, explain, or render personas and units from the aska plugin (files named <name>.persona.md and <name>.unit.md under .claude/personas/ or ~/.claude/personas/). Use when the user asks to check a persona, see what a persona resolves to, review override clashes, or generate a persona's output style and panel subagent.
---

# operator

This skill wraps a bundled CLI. Run it with Node (version 20 or later) from this skill's base directory, which Claude Code shows when the skill loads:

    node "<base directory>/scripts/persona.mjs" <command>

Run it from the user's project directory, so that the project scope (`.claude/personas/`) is found.

| Command | Use it to |
|---|---|
| `validate` | check every persona, unit and panel in every scope, and report stale generated files and untyped files |
| `validate <name>` | check one persona |
| `explain <name>` | show the effective persona (units by tier, thresholds, tools), the clash report, and the prompt |
| `render <name>` | write `<name>.persona.md` (`<plugin>--<name>.persona.md` for a plugin persona) into `output-styles/` and `agents/` of the most specific scope its inputs need: `.claude/` if it uses project files, otherwise `~/.claude/`. The agent and style are named `<name>-persona`. `--scope project` forces the project scope. |
| `render <name> --scope user` | write into `~/.claude/` instead (not allowed when the persona uses project files) |
| `list [units\|personas\|panels] [--json]` | show every unit, persona and panel in every scope (name, scope, description, threshold or `extends`, shadowed and invalid markers); `--json` for machine-readable output; persona rows in `--json` also carry `units`, the resolved units by tier |
| `prompt <name> --panel [--checks <targets.json>]` | print a persona's panel prompt (the JSON judgment contract it should be asked for); with `--checks`, it also lists the review targets and asks for a `checks` entry per target |
| `check-judgment <name> [--file <path>] [--checks <targets.json>]` | validate a judgment against a persona's contract; reads the JSON from `<path>` or stdin; with `--checks`, also check that every target is answered exactly once |
| `check-evidence [--file <path>]` | validate an investigator's evidence: the four sections `## Checked`, `## Ran`, `## Found` and `## Not determined`, in order, each with content; reads the markdown from `<path>` or stdin |
| `compare [--file <path>] [--json] [--record]` | compare a panel's judgments (panel-result JSON) and report where they agree, disagree and what to follow up on; reads from `<path>` or stdin; `--record` also updates the kept run's `meta.json` |
| `runs new` | create a kept panel-run folder in `~/.claude/aska/runs/` (or `$ASKA_RUNS_DIR` when set) and print its path |
| `runs list [--json]` | list kept panel runs, newest first |
| `targets --from <file.md> [--out <targets.json>]` | extract a step file's `## Adversarial review targets` as numbered targets (`T1`, `T2.1`, …); exits 1 if the file can't be read or has no such section or no bullets |
| `gate [<name>] --file <judgment.json> --checks <targets.json> [--json]` | decide a gate judgment as persona `<name>` (default `gate`): `pass` or `pass-with-conditions` (exit 0), or `fail` (exit 1); an unreadable or invalid targets file exits 2 |
| `show <kind> <name> [--scope project\|user\|plugin] [--json]` | print one file as data (fields, sections, raw, hash) |
| `save <kind> <name> --scope project\|user --file <md> [--expect-hash <h>] [--json]` | check a whole file as if it were already in place, then write it; refuse on errors |
| `patch <kind> <name> --scope project\|user --file <json> [--expect-hash <h>] [--json]` | apply form edits (`set`, `unset`, `sections`) to a file or a new one, keeping everything it doesn't touch, then check and write it |
| `delete <kind> <name> --scope project\|user [--force] [--expect-hash <h>] [--json]` | remove a file; list what would break and refuse unless `--force` |

Exit code 0 means no errors, 1 means errors were reported, and 2 means the command line was wrong.

When reporting back:
- Quote diagnostics with their code and `file:line`, and suggest the printed fix.
- For an unreviewed clash, explain both choices. Adding `<id>: child` under `overrides:` keeps the child's value and marks it reviewed. `<id>: parent` flips it so the parent wins.
- After `render`, remind the user to restart Claude Code before choosing the new output style.

To write or tune a persona, use the `/aska:author` skill instead.
