---
name: gate
description: Run the independent adversarial gate on a build step. Extracts the step file's adversarial review targets, has one fresh Opus reviewer judge the change as the aska:gate persona, validates its judgment, and reports pass, pass with conditions, or fail. Use when the user asks to gate a step, run a step's adversarial review, or invokes /aska:gate.
---

# gate

One fresh reviewer, on Opus, judges one build step as the `aska:gate` persona. It answers every review target listed in the step file, then reviews the change through its own concerns. The CLI validates its judgment and decides the result; you report it.

## Tools

First check that `<base directory>/../operator/scripts/persona.mjs` exists. If it doesn't, stop and say: "This skill must be used from the aska plugin (its operator skill and CLI are missing)."

Run the CLI from the user's project directory:

    node "<base directory>/../operator/scripts/persona.mjs" <command>

- `targets --from <step-file> --out <tmp>/targets.json`: the step's targets, numbered.
- `prompt gate --panel --checks <tmp>/targets.json`: the gate's prompt, with the targets.
- `check-judgment gate --file <tmp>/judgment.json --checks <tmp>/targets.json`: validate the judgment.
- `gate --file <tmp>/judgment.json --checks <tmp>/targets.json --json`: the result. It validates the judgment as the `gate` persona, whatever persona the judgment names, so it fails whenever `check-judgment gate` rejects it.

Always pass `--file`; never pipe a judgment on stdin.

## 1. Inputs

The user writes `/aska:gate <step-file> [<base>..<head>] [--records <dir>]`. If no step file is given, ask for it. `<records>` is `<dir>` when given, otherwise `.claude/aska/gates/<step-stem>/` in the project, where `<step-stem>` is the step file's name without `.md`. It's where step 8 saves gate records.

Without a range, work out the base: run `git rev-parse --verify -q origin/HEAD`; if it succeeds, the base is `git merge-base origin/HEAD HEAD`, otherwise `git merge-base main HEAD`. If that `merge-base` fails (no `origin/HEAD` and no `main`, or no common ancestor), say so and ask the user for an explicit `<base>..<head>` instead of guessing. Otherwise the range is `<base>..HEAD`.

## 2. Targets

Create a temporary folder outside the repository: `mktemp -d -t aska-gate-XXXXXX`. Run `targets --from <step-file> --out <tmp>/targets.json`. It exits 1 on an extraction error or 2 on a usage error; either way, show its message and stop. Otherwise say "Found <N> review targets in <step-file>."

## 3. Brief

Write `<tmp>/brief.md`:

- **Question:** Does this step pass its gate?
- **Subject:** `change`
- **Materials:** file paths the gate reads:
  - the step file;
  - the spec the step file names (a `**Spec:**` line, or a link into `specs/`); if it names none, a `**Spec:**` line in a `README.md` in the step file's folder. Say that the spec's Corrections section wins over its body;
  - `<tmp>/diff.patch`, written with `git diff <range>`;
  - `<tmp>/commits.txt`, written with `git log --reverse --stat <range>`.
- **Commands you may run:** the code block under the step file's `## Implementation check` heading, copied verbatim, or "none" if it has none. Run them in a throwaway worktree, never the user's checkout: `git worktree add --detach <tmp>/wt <head>` (the range's head). Before running the commands, install dependencies there from the project's lockfile (for example `npm ci`, `uv sync`), installing only inside that worktree. Then run the commands there, and `git worktree remove --force <tmp>/wt` when done. A failure caused by that setup, not by the change, is an environment problem: mark the affected targets `deferred` with `needs` naming the missing setup, never `broken`.
- **Out of bounds:** earlier gate records in `<records>`, and any implementer report. Judge the change from the materials and what you run, not from past verdicts.

The brief is neutral. It contains nothing from this conversation: no summary of the implementation, no account of how the work went, no view of yours.

## 4. Launch

Say that the gate is launching and what it will read. Launch exactly one `aska:gate-reviewer` subagent with model `opus`, with the description `gate-reviewer`. Its task is the output of `prompt gate --panel --checks <tmp>/targets.json`, then a line `---`, then the contents of `brief.md`, and nothing else. Never use a general-purpose agent in its place: `aska:gate-reviewer` has no file-editing tools and can't act outside the session. Never reuse an agent from earlier in this session, and never the agent that implemented the step.

## 5. Validate

Strip one surrounding code fence and nothing else from the reply, save it to `<tmp>/judgment.json`, and run `check-judgment gate --file <tmp>/judgment.json --checks <tmp>/targets.json`.

If it is invalid, re-ask once: a new `aska:gate-reviewer` subagent with model `opus` and the description `gate-reviewer re-ask`, whose task is the prompt, the brief, the previous reply, the violations, and "Reply with the raw JSON object only — no code fence." Save its reply over `judgment.json` the same way. If it is still invalid, go on: step 6 reports `fail` with the violations.

If a subagent fails or times out, say so with the exact reason and stop. There is no result.

## 6. Decide

Run `gate --file <tmp>/judgment.json --checks <tmp>/targets.json --json`. It exits 0 for `pass` or `pass-with-conditions` and 1 for `fail` — all three are a result; go on to Report. It exits 2 when there is no result: a usage error, or a judgment or targets file it can't read or that isn't a valid targets file. Stop and say so instead. Never state a result (pass, pass with conditions, or fail) without running `gate`.

## 7. Report

Sections, in order:

1. **Header:** the step file, the range, and the number of targets, with how many hold, are broken and are deferred. When most are deferred, add that the run verified little.
2. **Result:** `PASS`, `PASS WITH CONDITIONS` or `FAIL`.
3. **Broken:** for each `broken` ID, the target's text, then each finding whose `check` is that ID: severity, unit, claim, evidence.
4. **Deferred:** each `deferred` ID with its target text and `needs`.
5. **Conditions:** the judgment's conditions.
6. **Missing:** when the verdict is insufficient-information, the judgment's missing list.
7. **Other findings:** `findings_outside_targets`, in order, with each finding's evidence from the judgment.
8. **Violations:** only when the judgment is invalid.
9. **Next:**
   - `fail`: "Fix the findings, then run /aska:gate again; a re-run uses a fresh reviewer."
   - `pass-with-conditions`: "Fix and record the conditions. Deferred targets go wherever you track what was verified, for a later manual check. No re-run is needed."
   - `pass`: "The next step can start."
10. **Footer:** the temporary folder path. Keep the folder for the rest of the session.

Every line comes from the `gate --json` output, the judgment, or the targets file. Add no opinion of your own and no finding the gate didn't raise. Offer the full judgment on request.

## 8. Record

Ask: "Save this gate record to `<records>`?", naming the actual folder. The user may answer with another folder; use that instead. Write anything only after the user says yes:

1. Create the folder if it doesn't exist.
2. Find `<n>`: one more than the highest number found across existing `judgment-<n>.json` and `targets-<n>.json` files there (1 for the first run).
3. Copy `<tmp>/targets.json` to `<records>/targets-<n>.json` and `<tmp>/judgment.json` to `<records>/judgment-<n>.json`. Never overwrite an existing targets or judgment file.
4. Print this snippet for the user to paste wherever they track what was verified (a traceability file, the plan, a PR description):

   ```markdown
   - **Gate (aska, run <n>):** <RESULT> — broken: <IDs, or none>; deferred: <ID (needs), or none>. Record: `<records>/judgment-<n>.json`
   ```

Never edit a traceability file, or any other file, yourself. Anyone can re-check a saved record later with `gate --file <records>/judgment-<n>.json --checks <records>/targets-<n>.json`.
